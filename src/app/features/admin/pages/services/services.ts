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
import { MatTableModule } from '@angular/material/table';
import { finalize } from 'rxjs';

import { Service, ServiceWrite } from '@core/models/service.model';
import { ServicesService } from '@core/services/services.service';

@Component({
  selector: 'app-services-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
  templateUrl: './services.html',
})
export class ServicesPageComponent {
  private readonly servicesApi = inject(ServicesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private dialogRef: MatDialogRef<unknown> | null = null;
  private readonly currency = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });

  protected readonly services = signal<Service[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly editing = signal<Service | null>(null);
  protected readonly columns = ['name', 'price', 'duration', 'status', 'actions'];
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
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
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });

  protected readonly dialogTitle = computed(() =>
    this.editing() ? 'Editar servicio' : 'Nuevo servicio',
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

  protected openCreate(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', description: '', price: '', deposit_amount: '', variable_price: false, duration_minutes: '' });
    this.openEditor();
  }

  protected openEdit(service: Service): void {
    this.editing.set(service);
    this.formError.set(null);
    this.form.setValue({
      name: service.name,
      description: service.description ?? '',
      price: String(service.price),
      deposit_amount: service.deposit_amount == null ? '' : String(service.deposit_amount),
      duration_minutes: String(service.duration_minutes),
      variable_price: Boolean(service.variable_price),
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
      description: raw.description.trim() || null,
      price: Number(raw.price),
      deposit_amount: String(raw.deposit_amount ?? '').trim() ? Number(raw.deposit_amount) : null,
      duration_minutes: Number(raw.duration_minutes),
      variable_price: raw.variable_price,
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

  private openEditor(): void {
    this.dialogRef = this.dialog.open(this.editor(), {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
    });
  }

  private load(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
    }
    this.loadError.set(null);
    this.servicesApi
      .getServices()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: (items) => this.services.set(items),
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
