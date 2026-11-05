import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly message = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string): void {
    this.message.set(text);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.message.set(null), 3500);
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.message.set(null);
  }
}
