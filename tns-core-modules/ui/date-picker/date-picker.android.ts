﻿import {
    DatePickerBase, yearProperty, monthProperty, dayProperty,
    dateProperty, maxDateProperty, minDateProperty
} from "./date-picker-common";

export * from "./date-picker-common";

interface DateChangedListener {
    new (owner: DatePicker): android.widget.DatePicker.OnDateChangedListener;
}

let DateChangedListener: DateChangedListener;

function initializeDateChangedListener(): void {
    if (DateChangedListener) {
        return;
    }

    @Interfaces([android.widget.DatePicker.OnDateChangedListener])
    class DateChangedListenerImpl extends java.lang.Object implements android.widget.DatePicker.OnDateChangedListener {
        constructor(public owner: DatePicker) {
            super()
            return global.__native(this);
        }

        onDateChanged(picker: android.widget.DatePicker, year: number, month: number, day: number) {
            const owner = this.owner;
            let dateChanged = false;
            if (year !== owner.year) {
                yearProperty.nativeValueChange(owner, year);
                dateChanged = true;
            }

            if ((month + 1) !== owner.month) {
                monthProperty.nativeValueChange(owner, month + 1);
                dateChanged = true;
            }

            if (day !== owner.day) {
                dayProperty.nativeValueChange(owner, day);
                dateChanged = true;
            }

            if (dateChanged) {
                dateProperty.nativeValueChange(owner, new Date(year, month, day));
            }
        }
    }

    DateChangedListener = DateChangedListenerImpl;
}

export class DatePicker extends DatePickerBase {
    nativeViewProtected: android.widget.DatePicker;

    public createNativeView() {
        initializeDateChangedListener();
        const picker = new android.widget.DatePicker(this._context);
        picker.setCalendarViewShown(false);
        const listener = new DateChangedListener(this);
        picker.init(0, 0, 0, listener);
        (<any>picker).listener = listener;
        return picker;
    }

    public initNativeView(): void {
        super.initNativeView();
        (<any>this.nativeViewProtected).listener.owner = this;
    }

    public disposeNativeView() {
        (<any>this.nativeViewProtected).listener.owner = null;
        super.disposeNativeView();
    }

    private updateNativeDate(): void {
        const nativeView = this.nativeViewProtected;
        const year = typeof this.year === "number" ? this.year : nativeView.getYear();
        const month = typeof this.month === "number" ? (this.month - 1) : nativeView.getMonth();
        const day = typeof this.day === "number" ? this.day : nativeView.getDayOfMonth();
        this.date = new Date(year, month, day);
    }

    [yearProperty.getDefault](): number {
        return this.nativeViewProtected.getYear();
    }
    [yearProperty.setNative](value: number) {
        if (this.nativeViewProtected.getYear() !== value) {
            this.updateNativeDate();
        }
    }

    [monthProperty.getDefault](): number {
        return this.nativeViewProtected.getMonth();
    }
    [monthProperty.setNative](value: number) {
        if (this.nativeViewProtected.getMonth() !== (value - 1)) {
            this.updateNativeDate();
        }
    }

    [dayProperty.getDefault](): number {
        return this.nativeViewProtected.getDayOfMonth();
    }
    [dayProperty.setNative](value: number) {
        if (this.nativeViewProtected.getDayOfMonth() !== value) {
            this.updateNativeDate();
        }
    }

    [dateProperty.getDefault](): Date {
        const nativeView = this.nativeViewProtected;
        return new Date(nativeView.getYear(), nativeView.getMonth(), nativeView.getDayOfMonth());
    }
    [dateProperty.setNative](value: Date) {
        const nativeView = this.nativeViewProtected;
        if (nativeView.getDayOfMonth() !== value.getDay()
            || nativeView.getMonth() !== value.getMonth()
            || nativeView.getYear() !== value.getFullYear()) {
            nativeView.updateDate(value.getFullYear(), value.getMonth(), value.getDate());
        }
    }

    [maxDateProperty.getDefault](): number {
        return this.nativeViewProtected.getMaxDate();
    }
    [maxDateProperty.setNative](value: Date | number) {
        const newValue = value instanceof Date ? value.getTime() : value;
        this.nativeViewProtected.setMaxDate(newValue);
    }

    [minDateProperty.getDefault](): number {
        return this.nativeViewProtected.getMinDate();
    }
    [minDateProperty.setNative](value: Date | number) {
        const newValue = value instanceof Date ? value.getTime() : value;
        this.nativeViewProtected.setMinDate(newValue);
    }
}