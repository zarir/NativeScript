declare module "ui/core/view-base" {
    import { Observable, EventData } from "data/observable";
    import {
        Property, PropertyOptions, CoercibleProperty, CoerciblePropertyOptions,
        InheritedProperty, CssProperty, CssPropertyOptions, InheritedCssProperty,
        ShorthandProperty, ShorthandPropertyOptions, unsetValue
    } from "ui/core/properties";
    import { Binding, BindingOptions } from "ui/core/bindable";
    import { Style } from "ui/styling/style";
    import { SelectorCore } from "ui/styling/css-selector";
    import { isIOS, isAndroid } from "platform";
    import { fromString as gestureFromString } from "ui/gestures";
    import { KeyframeAnimation } from "ui/animation/keyframe-animation";
    import { isEnabled as traceEnabled, write as traceWrite, categories as traceCategories, notifyEvent as traceNotifyEvent, isCategorySet } from "trace";

    export {
        Observable, EventData, KeyframeAnimation,
        Binding, BindingOptions, Style, isIOS, isAndroid, gestureFromString,
        traceEnabled, traceWrite, traceCategories, traceNotifyEvent, isCategorySet
    };

    export * from "ui/core/properties";

    /**
     * Gets an ancestor from a given type.
     * @param view - Starting view (child view).
     * @param criterion - The type of ancestor view we are looking for. Could be a string containing a class name or an actual type.
     * Returns an instance of a view (if found), otherwise undefined.
     */
    export function getAncestor(view: ViewBase, criterion: string | Function): ViewBase;

    export function isEventOrGesture(name: string, view: ViewBase): boolean;

    /**
     * Gets a child view by id.
     * @param view - The parent (container) view of the view to look for.
     * @param id - The id of the view to look for.
     * Returns an instance of a view (if found), otherwise undefined.
     */
    export function getViewById(view: ViewBase, id: string): ViewBase;

    export abstract class ViewBase extends Observable {
        /**
         * String value used when hooking to loaded event.
         */
        public static loadedEvent: string;

        /**
         * String value used when hooking to unloaded event.
         */
        public static unloadedEvent: string;

        public ios: any;
        public android: any;
        public nativeView: any;
        public bindingContext: any;
        public recycleNativeView: boolean;

        /**
         * Gets the name of the constructor function for this instance. E.g. for a Button class this will return "Button".
         */
        public typeName: string;

        /**
         * Gets the parent view. This property is read-only.
         */
        public readonly parent: ViewBase;

        /**
         * Gets or sets the id for this view.
         */
        public id: string;

        /**
         * Gets or sets the CSS class name for this view.
         */
        public className: string;

        /**
         * Gets or sets inline style selectors for this view.   
         */
        public inlineStyleSelector: SelectorCore;

        /**
         * Gets owner page. This is a read-only property.
         */
        public readonly page: ViewBase;

        /**
         * Gets the style object associated to this view.
         */
        public readonly style: Style;

        /**
         * Returns true if visibility is set to 'collapse'.
         * Readonly property
         */
        public isCollapsed: boolean;
        public readonly isLoaded: boolean;

        /**
         * Returns the child view with the specified id.
         */
        public getViewById<T extends ViewBase>(id: string): T;

        public onLoaded(): void;
        public onUnloaded(): void;

        public bind(options: BindingOptions, source?: Object): void;
        public unbind(property: string): void;

        public requestLayout(): void;
        public eachChild(callback: (child: ViewBase) => boolean): void;

        public _addView(view: ViewBase, atIndex?: number): void;
        public _removeView(view: ViewBase): void;
        public _parentChanged(oldParent: ViewBase): void;

        _domId: number;

        _cssState: any /* "ui/styling/style-scope" */;
        _cssStateChanged();

        _context: any /* android.content.Context */;

        /** 
         * Setups the UI for ViewBase and all its children recursively.
         * This method should *not* be overridden by derived views.
         */
        _setupUI(context: any /* android.content.Context */, atIndex?: number): void;

        /**
         * Tears down the UI for ViewBase and all its children recursively.
         * This method should *not* be overridden by derived views.
         */
        _tearDownUI(force?: boolean): void;

        /**
         * Creates a native view
         */
        _createNativeView(): void;

        /**
         * Clean up references to the native view.
         */
        _disposeNativeView(): void;

        /**
         * Initializes properties/listeners of the native view.
         */
        _initNativeView(): void;

        /**
         * Resets properties/listeners set to the native view.
         */
        _resetNativeView(): void;

        _isAddedToNativeVisualTree: boolean;

        /**
         * Performs the core logic of adding a child view to the native visual tree. Returns true if the view's native representation has been successfully added, false otherwise.
         */
        _addViewToNativeVisualTree(view: ViewBase, atIndex?: number): boolean;
        _removeViewFromNativeVisualTree(view: ViewBase): void;
        _childIndexToNativeChildIndex(index?: number): number;

        /**
         * @protected
         * @unstable
         * A widget can call this method to add a matching css pseudo class.
         */
        public addPseudoClass(name: string): void;

        /**
         * @protected
         * @unstable
         * A widget can call this method to discard mathing css pseudo class.
         */
        public deletePseudoClass(name: string): void;
    }

    export const idProperty: Property<ViewBase, string>;
    export const classNameProperty: Property<ViewBase, string>;
    export const bindingContextProperty: InheritedProperty<ViewBase, any>;
}