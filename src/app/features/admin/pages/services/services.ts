import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize, forkJoin } from 'rxjs';

import { Service, ServiceWrite } from '@core/models/service.model';
import { Toasts } from '@core/toasts';
import { ServicesService } from '@core/services/services.service';
import { PickFieldComponent } from '@shared/components/when-field/when-field';

@Component({
  selector: 'app-services-page',
  imports: [
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
  private readonly servicesApi = inject(ServicesService);
  private readonly toasts = inject(Toasts);
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
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

  protected readonly categories = computed(() =>
    [...this.catalog()].sort((a, b) => a.localeCompare(b, 'es')),
  );
  protected readonly categoryPicks = computed(() => [
    { value: '', label: 'Elige una categoría' },
    ...this.categories().map((name) => ({ value: name, label: name })),
  ]);

  protected readonly visible = computed(() => {
    const name = this.categoryFilter();
    const rows = this.services();
    return name ? rows.filter((row) => row.category === name) : rows;
  });

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
    });
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
    });
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
    };
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

  protected toggleActive(service: Service): void {
    if (this.pendingId() !== null) {
      return;
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
      image.src = String(reader.result);
    };
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
