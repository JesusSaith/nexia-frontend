import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextFieldId = 0;

@Component({
  selector: 'app-custom-input',
  templateUrl: './custom-input.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomInputComponent),
      multi: true,
    },
  ],
})
export class CustomInputComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'password' | 'tel'>('text');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly error = input('');

  protected readonly inputId = `nx-field-${nextFieldId++}`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly inputClasses = computed(() => {
    const border = this.error()
      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
      : 'border-slate-200 focus:border-primary-600 focus:ring-primary-500/15';

    return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 ${border}`;
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement).value;
    this.value.set(nextValue);
    this.onChange(nextValue);
  }

  protected markTouched(): void {
    this.onTouched();
  }
}
