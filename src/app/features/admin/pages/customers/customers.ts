import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map } from 'rxjs/operators';

import { BusinessCopy } from '@core/business-copy';
import { firstName, whatsappLink } from '@core/message-templates';
import { AuthService } from '@core/services/auth.service';
import { BookingService, ClientCard, ClientRow } from '@core/services/booking.service';
import { PackagesService, VisitPackage } from '@core/services/packages.service';
import { Toasts } from '@core/toasts';
import { Confirm } from '@shared/components/confirm/confirm';
import { Skeleton } from '@shared/components/skeleton/skeleton';

type Filter = 'all' | 'best' | 'missing' | 'cancel' | 'birthday' | 'package';
type Sort = 'name' | 'recent' | 'spent' | 'visits';

/** Sin venir en más de estos días (y sin cita próxima) cuenta como "dejó de venir". */
const AWAY_DAYS = 45;

@Component({
  selector: 'app-customers',
  imports: [MatIconModule, FormsModule, RouterLink, Skeleton],
  templateUrl: './customers.html',
})
export class Customers {
  private readonly bookingApi = inject(BookingService);
  private readonly packagesApi = inject(PackagesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  protected readonly copy = inject(BusinessCopy);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  protected readonly deleteError = signal<string | null>(null);
  private readonly money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  private readonly when = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  private readonly shortDay = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

  protected readonly clients = signal<ClientRow[]>([]);
  protected readonly packages = signal<VisitPackage[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');

  /** Qué decir cuando la lista queda vacía: depende de si es por la búsqueda o por el filtro. */
  protected readonly emptyText = computed(() => {
    if (this.query().trim()) {
      return 'Nadie coincide con esa búsqueda. Revisa el nombre o prueba con el teléfono.';
    }
    const texts: Record<Filter, string> = {
      all: 'Aún no hay nadie aquí.',
      best: 'Aquí aparecerán quienes más gastan, en cuanto haya cobros.',
      missing: 'Nadie ha dejado de venir. Buen trabajo.',
      cancel: 'Nadie cancela ni falta seguido.',
      birthday: 'No hay cumpleaños en los próximos 7 días.',
      package: 'Nadie tiene un paquete con visitas por usar. Se agregan desde la ficha.',
    };
    return texts[this.filter()];
  });

  protected clearFilters(): void {
    this.query.set('');
    this.filter.set('all');
  }
  protected readonly sort = signal<Sort>('name');

  private readonly today = localDay(new Date());
  private readonly awayCut = localDay(new Date(Date.now() - AWAY_DAYS * 86_400_000));

  /** Paquetes con visitas por teléfono (10 dígitos). */
  private readonly packsByPhone = computed(() => {
    const map = new Map<string, VisitPackage[]>();
    for (const pack of this.packages()) {
      const key = phoneKey(pack.client_phone);
      map.set(key, [...(map.get(key) ?? []), pack]);
    }
    return map;
  });

  protected isMissing(row: ClientRow): boolean {
    return !!row.last_visit && row.last_visit < this.awayCut && !row.next_visit;
  }

  /** Dos o más cancelaciones o faltas: "cancela seguido". */
  protected isCanceller(row: ClientRow): boolean {
    return row.cancel_count + (row.no_show_count ?? 0) >= 2;
  }

  /** Días que faltan para su cumpleaños (0 = hoy). El 29 de febrero se festeja el 28 en años no bisiestos. */
  protected birthdayIn(row: ClientRow): number | null {
    const [month, day] = (row.birthday?.slice(5, 10) ?? '').split('-').map(Number);
    if (!month || !day) {
      return null;
    }
    const now = new Date(`${this.today}T12:00:00`);
    const year = now.getFullYear();
    const leap = new Date(year, 1, 29).getMonth() === 1;
    let next = new Date(year, month - 1, month === 2 && day === 29 && !leap ? 28 : day, 12);
    if (next < now && localDay(next) !== this.today) {
      next = new Date(year + 1, month - 1, day, 12);
    }
    return Math.round((next.getTime() - now.getTime()) / 86_400_000);
  }

  /** Cumple en los próximos 7 días. */
  protected isBirthday(row: ClientRow): boolean {
    const days = this.birthdayIn(row);
    return days !== null && days < 7;
  }

  protected birthdayLabel(row: ClientRow): string {
    const days = this.birthdayIn(row) ?? 0;
    return days === 0 ? 'Cumple hoy' : days === 1 ? 'Cumple mañana' : `Cumple el ${this.shortDay.format(new Date(Date.now() + days * 86_400_000))}`;
  }

  protected packLeft(row: ClientRow): number {
    return (this.packsByPhone().get(phoneKey(row.phone)) ?? []).reduce((sum, pack) => sum + pack.remaining, 0);
  }

  private readonly tests: Record<Filter, (row: ClientRow) => boolean> = {
    all: () => true,
    best: (row) => row.total_spent > 0,
    missing: (row) => this.isMissing(row),
    cancel: (row) => this.isCanceller(row),
    birthday: (row) => this.isBirthday(row),
    package: (row) => this.packLeft(row) > 0,
  };

  protected readonly counts = computed(() => {
    const rows = this.clients();
    this.packsByPhone();
    const count = (key: Filter) => rows.filter(this.tests[key]).length;
    return { all: rows.length, best: count('best'), missing: count('missing'), cancel: count('cancel'), birthday: count('birthday'), package: count('package') };
  });

  protected readonly chips: { key: Filter; label: string; icon: string; tone: string }[] = [
    { key: 'all', label: 'Todos', icon: 'groups', tone: 'stat-accent' },
    { key: 'best', label: 'Mejores', icon: 'workspace_premium', tone: 'stat-accent' },
    { key: 'missing', label: 'Dejaron de venir', icon: 'person_off', tone: 'stat-warn' },
    { key: 'cancel', label: 'Cancelan seguido', icon: 'event_busy', tone: 'stat-bad' },
    { key: 'birthday', label: 'Cumpleaños (7 días)', icon: 'cake', tone: 'stat-info' },
    { key: 'package', label: 'Con paquete', icon: 'card_membership', tone: 'stat-info' },
  ];

  protected readonly sorts: { key: Sort; label: string }[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'recent', label: 'Última visita' },
    { key: 'spent', label: 'Más gasto' },
    { key: 'visits', label: 'Más visitas' },
  ];

  /** Etiquetas usadas en el negocio, para filtrar con un toque. */
  protected readonly tagFilter = signal<string | null>(null);
  protected readonly allTags = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.clients()) {
      for (const tag of row.tags ?? []) {
        seen.set(tag.toLowerCase(), seen.get(tag.toLowerCase()) ?? tag);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
  });

