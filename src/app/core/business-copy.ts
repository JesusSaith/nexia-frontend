import { Injectable, computed, signal } from '@angular/core';

import { BusinessWords, businessWords } from './business-words';
import { MessageKey, MessageVars, defaultText, fillTemplate } from './message-templates';

@Injectable({ providedIn: 'root' })
export class BusinessCopy {
  private readonly label = signal('Colaborador');
  readonly text = computed(() => businessWords(this.label()));
  readonly logo = signal<string | null>(null);
  /** Si le paga comisión a su equipo; apagado, Equipo y Reportes esconden las comisiones. */
  readonly commissions = signal(true);
  /** Mensajes de WhatsApp que la dueña reescribió; los demás usan el texto por defecto. */
  readonly templates = signal<Partial<Record<MessageKey, string>>>({});

  setLabel(label: string | null | undefined): void {
    this.label.set(label?.trim() || 'Colaborador');
  }

  setCommissions(value: boolean | null | undefined): void {
    this.commissions.set(value !== false);
  }

  setLogo(url: string | null): void {
    this.logo.set(url);
  }

  setTemplates(templates: Partial<Record<string, string>> | null | undefined): void {
    this.templates.set((templates ?? {}) as Partial<Record<MessageKey, string>>);
  }

  words(): BusinessWords {
    return this.text();
  }

  /** El mensaje listo para mandar: la versión de la dueña si la hay, con las variables llenas. */
  message(key: MessageKey, vars: MessageVars): string {
    return fillTemplate(this.templates()[key] || defaultText(key), vars);
  }
}
