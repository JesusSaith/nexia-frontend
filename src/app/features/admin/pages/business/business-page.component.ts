import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { BusinessBrand } from '@core/models/business.model';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';
import { DashboardService } from '@core/services/dashboard.service';
import { StaffService } from '@core/services/staff.service';

@Component({
  selector: 'app-business-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  templateUrl: './business-page.component.html',
})
export class BusinessPageComponent {
  private readonly bookingApi = inject(BookingService);
  private readonly dashboardApi = inject(DashboardService);
  private readonly staffApi = inject(StaffService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly timeFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });

  protected readonly isOwner = inject(AuthService).isOwner;
  protected readonly brand = signal<BusinessBrand | null>(null);
  protected readonly configuring = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly logoPreview = signal<string | null>(null);
  protected readonly palette = signal<string[]>([]);
  protected readonly dragging = signal(false);
  protected readonly todayCount = signal<number | null>(null);
  protected readonly nextLabel = signal('Sin pendientes');
  protected readonly teamCount = signal<number | null>(null);
  protected readonly copied = signal(false);
  protected readonly toast = signal<string | null>(null);

  protected readonly bookingUrl = computed(() => {
    const slug = this.brand()?.slug;
    return slug ? `${window.location.origin}/${slug}/book` : '';
  });

  protected readonly gaps = computed(() => {
    const shop = this.brand();
    const missing: string[] = [];
    if (!shop?.logo_url) {
      missing.push('Sube el logo de tu marca');
    }
    if (!shop?.address?.trim()) {
      missing.push('Agrega la dirección del local');
    }
    if (!shop?.instagram?.trim()) {
      missing.push('Agrega tu Instagram');
    }
    if (this.teamCount() === 0) {
      missing.push('Agrega a alguien del equipo');
    }
    return missing;
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true }),
    logo_url: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    address: new FormControl('', { nonNullable: true }),
    instagram: new FormControl('', { nonNullable: true }),
    facebook: new FormControl('', { nonNullable: true }),
    website: new FormControl('', { nonNullable: true }),
    primary_color: new FormControl('#E11D48', { nonNullable: true }),
    canvas_color: new FormControl('#f7f4f5', { nonNullable: true }),
  });

  constructor() {
    this.bookingApi
      .getMyBrand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (brand) => {
          this.brand.set(brand);
          this.fill(brand);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.error.set('No pudimos cargar el negocio.');
        },
      });
    this.dashboardApi
      .getSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((summary) => {
        this.todayCount.set(summary.today_appointments_count);
        const next = summary.upcoming_today[0];
        this.nextLabel.set(next ? this.timeFormat.format(new Date(next.starts_at)) : 'Sin pendientes');
      });
    this.staffApi
      .getStaff()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((members) => this.teamCount.set(members.filter((member) => member.is_active).length));
  }

  protected copyLink(): void {
    const url = this.bookingUrl();
    if (!url) {
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      this.copied.set(true);
      this.toast.set('Enlace copiado.');
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected whatsappHref(): string {
    const text = `¡Hola! Reserva tu cita con nosotros en línea aquí: ${this.bookingUrl()}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  protected link(value: string | null | undefined, kind: 'web' | 'instagram' | 'facebook'): string {
    const text = (value ?? '').trim();
    if (!text) {
      return '';
    }
    if (text.startsWith('http')) {
      return text;
    }
    if (kind === 'instagram') {
      return `https://instagram.com/${text.replace('@', '')}`;
    }
    if (kind === 'facebook') {
      return `https://facebook.com/${text}`;
    }
    return `https://${text}`;
  }

  protected onDrag(event: DragEvent, active: boolean): void {
    event.preventDefault();
    this.dragging.set(active);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.readLogo(event.dataTransfer?.files?.[0]);
  }

  protected onLogo(event: Event): void {
    this.readLogo((event.target as HTMLInputElement).files?.[0]);
  }

  private readLogo(file: File | undefined): void {
    if (!file?.type.startsWith('image/')) {
      this.error.set('Elige una imagen.');
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
      const data = canvas.toDataURL('image/jpeg', 0.72);
      URL.revokeObjectURL(objectUrl);
      if (data.length > 180000) {
        this.error.set('La imagen es muy pesada. Prueba otra más simple.');
        return;
      }
      this.form.controls.logo_url.setValue(data);
      this.logoPreview.set(data);
      this.palette.set(colorsFrom(ctx.getImageData(0, 0, size, size)));
      this.error.set(null);
    };
    img.src = objectUrl;
  }

  protected useColor(color: string): void {
    this.form.controls.primary_color.setValue(color);
    this.form.controls.primary_color.markAsDirty();
  }

  protected save(): void {
    if (!this.isOwner() || this.isSaving()) {
      return;
    }
    const raw = this.form.getRawValue();
    this.isSaving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.bookingApi
      .updateBusiness({
        name: raw.name.trim(),
        phone: raw.phone.trim(),
        logo_url: raw.logo_url.trim() || null,
        description: raw.description.trim() || null,
        address: raw.address.trim() || null,
        instagram: raw.instagram.trim() || null,
        facebook: raw.facebook.trim() || null,
        website: raw.website.trim() || null,
        primary_color: raw.primary_color,
        ...(this.form.controls.canvas_color.dirty ? { canvas_color: raw.canvas_color } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (brand) => {
          this.brand.set(brand);
          this.fill(brand);
          document.documentElement.style.setProperty('--primary', brand.primary_color);
          document.documentElement.style.setProperty('--business-primary', brand.primary_color);
          document.documentElement.style.setProperty('--mat-sys-primary', brand.primary_color);
          if (brand.canvas_color) {
            document.documentElement.style.setProperty('--bg-app', brand.canvas_color);
          }
          this.isSaving.set(false);
          this.saved.set(true);
          this.configuring.set(false);
        },
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.error.set(error instanceof HttpErrorResponse ? 'No pudimos guardar la configuración.' : 'No pudimos guardar la configuración.');
        },
      });
  }

  private fill(brand: BusinessBrand): void {
    this.form.reset({
      name: brand.name,
      phone: brand.phone ?? '',
      logo_url: brand.logo_url ?? '',
      description: brand.description ?? '',
      address: brand.address ?? '',
      instagram: brand.instagram ?? '',
      facebook: brand.facebook ?? '',
      website: brand.website ?? '',
      primary_color: brand.primary_color,
      canvas_color: brand.canvas_color || '#f7f4f5',
    });
    this.logoPreview.set(brand.logo_url);
  }
}

function colorsFrom(data: ImageData): string[] {
  const buckets = new Map<string, number>();
  for (let i = 0; i < data.data.length; i += 16) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 245 || max < 28 || max - min < 18) {
      continue;
    }
    const key = [r, g, b].map((channel) => channel & 0xf0).join(',');
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => '#' + key.split(',').map((n) => Number(n).toString(16).padStart(2, '0')).join(''));
}