  protected readonly visible = computed(() => {
    const tag = this.tagFilter()?.toLowerCase();
    const term = this.query().trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const test = this.tests[this.filter()];
    this.packsByPhone();
    const rows = this.clients().filter(
      (row) => test(row) && (!tag || (row.tags ?? []).some((item) => item.toLowerCase() === tag)) && (!term || row.full_name.toLowerCase().includes(term) || (digits.length > 0 && row.phone.replace(/\D/g, '').includes(digits))),
    );
    // "Mejores" siempre va por gasto; "Dejaron de venir", de la que más tiempo lleva.
    const sort = this.filter() === 'best' ? 'spent' : this.filter() === 'missing' ? 'oldest' : this.filter() === 'birthday' ? 'birthday' : this.sort();
    const by: Record<string, (a: ClientRow, b: ClientRow) => number> = {
      name: (a, b) => a.full_name.localeCompare(b.full_name, 'es'),
      recent: (a, b) => (b.last_visit ?? '').localeCompare(a.last_visit ?? ''),
      oldest: (a, b) => (a.last_visit ?? '').localeCompare(b.last_visit ?? ''),
      birthday: (a, b) => (this.birthdayIn(a) ?? 99) - (this.birthdayIn(b) ?? 99),
      spent: (a, b) => b.total_spent - a.total_spent || b.visit_count - a.visit_count,
      visits: (a, b) => b.visit_count - a.visit_count || b.total_spent - a.total_spent,
    };
    return [...rows].sort(by[sort]);
  });

