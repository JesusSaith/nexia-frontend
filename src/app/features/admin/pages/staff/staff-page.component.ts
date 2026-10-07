import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of, switchMap } from 'rxjs';

import { Service } from '@core/models/service.model';
import { Staff, StaffWrite } from '@core/models/staff.model';
import { ServicesService } from '@core/services/services.service';
import { StaffService } from '@core/services/staff.service';

type StaffSection = 'info' | 'services' | 'account';

@Component({
  selector: 'app-staff-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './staff-page.component.html',
})
export class StaffPageComponent {
  private readonly staffApi = inject(StaffService);
  private readonly servicesApi = inject(ServicesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private dialogRef: MatDialogRef<unknown> | null = null;

  protected readonly sections: { id: StaffSection; label: string }[] = [
    { id: 'info', label: 'Información' },
    { id: 'services', label: 'Servicios' },
    // FUTURE_PHASE_2_UNIFIED_PLATFORM: { id: 'account', label: 'Cuenta de acceso' },
  ];
  protected readonly staff = signal<Staff[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly section = signal<StaffSection>('info');
  protected readonly selectedServices = signal<number[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly editing = signal<Staff | null>(null);
  private readonly validationTick = signal(0);

  protected readonly form = new FormGroup({
    full_name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    role_title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(255)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(255)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
    avatar_url: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(180000)] }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    account_email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(255)],
    }),
    account_password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(72)],
    }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });
  protected readonly activeServices = computed(() => this.services().filter((item) => item.is_active));
  protected readonly dialogTitle = computed(() =>
    this.editing() ? 'Editar colaborador' : 'Nuevo colaborador',
  );
  protected readonly nameError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('full_name', { required: 'Ingresa el nombre completo.' });
  });
  protected readonly roleError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('role_title', { required: 'Ingresa el puesto.' });
  });
  protected readonly emailError = computed(() => {
    this.formEvents();
    this.validationTick();
    return this.fieldError('email', { email: 'Ingresa un correo válido.' });
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.dialogRef?.close());
    this.load();
  }

  protected initials(name: string): string {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'EQ'
    );
  }

  protected serviceName(id: number): string {
    return this.services().find((item) => item.id === id)?.name ?? 'Servicio';
  }

  protected hasService(id: number): boolean {
    return this.selectedServices().includes(id);
  }

  protected toggleService(id: number, checked: boolean): void {
    this.selectedServices.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.section.set('info');
    this.selectedServices.set([]);
    this.formError.set(null);
    this.form.reset({
      full_name: '',
      role_title: '',
      email: '',
      phone: '',
      avatar_url: '',
      bio: '',
      account_email: '',
      account_password: '',
    });
    this.openEditor();
  }

  protected openEdit(member: Staff): void {
    this.editing.set(member);
    this.section.set('info');
    this.selectedServices.set([...(member.service_ids ?? [])]);
    this.formError.set(null);
    this.form.reset({
      full_name: member.full_name,
      role_title: member.role_title,
      email: member.email ?? '',
      phone: member.phone ?? '',
      avatar_url: member.avatar_url ?? '',
      bio: member.bio ?? '',
      account_email: '',
      account_password: '',
    });
    this.openEditor();
  }

  protected onPhoto(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) {
          return;
        }
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        const url = canvas.toDataURL('image/jpeg', 0.72);
        if (url.length > 180000) {
          this.formError.set('Esa foto es demasiado pesada.');
          return;
        }
        this.form.controls.avatar_url.setValue(url);
        this.formError.set(null);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
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
    const accountEmail = raw.account_email.trim();
    const accountPassword = raw.account_password;
    // FUTURE_PHASE_2_UNIFIED_PLATFORM: la cuenta de acceso del colaborador queda apagada.
    const needsAccount = false && Boolean(accountEmail || accountPassword) && this.editing()?.user_id == null;
    if (needsAccount && (!accountEmail || accountPassword.length < 8)) {
      this.section.set('account');
      this.formError.set('La cuenta necesita un correo y una contraseña de al menos 8 caracteres.');
      return;
    }

    const payload: StaffWrite = {
      full_name: raw.full_name.trim(),
      role_title: raw.role_title.trim(),
      email: raw.email.trim() || null,
      phone: raw.phone.trim() || null,
      avatar_url: raw.avatar_url.trim() || null,
      bio: raw.bio.trim() || null,
    };
    const current = this.editing();
    const serviceIds = this.selectedServices();
    const request = current
      ? this.staffApi.updateStaff(current.id, payload)
      : this.staffApi.createStaff(payload).pipe(
          switchMap((created) => this.staffApi.updateStaff(created.id, payload)),
        );

    this.isSaving.set(true);
    this.formError.set(null);
    request
      .pipe(
        switchMap((saved) => this.staffApi.updateStaffServices(saved.id, serviceIds)),
        switchMap((saved) =>
          needsAccount
            ? this.staffApi.createAccount(saved.id, { email: accountEmail, password: accountPassword })
            : of(saved),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.dialogRef?.close();
          this.load(true);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.formError.set(readError(error, 'No pudimos guardar al colaborador.'));
        },
      });
  }

  protected toggleActive(member: Staff): void {
    if (this.pendingId() !== null) {
      return;
    }
    this.pendingId.set(member.id);
    this.loadError.set(null);
    const onError = (error: unknown): void => {
      this.pendingId.set(null);
      this.loadError.set(readError(error, 'No pudimos cambiar el estado del colaborador.'));
    };
    if (member.is_active) {
      this.staffApi
        .deleteStaff(member.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.staff.update((items) =>
              items.map((item) => (item.id === member.id ? { ...item, is_active: false } : item)),
            );
            this.pendingId.set(null);
          },
          error: onError,
        });
      return;
    }
    this.staffApi
      .updateStaff(member.id, { is_active: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.staff.update((items) => items.map((item) => (item.id === member.id ? updated : item)));
          this.pendingId.set(null);
        },
        error: onError,
      });
  }

  private openEditor(): void {
    this.dialogRef = this.dialog.open(this.editor(), {
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
    });
  }

  private load(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
    }
    this.loadError.set(null);
    forkJoin({
      staff: this.staffApi.getStaff(),
      services: this.servicesApi.getServices(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ staff, services }) => {
          this.staff.set(staff);
          this.services.set(services);
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el equipo.'));
        },
      });
  }

  private fieldError(
    name: 'full_name' | 'role_title' | 'email',
    messages: Record<string, string>,
  ): string {
    const control = this.form.controls[name];
    if (!control.touched || control.valid) {
      return '';
    }
    const errorKey = Object.keys(messages).find((key) => control.hasError(key));
    return errorKey ? messages[errorKey] : '';
  }
}

function readError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'No hay conexión con el servidor.';
  }
  const detail = error.error?.detail;
  if (typeof detail === 'string' && detail.trim() && detail !== 'Not Found') {
    return detail;
  }
  return fallback;
}
