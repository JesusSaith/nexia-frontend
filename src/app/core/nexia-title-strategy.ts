import { Injectable, inject } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { TabAlerts } from './services/tab-alerts.service';

/** Igual que el título por defecto del router, pero le anota los avisos sin ver. */
@Injectable({ providedIn: 'root' })
export class NexiaTitleStrategy extends TitleStrategy {
  private readonly alerts = inject(TabAlerts);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (title !== undefined) this.alerts.setBase(title);
  }
}