  // Ficha
  protected readonly card = signal<ClientCard | null>(null);
  protected readonly notes = signal('');
  private savedNotes = '';
  protected readonly notesState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  protected readonly birthdayState = signal<'idle' | 'saved' | 'error'>('idle');
  protected readonly editing = signal(false);
  protected editName = '';
  protected editPhone = '';
  protected readonly editError = signal<string | null>(null);
  protected packVisits = 5;
  protected readonly packError = signal<string | null>(null);
  protected readonly cardPacks = computed(() => {
    const card = this.card();
    return card ? this.packsByPhone().get(phoneKey(card.phone)) ?? [] : [];
  });
  /** Visita más reciente que ya ocurrió (si no hay, la última registrada) para repetirla. */
  protected readonly lastVisit = computed(() => {
    const visits = [...(this.card()?.visits ?? [])].sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    const now = Date.now();
    const past = visits.filter((visit) => new Date(visit.starts_at).getTime() <= now);
    return past.find((visit) => visit.status !== 'cancelled') ?? past[0] ?? visits[0] ?? null;
  });

  /** Cuántas filas del historial se ven ("Ver más" muestra todo). */
  protected readonly historyShown = signal(8);

  /** Lo que ayuda a atenderla: próxima cita, favoritos, ticket, frecuencia y cuándo le toca volver. */
  protected readonly profile = computed(() => {
    const card = this.card();
    if (!card) {
      return null;
    }
    const now = Date.now();
    const next = [...card.visits]
      .filter((visit) => (visit.status === 'scheduled' || visit.status === 'awaiting_deposit') && new Date(visit.starts_at).getTime() >= now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
    const done = card.visits.filter((visit) => visit.status === 'completed').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const most = (values: string[]) => {
      const tally = new Map<string, number>();
      values.forEach((value) => tally.set(value, (tally.get(value) ?? 0) + 1));
      return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    const gaps = done.slice(1).map((visit, index) => Math.round((new Date(visit.starts_at).getTime() - new Date(done[index].starts_at).getTime()) / 86_400_000));
    const sorted = [...gaps].sort((a, b) => a - b);
    const every = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const last = done.at(-1);
    const due = every && last ? new Date(new Date(last.starts_at).getTime() + every * 86_400_000) : null;
    return {
      next,
      service: most(done.map((visit) => visit.service_name)),
      staff: most(done.map((visit) => visit.staff_name)),
      ticket: done.length ? card.total_spent / done.length : null,
      every,
      due: due && !next ? due : null,
    };
  });

  protected dueLabel(date: Date): string {
    const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
    if (days < 0) {
      return `Le tocaba hace ${-days} días`;
    }
    return days === 0 ? 'Le toca hoy' : `Le toca el ${this.shortDay.format(date)}`;
  }

  // Etiquetas de la ficha
  protected newTag = '';

  protected addTag(): void {
    const tag = this.newTag.trim();
    const card = this.card();
    if (!card || !tag) {
      return;
    }
    this.newTag = '';
    this.saveTags([...(card.tags ?? []), tag]);
  }

  protected removeTag(tag: string): void {
    const card = this.card();
    if (card) {
      this.saveTags((card.tags ?? []).filter((item) => item !== tag));
    }
  }

  private saveTags(tags: string[]): void {
    const card = this.card();
    if (!card) {
      return;
    }
    this.bookingApi
      .updateClient(card.id, { tags })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((next) => {
        this.card.update((current) => (current ? { ...current, tags: next.tags ?? [] } : current));
        this.patchRow(next.id, { tags: next.tags ?? [] });
      });
  }

  // Acciones en bloque: seleccionar varios para etiquetarlos o escribirles uno tras otro.
  /** Solo propietario y administración (la API también lo exige). */
  protected readonly canBulk = computed(() => !this.auth.isStaff());
  protected readonly selecting = signal(false);
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  protected readonly selectedRows = computed(() => this.visible().filter((row) => this.selected().has(row.id)));
  protected readonly bulkPanel = signal<'tag' | 'chat' | null>(null);
  protected bulkTag = '';
  protected readonly bulkBusy = signal(false);
  protected readonly bulkError = signal<string | null>(null);

  protected readonly chatKinds: { key: 'miss_you' | 'birthday' | 'share_link'; label: string }[] = [
    { key: 'miss_you', label: 'Te extrañamos' },
    { key: 'birthday', label: 'Felicitar' },
    { key: 'share_link', label: 'Invitar a reservar' },
  ];
  protected readonly chatKind = signal<'miss_you' | 'birthday' | 'share_link'>('miss_you');
  private readonly chatRows = signal<ClientRow[]>([]);
  protected readonly chatIndex = signal(0);
  protected readonly chatCurrent = computed(() => this.chatRows()[this.chatIndex()] ?? null);
  protected readonly chatTotal = computed(() => this.chatRows().length);

  protected toggleSelecting(): void {
    this.selecting.update((on) => !on);
    this.clearSelection();
  }

  protected isSelected(id: number): boolean {
    return this.selected().has(id);
  }

  protected toggleOne(id: number): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected selectAllVisible(): void {
    const all = this.visible().length > 0 && this.visible().every((row) => this.selected().has(row.id));
    this.selected.set(all ? new Set() : new Set(this.visible().map((row) => row.id)));
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
    this.bulkPanel.set(null);
    this.bulkError.set(null);
    this.chatRows.set([]);
  }

  protected openBulkTag(): void {
    this.bulkTag = '';
    this.bulkError.set(null);
    this.bulkPanel.set('tag');
  }

  protected applyBulkTag(tag: string): void {
    const clean = tag.trim();
    const rows = this.selectedRows();
    if (!clean || rows.length === 0 || this.bulkBusy()) {
      return;
    }
    this.bulkBusy.set(true);
    this.bulkError.set(null);
    this.bookingApi
      .bulkTags(rows.map((row) => row.id), [clean])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.bulkBusy.set(false);
          const ids = new Set(rows.map((row) => row.id));
          this.clients.update((all) =>
            all.map((row) => {
              const tags = row.tags ?? [];
              return ids.has(row.id) && tags.length < 10 && !tags.some((item) => item.toLowerCase() === clean.toLowerCase()) ? { ...row, tags: [...tags, clean] } : row;
            }),
          );
          this.toasts.show(result.full ? `Etiqueta puesta a ${result.updated - result.full}. ${result.full} ya tenían 10 etiquetas.` : `Etiqueta "${clean}" puesta a ${result.updated}.`);
          this.clearSelection();
        },
        error: (error: unknown) => {
          this.bulkBusy.set(false);
          this.bulkError.set(readError(error, 'No pudimos poner la etiqueta. Inténtalo de nuevo.'));
        },
      });
  }

  /** WhatsApp no deja mandar a varios a la vez: se arma una fila y se abre un chat tras otro. */
  protected startChat(): void {
    this.chatRows.set(this.selectedRows());
    this.chatIndex.set(0);
    this.chatKind.set(this.filter() === 'birthday' ? 'birthday' : 'miss_you');
    this.bulkPanel.set('chat');
  }

  protected chatHref(row: ClientRow): string {
    const slug = this.auth.currentUser()?.slug ?? '';
    const vars = { nombre: firstName(row.full_name), negocio: this.shopName(), enlace: slug ? this.bookingApi.shareUrl(slug) : '' };
    return whatsappLink(row.phone, this.copy.message(this.chatKind(), vars));
  }

  /** Se abrió el chat de esta persona (el enlace lo abre el navegador): queda anotado y pasa a la siguiente. */
  protected chatSent(): void {
    const row = this.chatCurrent();
    if (row) {
      this.logContact(row, this.chatKind() === 'birthday' ? 'felicitar' : 'invitar');
    }
    this.chatNext();
  }

  protected chatNext(): void {
    if (this.chatIndex() + 1 >= this.chatTotal()) {
      this.toasts.show('Listo, recorriste a todos.');
      this.clearSelection();
      return;
    }
    this.chatIndex.update((index) => index + 1);
  }

  // Importar CSV
  protected readonly importing = signal(false);
  protected readonly importNote = signal<string | null>(null);

  /** Lee un CSV (de Excel, Google o el teléfono): busca columnas de nombre, teléfono, correo y cumpleaños. */
  protected importCsv(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    void file.text().then((text) => {
      const rows = parseCsv(text);
      if (rows.length === 0) {
        this.importNote.set('El archivo está vacío.');
        return;
      }
      const head = rows[0].map((cell) => cell.toLowerCase());
      const find = (...words: string[]) => head.findIndex((cell) => words.some((word) => cell.includes(word)));
      let name = find('nombre', 'name');
      let phone = find('tel', 'phone', 'whats', 'celular', 'móvil', 'movil');
      const email = find('correo', 'mail');
      const birthday = find('cumple', 'birth', 'nacimiento');
      const hasHead = name >= 0 || phone >= 0;
      if (!hasHead) {
        name = 0;
        phone = 1;
      }
      const data = (hasHead ? rows.slice(1) : rows)
        .map((cells) => ({
          full_name: (cells[name] ?? '').trim(),
          phone: (cells[phone] ?? '').trim(),
          email: email >= 0 ? (cells[email] ?? '').trim() || null : null,
          birthday: birthday >= 0 ? isoDay(cells[birthday] ?? '') : null,
        }))
        .filter((row) => row.full_name && row.phone);
      if (data.length === 0) {
        this.importNote.set('No encontramos columnas de nombre y teléfono.');
        return;
      }
      this.importing.set(true);
      this.bookingApi
        .importClients(data)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: ({ created, skipped }) => {
            this.importing.set(false);
            this.importNote.set(`Se agregaron ${created}. ${skipped ? `${skipped} se saltaron (teléfono repetido o sin 10 dígitos).` : ''}`);
            this.load();
          },
          error: () => {
            this.importing.set(false);
            this.importNote.set('No pudimos importar el archivo.');
          },
        });
    });
  }

  // Alta a mano
  protected readonly adding = signal(false);
  protected newName = '';
  protected newPhone = '';
  protected readonly addError = signal<string | null>(null);

  constructor() {
    this.load();
    // ?ficha=ID (buscador del panel): abre esa ficha, también si ya se estaba en Clientes.
    this.route.queryParamMap
      .pipe(
        map((params) => Number(params.get('ficha'))),
        distinctUntilChanged(),
        filter((id) => id > 0),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => this.open(id));
    this.packagesApi
      .list()
      .pipe(catchError(() => of([] as VisitPackage[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this.packages.set(rows));
  }

  private load(): void {
    this.bookingApi
      .getClients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.clients.set(rows);
          this.loaded.set(true);
        },
        error: () => this.loadError.set('No pudimos cargar los clientes.'),
      });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.card()) {
      this.close();
    }
  }

  protected open(id: number): void {
    this.birthdayState.set('idle');
    this.notesState.set('idle');
    this.editing.set(false);
    this.historyShown.set(8);
    this.packError.set(null);
    this.deleteError.set(null);
    this.bookingApi
      .getClient(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((card) => {
        this.card.set(card);
        this.savedNotes = card.internal_notes ?? '';
        this.notes.set(this.savedNotes);
      });
  }

  /** Al cerrar se guardan las notas que quedaron sin guardar. */
  protected close(): void {
    this.saveNotes();
    this.card.set(null);
    if (this.route.snapshot.queryParamMap.has('ficha')) {
      // Se quita de la dirección para poder abrir la misma ficha otra vez desde el buscador.
      void this.router.navigate([], { queryParams: { ficha: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  protected saveNotes(): void {
    const card = this.card();
    const text = this.notes();
    if (!card || text === this.savedNotes) {
      return;
    }
    this.notesState.set('saving');
    this.bookingApi
      .saveClientNotes(card.id, text)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savedNotes = text;
          this.notesState.set('saved');
        },
        error: () => this.notesState.set('error'),
      });
  }

  protected saveBirthday(value: string): void {
    const card = this.card();
    const birthday = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    if (!card || (value && !birthday) || (card.birthday ?? null) === birthday) {
      return;
    }
    this.birthdayState.set('idle');
    this.bookingApi
      .saveClientBirthday(card.id, birthday)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (next) => {
          this.card.update((current) => (current ? { ...current, birthday: next.birthday ?? null } : current));
          this.birthdayState.set('saved');
          this.patchRow(next.id, { birthday: next.birthday ?? null });
        },
        error: () => this.birthdayState.set('error'),
      });
  }

  protected startEdit(): void {
    const card = this.card();
    if (!card) {
      return;
    }
    this.editName = card.full_name;
    this.editPhone = card.phone;
    this.editError.set(null);
    this.editing.set(true);
  }

  protected saveEdit(): void {
    const card = this.card();
    const name = this.editName.trim();
    const phone = cleanPhone(this.editPhone);
    if (!card) {
      return;
    }
    if (!name) {
      this.editError.set('Escribe el nombre.');
      return;
    }
    if (!phone) {
      this.editError.set('El teléfono debe tener 10 dígitos.');
      return;
    }
    this.bookingApi
      .updateClient(card.id, { full_name: name, phone })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (next) => {
          this.card.update((current) => (current ? { ...current, full_name: next.full_name, phone: next.phone } : current));
          this.patchRow(next.id, { full_name: next.full_name, phone: next.phone });
          this.editing.set(false);
        },
        error: (error: unknown) => this.editError.set(readError(error, 'No pudimos guardar los cambios.')),
      });
  }

  protected addClient(event: Event): void {
    event.preventDefault();
    const name = this.newName.trim();
    const phone = cleanPhone(this.newPhone);
    if (!name || !phone) {
      this.addError.set(!name ? 'Escribe el nombre.' : 'El teléfono debe tener 10 dígitos.');
      return;
    }
    this.bookingApi
      .createClient({ full_name: name, phone })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (card) => {
          this.clients.update((rows) => [...rows, { ...card, cancel_count: 0, last_visit: null, next_visit: null }]);
          this.adding.set(false);
          this.newName = '';
          this.newPhone = '';
          this.addError.set(null);
          this.open(card.id);
        },
        error: (error: unknown) => this.addError.set(readError(error, 'No pudimos agregar al cliente.')),
      });
  }

  protected addPackage(): void {
    const card = this.card();
    const visits = Math.floor(Number(this.packVisits));
    if (!card) {
      return;
    }
    if (!(visits >= 1)) {
      this.packError.set('Pon cuántas visitas incluye (1 o más).');
      return;
    }
    this.packError.set(null);
    this.packagesApi
      .create(card.full_name, card.phone, visits)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => this.packages.update((rows) => [row, ...rows]),
        error: () => this.packError.set('No pudimos guardar el paquete.'),
      });
  }

  protected stepPackage(pack: VisitPackage, delta: number): void {
    const remaining = Math.min(pack.total, Math.max(0, pack.remaining + delta));
    if (remaining === pack.remaining) {
      return;
    }
    this.packagesApi
      .update(pack.id, remaining)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (row) => this.packages.update((rows) => rows.map((item) => (item.id === row.id ? row : item))),
        error: () => this.packError.set('No pudimos cambiar el paquete.'),
      });
  }

  protected removePackage(pack: VisitPackage): void {
    this.packagesApi
      .remove(pack.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.packages.update((rows) => rows.filter((item) => item.id !== pack.id)),
        error: () => this.packError.set('No pudimos quitar el paquete.'),
      });
  }

  /** Borrar sus datos a petición de la persona. Sus citas pasadas se quedan, sin nombre ni teléfono. */
  protected async deleteClient(): Promise<void> {
    const card = this.card();
    if (!card) {
      return;
    }
    const ok = await this.confirm.ask({
      title: `¿Borrar los datos de ${card.full_name}?`,
      message: 'Se borran su ficha, notas, cumpleaños y paquetes. Sus citas pasadas se quedan en tus reportes, sin nombre ni teléfono. No se puede deshacer.',
      confirm: 'Borrar datos',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.deleteError.set(null);
    this.bookingApi
      .deleteClient(card.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clients.update((rows) => rows.filter((row) => row.id !== card.id));
          this.packages.update((rows) => rows.filter((row) => phoneKey(row.client_phone) !== phoneKey(card.phone)));
          this.card.set(null);
        },
        error: (error: unknown) => this.deleteError.set(readError(error, 'No pudimos borrar sus datos.')),
      });
  }

  protected newAppointment(): void {
    const card = this.card();
    if (!card) {
      return;
    }
    const visit = this.lastVisit();
    const queryParams: Record<string, string | number> = { nueva: 1, tel: card.phone };
    if (visit?.service_id) {
      queryParams['servicio'] = visit.service_id;
    }
    if (visit?.staff_id) {
      queryParams['con'] = visit.staff_id;
    }
    this.close();
    void this.router.navigate(['/admin/agenda'], { queryParams });
  }

  /** Lista que se está viendo, en CSV (abre en Excel y Google Sheets). */
  protected exportCsv(): void {
    const head = ['Nombre', 'Teléfono', 'Correo', 'Visitas', 'Gastado', 'Cancelaciones', 'Faltas', 'Última visita', 'Próxima cita', 'Cumpleaños'];
    const rows = this.visible().map((row) => [
      row.full_name, row.phone, row.email ?? '', row.visit_count, row.total_spent, row.cancel_count, row.no_show_count ?? 0,
      row.last_visit ?? '', row.next_visit?.slice(0, 16).replace('T', ' ') ?? '', row.birthday ?? '',
    ]);
    const csv = [head, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `clientes-${this.today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private patchRow(id: number, patch: Partial<ClientRow>): void {
    this.clients.update((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  protected initials(name: string): string {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '·'
    );
  }

  protected spent(amount: number): string {
    return this.money.format(amount);
  }

  protected visitWhen(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : this.when.format(date);
  }

  /** "Hace 12 días", "Ayer", "Hoy". */
  protected ago(day: string | null | undefined): string {
    if (!day) {
      return '';
    }
    const days = Math.round((new Date(`${this.today}T12:00:00`).getTime() - new Date(`${day}T12:00:00`).getTime()) / 86_400_000);
    return days <= 0 ? 'Hoy' : days === 1 ? 'Ayer' : `Hace ${days} días`;
  }

  /** "Invitado hace 3 días", "Felicitado ayer": lo último que se le mandó desde Nexia. */
  protected contactNote(row: { last_contact_at?: string | null; last_contact_kind?: string | null }): string {
    if (!row.last_contact_at) {
      return '';
    }
    const verb = row.last_contact_kind === 'felicitar' ? 'Felicitado' : row.last_contact_kind === 'otro' ? 'Contactado' : 'Invitado';
    const days = this.ago(row.last_contact_at.slice(0, 10));
    return `${verb} ${days === 'Hoy' ? 'hoy' : days === 'Ayer' ? 'ayer' : days.toLowerCase()}`;
  }

  protected contactKind(kind: string): string {
    return kind === 'felicitar' ? 'Felicitación' : kind === 'volver' ? 'Invitación a volver (Te toca)' : kind === 'invitar' ? 'Invitación a volver' : 'Mensaje';
  }

  /** Al abrir el WhatsApp queda anotado, para no invitar dos veces y poder medir si regresó. */
  protected logContact(row: ClientRow, kind: 'invitar' | 'felicitar'): void {
    const now = new Date();
    const stamp = `${this.today}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.clients.update((rows) => rows.map((item) => (item.id === row.id ? { ...item, last_contact_at: stamp, last_contact_kind: kind } : item)));
    this.bookingApi.logContact(row.id, kind).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  protected nextLabel(value: string): string {
    return this.shortDay.format(new Date(value));
  }

  /** Una cita agendada cuya fecha ya pasó no es "Próxima": quedó sin cobrar. */
  protected isPast(value: string): boolean {
    return new Date(value).getTime() < Date.now();
  }

  protected chat(phone: string): string {
    return whatsappLink(phone, '');
  }

  protected tel(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `tel:${digits.length === 10 ? `+52${digits}` : `+${digits}`}`;
  }

  protected birthdayWish(row: ClientRow): string {
    return whatsappLink(row.phone, this.copy.message('birthday', { nombre: firstName(row.full_name), negocio: this.shopName() }));
  }

  protected missYou(row: ClientRow): string {
    return whatsappLink(row.phone, this.copy.message('miss_you', { nombre: firstName(row.full_name), negocio: this.shopName() }));
  }

  private shopName(): string {
    return this.auth.currentUser()?.businessName ?? '';
  }
}

/** CSV con comas o punto y coma, y comillas. */
function parseCsv(text: string): string[][] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  const sep = (lines[0]?.split(';').length ?? 0) > (lines[0]?.split(',').length ?? 0) ? ';' : ',';
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === sep && !quoted) {
        cells.push(cell);
        cell = '';
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  });
}

/** AAAA-MM-DD o DD/MM/AAAA a AAAA-MM-DD. */
function isoDay(value: string): string | null {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

/** 10 dígitos; si pegan +52 se quita. Vacío si no es válido. */
function cleanPhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '');
  return digits.length === 10 ? digits : '';
}

function readError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') {
    return error.error.detail;
  }
  return fallback;
}
