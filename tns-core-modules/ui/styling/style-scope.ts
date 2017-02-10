import { ViewBase } from "ui/core/view-base";
import { SyntaxTree, Keyframes, parse as parseCss, Node } from "css";
import { RuleSet, SelectorsMap, SelectorCore, SelectorsMatch, ChangeMap, Declaration, fromAstNodes } from "ui/styling/css-selector";
import { write as traceWrite, categories as traceCategories, messageType as traceMessageType } from "trace";
import { File, knownFolders, path } from "file-system";
import * as application from "application";
import { ShorthandProperty, unsetValue } from "ui/core/properties";

import * as kam from "ui/animation/keyframe-animation";

let keyframeAnimationModule: typeof kam;
function ensureKeyframeAnimationModule() {
    if (!keyframeAnimationModule) {
        keyframeAnimationModule = require("ui/animation/keyframe-animation");
    }
}

import * as capm from "./css-animation-parser";
let cssAnimationParserModule: typeof capm;
function ensureCssAnimationParserModule() {
    if (!cssAnimationParserModule) {
        cssAnimationParserModule = require("./css-animation-parser");
    }
}

const animationsSymbol: symbol = Symbol("animations");

let pattern: RegExp = /('|")(.*?)\1/;

export class CssState {
    private setters: { [key: string]: string | any } = {};
    private animations = new Map<kam.KeyframeAnimationInfo, kam.KeyframeAnimation>();

    constructor(private view: ViewBase, private match: SelectorsMatch<ViewBase>) {
    }

    // TODO: Expose "SelectorsMatch<ViewBase>" property to be set when a view gets new CssState instead of making new CssState instances...

    public get changeMap(): ChangeMap<ViewBase> {
        return this.match.changeMap;
    }

    public apply(): void {
        // TODO: iOS views have some scoping that controls animations, apply something here.

        let newSelectors = this.match.selectors.filter(sel => sel.dynamic ? sel.match(this.view) : true);

        // TODO: Remove this:
        if (this.view.inlineStyleSelector) {
            newSelectors.push(this.view.inlineStyleSelector);
        }

        let newComputedCss: { [key: string]: string | any } = {};
        let newAnimations = new Map<kam.KeyframeAnimationInfo, kam.KeyframeAnimation>();
        newSelectors.forEach(s => {
            s.ruleset.declarations.forEach(d => {
                let values = ShorthandProperty._split(d);
                let shorthand = ShorthandProperty._split(d);
                if (shorthand) {
                    for (let [k, v] of shorthand) {
                        newComputedCss[k.cssLocalName] = v;
                    }
                } else {
                    newComputedCss[d.property] = d.value;
                }
            });
            let rulesetAnimations: kam.KeyframeAnimationInfo[] = s.ruleset[animationsSymbol];
            if (rulesetAnimations) {
                for(let info of rulesetAnimations) {
                    newAnimations.set(info, null);
                }
            }
        });

        this.animations.forEach((anim, info) => {
            if (anim.isPlaying && !newAnimations.has(info)) {
                anim.cancel();
            }
        });
        if (newAnimations.size > 0 && this.view.isLoaded && this.view.nativeView) {
            ensureKeyframeAnimationModule();
            newAnimations.forEach((animation, animationInfo) => {
                if (!this.animations.has(animationInfo)) {
                    let animation = keyframeAnimationModule.KeyframeAnimation.keyframeAnimationFromInfo(animationInfo);
                    newAnimations.set(animationInfo, animation);
                    animation.play(this.view);
                }
            });
            this.animations = newAnimations;
        } else {
            newAnimations.clear();
        }
        this.animations = newAnimations;

        let style = this.view.style;
        for (let property in this.setters) {
            if (!newComputedCss.hasOwnProperty(property)) {
                let cssPropName = `css:${property}`;
                if (cssPropName in style) {
                    style[cssPropName] = unsetValue;
                }
            }
        }
        for (let property in newComputedCss) {
            let value = newComputedCss[property];
            if (value !== this.setters[property]) {
                try {
                    let cssPropName = `css:${property}`;
                    if (cssPropName in style) {
                        style[cssPropName] = value;
                    } else {
                        this.view[property] = value;
                    }
                } catch (e) {
                    traceWrite(`Failed to apply property [${property}] with value [${value}] to ${this.view}. ${e}`, traceCategories.Error, traceMessageType.error);
                }
            }
        }
        this.setters = newComputedCss;
    }
}

export class StyleScope {

    private _selectors: SelectorsMap;

    // caches all the visual states by the key of the visual state selectors
    private _statesByKey = {};
    private _viewIdToKey = {};

    private _css: string;
    private _cssFileName: string;
    private _mergedCssSelectors: RuleSet[];
    private _localCssSelectors: RuleSet[] = [];
    private _localCssSelectorVersion: number = 0;
    private _localCssSelectorsAppliedVersion: number = 0;
    private _applicationCssSelectorsAppliedVersion: number = 0;
    private _keyframes = {};

    get css(): string {
        return this._css;
    }

    set css(value: string) {
        this._cssFileName = undefined;
        this.setCss(value);
    }

    public addCss(cssString: string, cssFileName?: string): void {
        this.setCss(cssString, cssFileName, true);
    }

    private setCss(cssString: string, cssFileName?: string, append: boolean = false): void {
        this._css = this._css && append ? this._css + cssString : cssString;
        if (cssFileName) {
            this._cssFileName = cssFileName;
        }

        this._reset();

        const parsedSelectors = StyleScope.createSelectorsFromCss(this._css, cssFileName, this._keyframes);

        if (append) {
            this._localCssSelectors.push.apply(this._localCssSelectors, parsedSelectors);
        } else {
            this._localCssSelectors = parsedSelectors;
        }

        this._localCssSelectorVersion++;
        this.ensureSelectors();
    }

    public getKeyframeAnimationWithName(animationName: string): kam.KeyframeAnimationInfo {
        let keyframes = this._keyframes[animationName];
        if (keyframes !== undefined) {
            ensureKeyframeAnimationModule();
            let animation = new keyframeAnimationModule.KeyframeAnimationInfo();
            ensureCssAnimationParserModule();
            animation.keyframes = cssAnimationParserModule.CssAnimationParser.keyframesArrayFromCSS(keyframes);
            return animation;
        }
        return undefined;
    }

    public static createSelectorsFromCss(css: string, cssFileName: string, keyframes: Object): RuleSet[] {
        try {
            let pageCssSyntaxTree = css ? parseCss(css, { source: cssFileName }) : null;
            let pageCssSelectors: RuleSet[] = [];
            if (pageCssSyntaxTree) {
                pageCssSelectors = pageCssSelectors.concat(StyleScope.createSelectorsFromImports(pageCssSyntaxTree, keyframes));
                pageCssSelectors = pageCssSelectors.concat(StyleScope.createSelectorsFromSyntaxTree(pageCssSyntaxTree, keyframes));
            }
            return pageCssSelectors;
        } catch (e) {
            traceWrite("Css styling failed: " + e, traceCategories.Error, traceMessageType.error);
        }
    }

    public static createSelectorsFromImports(tree: SyntaxTree, keyframes: Object): RuleSet[] {
        let selectors: RuleSet[] = [];

        if (tree !== null && tree !== undefined) {
            let imports = tree["stylesheet"]["rules"].filter(r => r.type === "import");

            for (let i = 0; i < imports.length; i++) {
                let importItem = imports[i]["import"];

                let match = importItem && (<string>importItem).match(pattern);
                let url = match && match[2];

                if (url !== null && url !== undefined) {
                    let appDirectory = knownFolders.currentApp().path;
                    let fileName = resolveFileNameFromUrl(url, appDirectory, File.exists);

                    if (fileName !== null) {
                        let file = File.fromPath(fileName);
                        let text = file.readTextSync();
                        if (text) {
                            selectors = selectors.concat(StyleScope.createSelectorsFromCss(text, fileName, keyframes));
                        }
                    }
                }
            }
        }

        return selectors;
    }

    public ensureSelectors(): boolean {
        let toMerge = [];
        if ((this._applicationCssSelectorsAppliedVersion !== application.cssSelectorVersion) ||
            (this._localCssSelectorVersion !== this._localCssSelectorsAppliedVersion) ||
            (!this._mergedCssSelectors)) {

            toMerge.push(application.cssSelectors);
            this._applicationCssSelectorsAppliedVersion = application.cssSelectorVersion;
            toMerge.push(this._localCssSelectors);
            this._localCssSelectorsAppliedVersion = this._localCssSelectorVersion;
            for (let keyframe in application.keyframes) {
                this._keyframes[keyframe] = application.keyframes[keyframe];
            }
        }

        if (toMerge.length > 0) {
            this._mergedCssSelectors = toMerge.filter(m => !!m).reduce((merged, next) => merged.concat(next), []);
            this._applyKeyframesOnSelectors();
        } else {
            return false;
        }

        this._selectors = new SelectorsMap(this._mergedCssSelectors);

        return true;
    }

    public applySelectors(view: ViewBase): void {
        this.ensureSelectors();

        let state = this._selectors.query(view);

        let nextState = new CssState(view, state);
        view._setCssState(nextState);
    }

    public query(node: Node): SelectorCore[] {
        this.ensureSelectors();
        return this._selectors.query(node).selectors;
    }

    private static createSelectorsFromSyntaxTree(ast: SyntaxTree, keyframes: Object): RuleSet[] {
        let nodes = ast.stylesheet.rules;
        (<Keyframes[]>nodes.filter(isKeyframe)).forEach(node => keyframes[node.name] = node);

        let rulesets = fromAstNodes(nodes);
        if (rulesets && rulesets.length) {
            ensureCssAnimationParserModule();
            rulesets.forEach(rule => rule[animationsSymbol] = cssAnimationParserModule.CssAnimationParser.keyframeAnimationsFromCSSDeclarations(rule.declarations));
        }

        return rulesets;
    }

    private _reset() {
        this._statesByKey = {};
        this._viewIdToKey = {};
    }

    private _applyKeyframesOnSelectors() {
        for (let i = this._mergedCssSelectors.length - 1; i >= 0; i--) {
            let ruleset = this._mergedCssSelectors[i];
            let animations: kam.KeyframeAnimationInfo[] = ruleset[animationsSymbol];
            if (animations !== undefined && animations.length) {
                ensureCssAnimationParserModule();
                for (let animation of animations) {
                    let keyframe = this._keyframes[animation.name];
                    if (keyframe !== undefined) {
                        animation.keyframes = cssAnimationParserModule.CssAnimationParser.keyframesArrayFromCSS(keyframe);
                    }
                }
            }
        }
    }

    public getAnimations(ruleset: RuleSet): kam.KeyframeAnimationInfo[] {
        return ruleset[animationsSymbol];
    }
}

export function resolveFileNameFromUrl(url: string, appDirectory: string, fileExists: (name: string) => boolean): string {
    let fileName: string = typeof url === "string" ? url.trim() : "";

    if (fileName.indexOf("~/") === 0) {
        fileName = fileName.replace("~/", "");
    }

    let local = path.join(appDirectory, fileName);
    if (fileExists(local)) {
        return local;
    }

    let external = path.join(appDirectory, "tns_modules", fileName);
    if (fileExists(external)) {
        return external;
    }

    return null;
}

export function applyInlineStyle(view: ViewBase, styleStr: string) {
    let localStyle = `local { ${styleStr} }`;
    let inlineRuleSet = StyleScope.createSelectorsFromCss(localStyle, null, {});
    const style = view.style;

    inlineRuleSet[0].declarations.forEach(d => {
        // Use the actual property name so that a local value is set.
        let name = d.property;
        try {
            if (name in style) {
                style[name] = d.value;
            } else {
                view[name] = d.value;
            }
        } catch (e) {
            traceWrite(`Failed to apply property [${d.property}] with value [${d.value}] to ${view}. ${e}`, traceCategories.Error, traceMessageType.error);
        }
    });
}

function isKeyframe(node: Node): node is Keyframes {
    return node.type === "keyframes";
}

class InlineSelector extends SelectorCore {
    constructor(ruleSet: RuleSet) {
        super();
        this.ruleset = ruleSet;
    }

    public specificity = 0x01000000;
    public rarity = 0;
    public dynamic: boolean = false;
    public ruleset: RuleSet;
    public match(node: Node): boolean { return true; }
}
