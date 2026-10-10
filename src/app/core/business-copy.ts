import { Injectable, computed, signal } from '@angular/core';

import { BusinessWords, businessWords } from './business-words';

@Injectable({ providedIn: 'root' })
export class BusinessCopy {
  private readonly label = signal('Colaborador');
  readonly text = computed(() => businessWords(this.label()));
  readonly logo = signal<string | null>(null);

  setLabel(label: string | null | undefined): void {
    this.label.set(label?.trim() || 'Colaborador');
  }

  setLogo(url: string | null): void {
    this.logo.set(url);
  }

  words(): BusinessWords {
    return this.text();
  }
}
