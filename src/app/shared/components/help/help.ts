import { Component, computed, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';

import { TourService } from '@core/services/tour.service';

import { AuthService } from '@core/services/auth.service';
import { BusinessCopy } from '@core/business-copy';
import { HelpTopic, helpTopics, topicForRoute } from '@core/help-topics';

/** Ayuda del panel: arriba lo de la pantalla en que estás; abajo, los demás temas. */
@Component({
  selector: 'app-help',
  imports: [MatIconModule],
  templateUrl: './help.html',
})
export class HelpComponent {
  private readonly ref = inject(MatDialogRef<HelpComponent>);
  private readonly auth = inject(AuthService);
  protected readonly copy = inject(BusinessCopy);
  private readonly url = inject(Router).url;

  private readonly topics = computed(() =>
    helpTopics(this.copy.text()).filter((topic) => !topic.managerOnly || !this.auth.isStaff()),
  );
  protected readonly current = computed<HelpTopic | null>(() => topicForRoute(this.topics(), this.url));
  protected readonly others = computed(() => this.topics().filter((topic) => topic.id !== this.current()?.id));
  protected readonly open = signal<string | null>(null);
  private readonly tour = inject(TourService);

  /** Repite los globos de la Agenda (solo si ya se está en la Agenda). */
  protected readonly canReplay = computed(() => this.current()?.id === 'agenda');

  protected replayTour(): void {
    this.ref.close();
    this.tour.replay('agenda');
  }

  protected toggle(id: string): void {
    this.open.update((now) => (now === id ? null : id));
  }

  protected close(): void {
    this.ref.close();
  }
}
