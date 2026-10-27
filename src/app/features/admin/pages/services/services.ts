import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { BusinessCopy } from '@core/business-copy';
import { Service, ServiceVariant, ServiceWrite } from '@core/models/service.model';
import { Staff } from '@core/models/staff.model';
import { ShopService } from '@core/services/shop.service';
import { StaffService } from '@core/services/staff.service';
import { Confirm } from '@shared/components/confirm/confirm';
import { Toasts } from '@core/toasts';
import { ServicesService } from '@core/services/services.service';
import { PickFieldComponent } from '@shared/components/when-field/when-field';

@Component({
  selector: 'app-services-page',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    PickFieldComponent,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './services.html',
})
export class ServicesPageComponent {
  protected readonly copy = inject(BusinessCopy);
  private readonly servicesApi = inject(ServicesService);
  private readonly toasts = inject(Toasts);
  private readonly staffApi = inject(StaffService);
  private readonly shopApi = inject(ShopService);
  private readonly confirm = inject(Confirm);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private readonly categoryEditor = viewChild.required<TemplateRef<unknown>>('categoryEditor');
  private dialogRef: MatDialogRef<unknown> | null = null;
  private readonly currency = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });

  protected readonly services = signal<Service[]>([]);
  protected readonly catalog = signal<string[]>([]);
  /** Categorías con id, para renombrar y borrar. */
  protected readonly categoryRows = signal<{ id: number; name: string }[]>([]);
  protected readonly staff = signal<Staff[]>([]);
  /** Lo que deja cada servicio por hora (últimos 90 días), por nombre. */
  protected readonly profit = signal<Map<string, number>>(new Map());
  protected readonly query = signal('');
  protected readonly managingCategories = signal(false);
  protected readonly raising = signal(false);
  protected raisePercent = '10';
  protected raiseCategory = '';
  /** Variantes del servicio que se edita. */
  protected readonly variants = signal<ServiceVariant[]>([]);
  /** "Pausado · Deshacer" durante 6 segundos. */
  protected readonly undoPause = signal<Service | null>(null);
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly categoryFilter = signal('');
  protected readonly categoryName = signal('');
  protected readonly categoryError = signal<string | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly editing = signal<Service | null>(null);
  protected readonly photoPreview = signal('');
  protected readonly photoPending = signal(false);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    category: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
    deposit_amount: new FormControl('', { nonNullable: true }),
    price: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    variable_price: new FormControl(false, { nonNullable: true }),
    duration_minutes: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(1440), Validators.pattern(/^\d+$/)],
    }),
    is_active: new FormControl(true, { nonNullable: true }),
    image_url: new FormControl('', { nonNullable: true }),
    questions: new FormControl('', { nonNullable: true }),
    capacity: new FormControl('1', { nonNullable: true }),
    returnDays: new FormControl('', { nonNullable: true }),
    supplyCost: new FormControl('', { nonNullable: true }),
    featured: new FormControl(false, { nonNullable: true }),
    cleanup: new FormControl('', { nonNullable: true }),
    waitStart: new FormControl('', { nonNullable: true }),
    waitMinutes: new FormControl('', { nonNullable: true }),
  });
  protected readonly durationPicks = [30, 45, 60, 90, 120];

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

  /** Recién registrada: solo están los servicios sugeridos del giro, todos apagados. */
  protected readonly onlySuggested = computed(() => this.services().length > 0 && this.services().every((row) => !row.is_active));
  protected readonly categories = computed(() =>
    [...this.catalog()].sort((a, b) => a.localeCompare(b, 'es')),
  );
  protected readonly categoryPicks = computed(() => [
    { value: '', label: 'Elige una categoría' },
    ...this.categories().map((name) => ({ value: name, label: name })),
  ]);

  protected readonly visible = computed(() => {
    const name = this.categoryFilter();
    const term = this.query().trim().toLowerCase();
    return this.services().filter((row) => (!name || row.category === name) && (!term || row.name.toLowerCase().includes(term)));
  });
  /** Ordenar solo tiene sentido viendo todos, sin buscar. */
  protected readonly canOrder = computed(() => !this.categoryFilter() && !this.query().trim());

  /** Quién hace cada servicio (Equipo → servicios de cada colaboradora). */
  protected staffFor(service: Service): string[] {
    return this.staff().filter((member) => member.is_active && (member.service_ids ?? []).includes(service.id)).map((member) => member.full_name.split(' ')[0]);
  }

  /** "Más rentable" / "Deja poco" según lo que dejó por hora en los últimos 90 días. */
  protected profitTag(service: Service): { text: string; tone: string } | null {
    const map = this.profit();
    const value = map.get(service.name);
    if (value === undefined || map.size < 2) {
      return null;
    }
    const values = [...map.values()].sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    if (value === values.at(-1)) {
      return { text: `Más rentable · ${this.formatPrice(value)}/h`, tone: 'badge-ok' };
    }
    if (value < median * 0.6) {
      return { text: `Deja poco: ${this.formatPrice(value)}/h`, tone: 'badge-warn' };
    }
    return { text: `${this.formatPrice(value)}/h`, tone: 'badge-neutral' };
  }

  protected readonly dialogTitle = computed(() =>
    this.editing() ? 'Editar servicio' : 'Crear servicio',
  );

  protected readonly nameError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('name', { required: 'Ingresa el nombre del servicio.' });
  });

  protected readonly priceError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('price', {
      required: 'Ingresa el precio.',
      min: 'El precio no puede ser negativo.',
    });
  });

  protected readonly durationError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('duration_minutes', {
      required: 'Ingresa la duración.',
      min: 'La duración mínima es 1 minuto.',
      max: 'La duración máxima es 1440 minutos.',
      pattern: 'Usa un número entero de minutos.',
    });
  });

  constructor() {
    this.load();
  }

  protected formatPrice(price: number): string {
    return this.currency.format(price);
  }

  protected openCategory(): void {
    this.categoryName.set('');
    this.categoryError.set(null);
    this.dialogRef = this.dialog.open(this.categoryEditor(), {
      width: '420px',
      maxWidth: 'calc(100vw - 24px)',
      panelClass: 'service-sheet',
      autoFocus: 'first-tabbable',
    });
  }

  protected saveCategory(): void {
    const name = this.categoryName().trim();
    if (!name || this.isSaving()) {
      this.categoryError.set(name ? null : 'Escribe el nombre de la categoría.');
      return;
    }
    this.isSaving.set(true);
    this.categoryError.set(null);
    this.servicesApi
      .createCategory(name)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (row) => {
          this.catalog.update((items) => (items.includes(row.name) ? items : [...items, row.name]));
          this.categoryFilter.set(row.name);
          this.dialogRef?.close();
          this.toasts.show('Se creó la categoría.');
        },
        error: (error: HttpErrorResponse) => {
          this.categoryError.set(this.messageFor(error, 'No pudimos crear la categoría.'));
        },
      });
  }

  protected openCreate(category = ''): void {
    this.editing.set(null);
    this.formError.set(null);
    this.photoPreview.set('');
    this.photoPending.set(false);
    this.form.reset({
      name: '',
      category: category,
      description: '',
      price: '',
      deposit_amount: '',
      variable_price: false,
      duration_minutes: '',
      is_active: true,
      image_url: '',
      questions: '',
      capacity: '1',
      returnDays: '',
      supplyCost: '',
      featured: false,
      cleanup: '',
      waitStart: '',
      waitMinutes: '',
    });
    this.variants.set([]);
    this.openEditor();
  }

  protected openEdit(service: Service): void {
    this.editing.set(service);
    this.formError.set(null);
    this.photoPreview.set(service.image_url ?? '');
    this.photoPending.set(false);
    this.form.setValue({
      name: service.name,
      category: service.category ?? '',
      description: service.description ?? '',
      price: String(service.price),
      deposit_amount: service.deposit_amount == null ? '' : String(service.deposit_amount),
      duration_minutes: String(service.duration_minutes),
      variable_price: Boolean(service.variable_price),
      is_active: service.is_active,
      image_url: service.image_url ?? '',
      questions: service.questions ?? '',
      capacity: String(service.capacity ?? 1),
      returnDays: service.return_days ? String(service.return_days) : '',
      supplyCost: service.supply_cost ? String(service.supply_cost) : '',
      featured: Boolean(service.featured),
      cleanup: service.cleanup_minutes ? String(service.cleanup_minutes) : '',
      waitStart: service.wait_minutes && service.wait_start ? String(service.wait_start) : '',
      waitMinutes: service.wait_minutes ? String(service.wait_minutes) : '',
    });
    this.variants.set([...(service.variants ?? [])]);
    this.openEditor();
  }

  protected closeForm(): void {
    if (this.isSaving()) {
      return;
    }
    this.dialogRef?.close();
  }

  protected save(): void {
    this.form.markAllAsTouched();
    this.validationTick.update((tick) => tick + 1);
    if (this.form.invalid || this.isSaving()) {
      return;
    }

    const raw = this.form.getRawValue();
    const payload: ServiceWrite = {
      name: raw.name.trim(),
      category: raw.category.trim() || null,
      description: raw.description.trim() || null,
      price: Number(raw.price),
      deposit_amount: String(raw.deposit_amount ?? '').trim() ? Number(raw.deposit_amount) : null,
      duration_minutes: Number(raw.duration_minutes),
      variable_price: raw.variable_price,
      is_active: raw.is_active,
      image_url: raw.image_url || null,
      questions: raw.questions.trim() || null,
      capacity: Number(raw.capacity) || 1,
      return_days: Number(raw.returnDays) >= 7 ? Math.min(Math.round(Number(raw.returnDays)), 365) : null,
      supply_cost: Number(raw.supplyCost) > 0 ? Number(raw.supplyCost) : null,
      featured: raw.featured,
      cleanup_minutes: Math.max(0, Math.round(Number(raw.cleanup) || 0)),
      wait_start: Number(raw.waitMinutes) > 0 && Number(raw.waitStart) > 0 ? Math.round(Number(raw.waitStart)) : null,
      wait_minutes: Number(raw.waitStart) > 0 ? Math.max(0, Math.round(Number(raw.waitMinutes) || 0)) : 0,
      variants: this.variants().filter((row) => row.name.trim()).map((row) => ({ ...row, name: row.name.trim() })),
    };
    const minutes = Number(raw.duration_minutes);
    if ((payload.wait_minutes ?? 0) > 0 && (payload.wait_start ?? 0) + (payload.wait_minutes ?? 0) >= minutes) {
      this.formError.set('La espera tiene que terminar antes de que acabe el servicio.');
      return;
    }
    const current = this.editing();
    const request = current
      ? this.servicesApi.updateService(current.id, payload)
      : this.servicesApi.createService(payload);

    this.isSaving.set(true);
    this.formError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.isSaving.set(false))).subscribe({
      next: () => {
        this.dialogRef?.close();
        this.load(true);
        this.toasts.show(current ? 'Se guardó el servicio.' : 'Se creó el servicio.');
      },
      error: (error: HttpErrorResponse) => {
        this.formError.set(this.messageFor(error, 'No pudimos guardar el servicio.'));
      },
    });
  }

  protected toggleActive(service: Service, undo = false): void {
    if (this.pendingId() !== null) {
      return;
    }
    if (service.is_active && !undo) {
      this.offerUndo(service);
    }

    this.pendingId.set(service.id);
    this.loadError.set(null);

    const onError = (error: HttpErrorResponse): void => {
      this.loadError.set(this.messageFor(error, 'No pudimos cambiar el estado del servicio.'));
    };

    if (service.is_active) {
      this.servicesApi
        .deleteService(service.id)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.pendingId.set(null)),
        )
        .subscribe({
          next: () => this.replaceService(service, undefined),
          error: onError,
        });
      return;
    }

    this.servicesApi
      .updateService(service.id, { is_active: true })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pendingId.set(null)),
      )
      .subscribe({
        next: (updated) => this.replaceService(service, updated),
        error: onError,
      });
  }

  private offerUndo(service: Service): void {
    if (this.undoTimer) {
      clearTimeout(this.undoTimer);
    }
    this.undoPause.set(service);
    this.undoTimer = setTimeout(() => this.undoPause.set(null), 6000);
  }

  protected undoPaused(): void {
    const service = this.undoPause();
    this.undoPause.set(null);
    if (service) {
      this.toggleActive({ ...service, is_active: false }, true);
    }
  }

  protected async remove(service: Service): Promise<void> {
    const ok = await this.confirm.ask({
      title: `¿Borrar "${service.name}"?`,
      message: 'Desaparece de tu lista y de tu página. Si ya tiene citas no se puede borrar: en ese caso, páusalo.',
      confirm: 'Borrar',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.servicesApi
      .removeService(service.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.services.update((rows) => rows.filter((row) => row.id !== service.id));
          this.toasts.show('Servicio borrado.');
        },
        error: (error: HttpErrorResponse) => this.loadError.set(typeof error.error?.detail === 'string' ? error.error.detail : 'No pudimos borrar el servicio.'),
      });
  }

  protected duplicate(service: Service): void {
    this.servicesApi
      .duplicateService(service.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (copy) => {
          this.load(true);
          this.openEdit(copy);
          this.toasts.show('Copia creada (pausada). Ajústala y actívala.');
        },
        error: () => this.loadError.set('No pudimos duplicar el servicio.'),
      });
  }

  /** Sube o baja un lugar en la página de reservas. */
  protected move(service: Service, step: -1 | 1): void {
    const rows = [...this.services()];
    const index = rows.findIndex((row) => row.id === service.id);
    const target = index + step;
    if (index < 0 || target < 0 || target >= rows.length) {
      return;
    }
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this.services.set(rows);
    this.servicesApi.orderServices(rows.map((row) => row.id)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => this.load(true) });
  }

  protected applyRaise(): void {
    const percent = Number(this.raisePercent);
    if (!percent) {
      return;
    }
    this.servicesApi
      .raisePrices(percent, this.raiseCategory || null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.raising.set(false);
          this.load(true);
          this.toasts.show(`Se ${percent > 0 ? 'subieron' : 'bajaron'} ${rows.length} precios ${Math.abs(percent)}%.`);
        },
        error: () => this.loadError.set('No pudimos cambiar los precios.'),
      });
  }

  protected async renameCategory(row: { id: number; name: string }, value: string): Promise<void> {
    const name = value.trim();
    if (!name || name === row.name) {
      return;
    }
    this.servicesApi
      .renameCategory(row.id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.categoryFilter() === row.name) {
            this.categoryFilter.set(name);
          }
          this.load(true);
        },
        error: (error: HttpErrorResponse) => this.loadError.set(typeof error.error?.detail === 'string' ? error.error.detail : 'No pudimos renombrar la categoría.'),
      });
  }

  protected async removeCategory(row: { id: number; name: string }): Promise<void> {
    const count = this.services().filter((item) => item.category === row.name).length;
    const ok = await this.confirm.ask({
      title: `¿Borrar la categoría "${row.name}"?`,
      message: count ? `Sus ${count} servicios se quedan, pero sin categoría.` : 'No tiene servicios.',
      confirm: 'Borrar categoría',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.servicesApi
      .deleteCategory(row.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.categoryFilter() === row.name) {
          this.categoryFilter.set('');
        }
        this.load(true);
      });
  }

  protected countIn(name: string): number {
    return this.services().filter((item) => item.category === name).length;
  }

  // Variantes
  protected addVariant(): void {
    const price = Number(this.form.controls.price.value) || 0;
    const minutes = Number(this.form.controls.duration_minutes.value) || 60;
    this.variants.update((rows) => [...rows, { name: '', price, duration_minutes: minutes }]);
  }

  protected setVariant(index: number, key: keyof ServiceVariant, value: string): void {
    this.variants.update((rows) => rows.map((row, at) => (at === index ? { ...row, [key]: key === 'name' ? value : Number(value) || 0 } : row)));
  }

  protected removeVariant(index: number): void {
    this.variants.update((rows) => rows.filter((_, at) => at !== index));
  }

  private replaceService(current: Service, updated: Service | void): void {
    const next = updated ?? { ...current, is_active: false };
    this.services.update((items) => items.map((item) => (item.id === current.id ? next : item)));
  }

  protected clearPhoto(): void {
    const current = this.photoPreview();
    if (current.startsWith('blob:')) {
      URL.revokeObjectURL(current);
    }
    this.photoPreview.set('');
    this.photoPending.set(false);
    this.form.controls.image_url.setValue('', { emitEvent: false });
  }

  protected pickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const current = this.photoPreview();
    if (current.startsWith('blob:')) {
      URL.revokeObjectURL(current);
    }
    this.photoPreview.set(URL.createObjectURL(file));
    this.photoPending.set(true);
    this.formError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const width = 480;
        const height = 360;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          this.photoPending.set(false);
          return;
        }
        const scale = Math.max(width / image.width, height / image.height);
        const drawnWidth = image.width * scale;
        const drawnHeight = image.height * scale;
        context.drawImage(image, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
        const url = canvas.toDataURL('image/jpeg', 0.7);
        if (url.length > 180000) {
          this.photoPending.set(false);
          this.formError.set('Esa foto es demasiado pesada.');
          return;
        }
        this.form.controls.image_url.setValue(url, { emitEvent: false });
        this.photoPending.set(false);
      };
      image.onerror = fail;
      image.src = String(reader.result);
    };
    const fail = () => {
      this.photoPending.set(false);
      this.photoPreview.set(this.form.controls.image_url.value);
      this.formError.set('No pudimos leer esa foto. Prueba con otra (JPG o PNG).');
    };
    reader.onerror = fail;
    reader.readAsDataURL(file);
  }

  private openEditor(): void {
    this.dialogRef = this.dialog.open(this.editor(), {
      width: '980px',
      maxWidth: 'calc(100vw - 24px)',
      panelClass: 'service-sheet',
      autoFocus: 'first-tabbable',
    });
  }

  private load(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
    }
    this.loadError.set(null);
    const today = new Date();
    const from = new Date(today.getTime() - 90 * 86_400_000);
    const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.staffApi.getStaff().pipe(catchError(() => of([] as Staff[])), takeUntilDestroyed(this.destroyRef)).subscribe((rows) => this.staff.set(rows));
    this.shopApi
      .report(day(from), day(today))
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((report) => this.profit.set(new Map((report?.service_stats ?? []).map((row) => [row.name, row.per_hour]))));
    forkJoin({
      services: this.servicesApi.getServices(),
      categories: this.servicesApi.getCategories(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: ({ services, categories }) => {
          this.services.set(services);
          this.catalog.set(categories.map((item) => item.name));
          this.categoryRows.set(categories);
        },
        error: (error: HttpErrorResponse) => {
          this.loadError.set(this.messageFor(error, 'No pudimos cargar los servicios.'));
        },
      });
  }

  private fieldError(
    name: 'name' | 'price' | 'duration_minutes',
    messages: Record<string, string>,
  ): string {
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    const errorKey = Object.keys(messages).find((key) => control.hasError(key));
    return errorKey ? messages[errorKey] : '';
  }

  private messageFor(error: HttpErrorResponse, fallback: string): string {
    return error.status === 0 ? 'No hay conexión con el servidor.' : fallback;
  }
}
