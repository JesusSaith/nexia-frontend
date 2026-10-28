import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin, of, switchMap, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { BusinessCopy } from '@core/business-copy';
import { examplesFor, kindOf } from '@core/business-kinds';
import { Toasts } from '@core/toasts';
import { Service } from '@core/models/service.model';
import { Staff, StaffAccount, StaffWrite } from '@core/models/staff.model';
import { AuthService } from '@core/services/auth.service';
import { ServicesService } from '@core/services/services.service';
import { StaffService } from '@core/services/staff.service';
import { ScheduleItem } from '@core/models/schedule.model';
import { AppointmentsService } from '@core/services/appointments.service';
import { SchedulesService } from '@core/services/schedules.service';
import { ShopService, CommissionRow } from '@core/services/shop.service';
import { STAFF_PALETTE, staffColorOf } from '@core/staff-colors';
import { Confirm } from '@shared/components/confirm/confirm';

type StaffSection = 'info' | 'services';

@Component({
  selector: 'app-staff-page',
  imports: [
    RouterLink,
    FormsModule,
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
  protected readonly copy = inject(BusinessCopy);
  /** Ejemplo de descripción pública según el giro (se deduce de cómo se llama al personal). */
  protected readonly bioExample = computed(() => examplesFor(kindOf(null, this.copy.text().person)).bio);
  private readonly servicesApi = inject(ServicesService);
  private readonly toasts = inject(Toasts);
  private readonly schedulesApi = inject(SchedulesService);
  private readonly appointmentsApi = inject(AppointmentsService);
  private readonly shopApi = inject(ShopService);
  private readonly confirm = inject(Confirm);
  protected readonly palette = STAFF_PALETTE;
  /** Horario de cada quien y sus números del mes. */
  protected readonly schedules = signal<Map<number, ScheduleItem[]>>(new Map());
  protected readonly month = signal<Map<number, CommissionRow>>(new Map());
  /** Quién no puede recibir citas y por qué. */
  protected readonly problems = computed(() => {
    const rows = this.staff().filter((member) => member.is_active);
    return {
      noSchedule: rows.filter((member) => !this.hasSchedule(member.id)).length,
      noServices: rows.filter((member) => !(member.service_ids ?? []).length).length,
    };
  });
  protected readonly undoOff = signal<Staff | null>(null);
  private undoTimer: ReturnType<typeof setTimeout> | null = null;
  // Vacaciones de una persona
  protected readonly vacationFor = signal<Staff | null>(null);
  protected vacationFrom = '';
  protected vacationTo = '';
  protected readonly vacationError = signal<string | null>(null);
  // Acceso al panel de una persona del equipo
  private readonly auth = inject(AuthService);
  protected readonly accessFor = signal<Staff | null>(null);
  protected accessEmail = '';
  protected readonly accessBusy = signal(false);
  protected readonly accessError = signal<string | null>(null);
  /** Contraseña temporal recién generada: solo se muestra una vez. */
  protected readonly accessResult = signal<StaffAccount | null>(null);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private dialogRef: MatDialogRef<unknown> | null = null;

  protected readonly sections: { id: StaffSection; label: string }[] = [
    { id: 'info', label: 'Información' },
    { id: 'services', label: 'Servicios' },
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
    commission_percent: new FormControl('0', { nonNullable: true }),
    goal: new FormControl('', { nonNullable: true }),
    tier_amount: new FormControl('', { nonNullable: true }),
    tier_percent: new FormControl('', { nonNullable: true }),
    color: new FormControl('', { nonNullable: true }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: undefined });
  protected readonly activeCount = computed(() => this.staff().filter((member) => member.is_active).length);
  protected readonly activeServices = computed(() => this.services().filter((item) => item.is_active));
  protected readonly photoPreview = signal<string | null>(null);
  protected readonly photoPending = signal(false);
  protected readonly dialogTitle = computed(() =>
    this.editing() ? `Editar ${this.copy.text().person.toLowerCase()}` : `Agregar ${this.copy.text().person.toLowerCase()}`,
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
      commission_percent: '0',
      goal: '',
      tier_amount: '',
      tier_percent: '',
      color: '',
    });
    this.photoPreview.set(null);
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
      commission_percent: String(member.commission_percent ?? 0),
      goal: member.goal ? String(member.goal) : '',
      tier_amount: member.tier_amount ? String(member.tier_amount) : '',
      tier_percent: member.tier_percent ? String(member.tier_percent) : '',
      color: member.color ?? '',
    });
    this.photoPreview.set(member.avatar_url || null);
    this.openEditor();
  }

  protected onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const preview = URL.createObjectURL(file);
    const previous = this.photoPreview();
    if (previous?.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }
    this.photoPreview.set(preview);
    this.photoPending.set(true);
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
          this.photoPending.set(false);
          return;
        }
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        const url = canvas.toDataURL('image/jpeg', 0.72);
        if (url.length > 180000) {
          this.formError.set('Esa foto es demasiado pesada.');
          this.photoPreview.set(this.form.controls.avatar_url.value || null);
          this.photoPending.set(false);
          return;
        }
        this.form.controls.avatar_url.setValue(url, { emitEvent: false });
        this.formError.set(null);
        this.photoPending.set(false);
      };
      image.onerror = fail;
      image.src = String(reader.result);
    };
    const fail = () => {
      this.photoPending.set(false);
      this.photoPreview.set(this.form.controls.avatar_url.value || null);
      this.formError.set('No pudimos leer esa foto. Prueba con otra (JPG o PNG).');
    };
    reader.onerror = fail;
    reader.readAsDataURL(file);
  }

  protected clearPhoto(): void {
    const previous = this.photoPreview();
    if (previous?.startsWith('blob:')) {
      URL.revokeObjectURL(previous);
    }
    this.photoPreview.set(null);
    this.form.controls.avatar_url.setValue('', { emitEvent: false });
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
    const payload: StaffWrite = {
      full_name: raw.full_name.trim(),
      role_title: raw.role_title.trim(),
      email: raw.email.trim() || null,
      phone: raw.phone.trim() || null,
      avatar_url: raw.avatar_url.trim() || null,
      bio: raw.bio.trim() || null,
      commission_percent: Math.min(100, Math.max(0, Number(raw.commission_percent) || 0)),
      goal: Number(raw.goal) > 0 ? Number(raw.goal) : null,
      tier_amount: Number(raw.tier_amount) > 0 ? Number(raw.tier_amount) : null,
      tier_percent: Number(raw.tier_percent) > 0 ? Math.min(100, Number(raw.tier_percent)) : null,
      color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : null,
    };
    const current = this.editing();
    const serviceIds = this.selectedServices();
    const request = current
      ? this.staffApi.updateStaff(current.id, payload)
      : this.staffApi.createStaff(payload).pipe(
          // Si un paso posterior falla, el siguiente Guardar actualiza en vez de crear otra vez.
          tap((created) => this.editing.set(created)),
          switchMap((created) => this.staffApi.updateStaff(created.id, payload)),
        );

    this.isSaving.set(true);
    this.formError.set(null);
    request
      .pipe(
        switchMap((saved) => this.staffApi.updateStaffServices(saved.id, serviceIds)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.dialogRef?.close();
          this.load(true);
          const person = this.copy.text().person.toLowerCase();
          this.toasts.show(current ? `Se guardó el ${person}.` : `Se creó el ${person}.`);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.formError.set(readError(error, 'No pudimos guardar al colaborador.'));
        },
      });
  }

  /** Desactivar avisa cuántas citas próximas tiene (no se cancelan solas) y se puede deshacer. */
  protected async deactivate(member: Staff): Promise<void> {
    const today = new Date();
    const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const upcoming = await new Promise<number>((resolve) =>
      this.appointmentsApi
        .getAppointments({ staff_id: member.id, start_date: day(today), end_date: day(new Date(today.getTime() + 120 * 86_400_000)) })
        .pipe(catchError(() => of([])))
        .subscribe((rows) => resolve(rows.filter((row) => row.status === 'scheduled' || row.status === 'awaiting_deposit').length)),
    );
    const ok = await this.confirm.ask({
      title: `¿Desactivar a ${member.full_name}?`,
      message: upcoming
        ? `Tiene ${upcoming} ${upcoming === 1 ? 'cita próxima' : 'citas próximas'}: no se cancelan solas. Muévelas a otra persona en la Agenda. Desde ahora no recibe reservas nuevas.`
        : 'Deja de aparecer en tu página y no recibe reservas nuevas. Su historial se queda.',
      confirm: 'Desactivar',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.toggleActive(member);
    if (this.undoTimer) {
      clearTimeout(this.undoTimer);
    }
    this.undoOff.set(member);
    this.undoTimer = setTimeout(() => this.undoOff.set(null), 6000);
  }

  protected undoDeactivate(): void {
    const member = this.undoOff();
    this.undoOff.set(null);
    if (member) {
      this.toggleActive({ ...member, is_active: false });
    }
  }

  protected hasSchedule(staffId: number): boolean {
    return (this.schedules().get(staffId) ?? []).some((row) => row.is_active);
  }

  /** "Lun a vie 9:00–18:00", "Lun, mié y sáb 10:00–19:00", o "Sin horario". */
  protected scheduleLabel(staffId: number): string {
    const rows = (this.schedules().get(staffId) ?? []).filter((row) => row.is_active).sort((a, b) => a.day_of_week - b.day_of_week);
    if (!rows.length) {
      return 'Sin horario propio';
    }
    const names = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const days = rows.map((row) => row.day_of_week);
    const run = days.every((value, index) => index === 0 || value === days[index - 1] + 1);
    const label = run && days.length > 2 ? `${names[days[0]]} a ${names[days.at(-1)!].toLowerCase()}` : days.map((value) => names[value]).join(', ');
    const hours = new Set(rows.map((row) => `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`));
    return hours.size === 1 ? `${label} · ${[...hours][0]}` : `${label} · horario variable`;
  }

  protected colorOf(staffId: number): string {
    return staffColorOf(this.staff(), staffId);
  }

  protected money(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(amount);
  }

  // Servicios del formulario: todos/ninguno y por categoría
  protected readonly serviceGroups = computed(() => {
    const groups = new Map<string, Service[]>();
    for (const service of this.activeServices()) {
      const key = service.category || 'Sin categoría';
      groups.set(key, [...(groups.get(key) ?? []), service]);
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items }));
  });

  protected selectAll(all: boolean): void {
    this.selectedServices.set(all ? this.activeServices().map((item) => item.id) : []);
  }

  /** La cuenta de la dueña también cuelga de su ficha del equipo: esa no se administra desde aquí. */
  protected canManageAccess(member: Staff): boolean {
    return member.user_id == null || String(member.user_id) !== this.auth.currentUser()?.id;
  }

  protected openAccess(member: Staff): void {
    this.accessFor.set(member);
    this.accessEmail = member.email ?? '';
    this.accessError.set(null);
    this.accessResult.set(null);
  }

  protected closeAccess(): void {
    this.accessFor.set(null);
    this.accessResult.set(null);
    this.accessError.set(null);
  }

  private runAccess(request: Observable<StaffAccount | void>, done: (result: StaffAccount | void) => void): void {
    this.accessBusy.set(true);
    this.accessError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.accessBusy.set(false);
        done(result);
        this.load(true);
      },
      error: (error: unknown) => {
        this.accessBusy.set(false);
        this.accessError.set(readError(error, 'No pudimos hacer el cambio. Inténtalo de nuevo.'));
      },
    });
  }

  protected giveAccess(): void {
    const member = this.accessFor();
    const email = this.accessEmail.trim();
    if (!member || this.accessBusy()) {
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.accessError.set('Escribe un correo válido: con él va a entrar.');
      return;
    }
    this.runAccess(this.staffApi.createAccount(member.id, { email }), (result) => this.accessResult.set(result as StaffAccount));
  }

  protected async resetAccess(): Promise<void> {
    const member = this.accessFor();
    if (!member || this.accessBusy()) {
      return;
    }
    const ok = await this.confirm.ask({
      title: `¿Nueva contraseña para ${member.full_name}?`,
      message: 'Se cierra su sesión y la contraseña de ahora deja de servir. Tendrás que darle la nueva.',
      confirm: 'Crear contraseña nueva',
    });
    if (ok) {
      this.runAccess(this.staffApi.resetAccount(member.id), (result) => this.accessResult.set(result as StaffAccount));
    }
  }

  protected async removeAccess(): Promise<void> {
    const member = this.accessFor();
    if (!member || this.accessBusy()) {
      return;
    }
    const ok = await this.confirm.ask({
      title: `¿Quitar el acceso a ${member.full_name}?`,
      message: 'Ya no podrá entrar al panel. Sigue en tu equipo y su historial se queda.',
      confirm: 'Quitar acceso',
      danger: true,
    });
    if (ok) {
      this.runAccess(this.staffApi.removeAccount(member.id), () => {
        this.toasts.show('Se quitó el acceso.');
        this.closeAccess();
      });
    }
  }

  /** Mensaje listo para mandar por WhatsApp con los datos de entrada. */
  protected accessMessage(result: StaffAccount): string {
    const origin = typeof location === 'undefined' ? '' : location.origin;
    return `Hola ${result.full_name.split(' ')[0]}, ya tienes acceso al panel.\nEntra en ${origin}/auth/login\nCorreo: ${result.email}\nContraseña temporal: ${result.temporary_password}\nAl entrar te pedirá elegir la tuya.`;
  }

  protected async copyAccess(result: StaffAccount): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.accessMessage(result));
      this.toasts.show('Copiado. Pégalo en un mensaje.');
    } catch {
      this.toasts.show('No pudimos copiar. Selecciona el texto y cópialo.');
    }
  }

  protected openVacation(member: Staff): void {
    this.vacationFor.set(member);
    this.vacationFrom = '';
    this.vacationTo = '';
    this.vacationError.set(null);
  }

  /** Bloquea cada día del periodo para esa persona (se ve en la Agenda como "Vacaciones"). */
  protected saveVacation(): void {
    const member = this.vacationFor();
    const from = this.vacationFrom;
    const to = this.vacationTo || from;
    if (!member || !from || to < from) {
      this.vacationError.set('Elige desde y hasta (el fin no puede ser antes del inicio).');
      return;
    }
    const days: string[] = [];
    for (let cursor = new Date(`${from}T12:00:00`); cursor <= new Date(`${to}T12:00:00`) && days.length < 62; cursor.setDate(cursor.getDate() + 1)) {
      days.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    }
    forkJoin(days.map((date) => this.appointmentsApi.createBlock({ staff_id: member.id, starts_at: `${date}T00:00:00`, ends_at: `${date}T23:59:00`, note: 'Vacaciones' })))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.vacationFor.set(null);
          this.toasts.show(`${member.full_name.split(' ')[0]} de vacaciones: ${days.length} ${days.length === 1 ? 'día bloqueado' : 'días bloqueados'}.`);
        },
        error: () => this.vacationError.set('No pudimos guardar las vacaciones.'),
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
      width: '980px',
      maxWidth: 'calc(100vw - 32px)',
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
      staff: this.staffApi.getStaff(),
      services: this.servicesApi.getServices(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ staff, services }) => {
          this.staff.set(staff);
          this.services.set(services);
          this.isLoading.set(false);
          this.loadExtras(staff);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(readError(error, 'No pudimos cargar el equipo.'));
        },
      });
  }

  private loadExtras(staff: Staff[]): void {
    if (staff.length) {
      forkJoin(staff.map((member) => this.schedulesApi.getStaffSchedule(member.id).pipe(catchError(() => of([] as ScheduleItem[])), map((rows) => [member.id, rows] as const))))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((rows) => this.schedules.set(new Map(rows)));
    }
    const now = new Date();
    const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.shopApi
      .report(day(new Date(now.getFullYear(), now.getMonth(), 1)), day(now))
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((report) => this.month.set(new Map((report?.staff ?? []).map((row) => [row.staff_id, row]))));
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
