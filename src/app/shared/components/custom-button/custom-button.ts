import { Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'outline';

@Component({
  selector: 'app-custom-button',
  templateUrl: './custom-button.html',
})
export class CustomButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly isLoading = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);

  protected readonly isDisabled = computed(() => this.disabled() || this.isLoading());

  protected readonly classes = computed(() => {
    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500/30',
      secondary: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-400/40',
      outline:
        'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-300',
    };

    return [
      'inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
      variants[this.variant()],
    ].join(' ');
  });
}
