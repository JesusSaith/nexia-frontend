import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { BusinessBrand } from '@core/models/business.model';
import { Review } from '@core/models/review.model';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';
import { ReviewsService } from '@core/services/reviews.service';
import { Readiness, SettingsService } from '@core/services/settings.service';
import { ShopService } from '@core/services/shop.service';
import { BusinessCopy } from '@core/business-copy';
import { whatsappLink } from '@core/message-templates';

@Component({
  selector: 'app-business-page',
  imports: [FormsModule, MatIconModule, RouterLink],
  templateUrl: './business-page.component.html',
})
export class BusinessPageComponent {
  private readonly bookingApi = inject(BookingService);
  private readonly settingsApi = inject(SettingsService);
  private readonly reviewsApi = inject(ReviewsService);
  private readonly shopApi = inject(ShopService);
  protected readonly copy = inject(BusinessCopy);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly isOwner = inject(AuthService).isOwner;
  protected readonly brand = signal<BusinessBrand | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly copied = signal<string | null>(null);
  /** La misma lista que Inicio (backend: app/core/readiness.py). */
  protected readonly readiness = signal<Readiness | null>(null);
  protected readonly readyToShare = computed(() => this.readiness()?.can_book ?? false);
  /** Lo que falta, cada paso con su enlace (sin "comparte tu enlace": ese paso es esta pantalla). */
  protected readonly gaps = computed(() => (this.readiness()?.steps ?? []).filter((step) => !step.done && step.key !== 'share'));

  // Presencia: reservas por la página este mes, % que llega sola y calificación
  protected readonly presence = signal<{ page: number; share: number | null } | null>(null);
  protected readonly reviews = signal<Review[]>([]);
  protected readonly rating = computed(() => {
    const rows = this.reviews();
    return rows.length ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10 : null;
  });
  protected readonly replyDraft = signal<Record<number, string>>({});
  protected readonly ratingText = computed(() => {
    const value = this.rating();
    return value === null ? '—' : value.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  });

  protected readonly qr = signal('');
  protected readonly showPreview = signal(false);
  protected readonly preview = computed<SafeResourceUrl | null>(() => (this.bookingUrl() ? this.sanitizer.bypassSecurityTrustResourceUrl(this.bookingUrl()) : null));

  // Enlace personalizado y reseñas de Google
  protected newSlug = '';
  protected readonly slugError = signal<string | null>(null);
  protected googleUrl = '';
  protected readonly googleSaved = signal(false);

  /** El enlace sin https://, para mostrarlo bajo el QR. */
  protected readonly bookingHost = computed(() => this.bookingUrl().replace(/^https?:\/\//, ''));
  protected readonly bookingUrl = computed(() => {
    const slug = this.brand()?.slug;
    return slug ? `${window.location.origin}/${slug}/book` : '';
  });
  /** El que se copia y se manda: muestra logo y nombre al pegarlo en WhatsApp o Instagram. */
  protected readonly shareUrl = computed(() => {
    const slug = this.brand()?.slug;
    return slug ? this.bookingApi.shareUrl(slug).split('?')[0] : '';
  });

  /** Textos listos para copiar en cada red. */
  /** Pestaña de "Comparte tu enlace": al principio la primera. */
  protected readonly kitTab = signal<string | null>(null);
  protected readonly kitKey = computed(() => {
    const items = this.kit();
    const wanted = this.kitTab();
    return items.some((item) => item.key === wanted) ? wanted : (items[0]?.key ?? null);
  });
  protected readonly kitItem = computed(() => this.kit().find((item) => item.key === this.kitKey()) ?? null);
  protected readonly kit = computed(() => {
    const name = this.brand()?.name ?? '';
    const url = this.shareUrl();
    return [
      { key: 'ig', label: 'Bio de Instagram', text: `📅 Agenda tu cita en línea 👇\n${url}` },
      { key: 'status', label: 'Estado de WhatsApp', text: `¡Ya puedes agendar tu cita en ${name} sin esperar respuesta! 📲 Elige servicio, día y hora aquí: ${url}` },
      { key: 'auto', label: 'Respuesta automática de WhatsApp Business', text: `¡Hola! Gracias por escribir a ${name} 😊 Para agendar más rápido, elige tu servicio, día y hora aquí: ${url}\nSi tienes otra duda, te respondemos en cuanto podamos.` },
      { key: 'fb', label: 'Publicación de Facebook', text: `✨ Novedad en ${name}: ahora puedes reservar tu cita en línea, a cualquier hora y sin llamadas.\n\n👉 ${url}\n\n¡Te esperamos!` },
    ];
  });
  protected readonly widget = computed(
    () =>
      `<a href="${this.bookingUrl()}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;border-radius:12px;background:${this.brand()?.primary_color ?? '#1c1a19'};color:#fff;font:600 16px sans-serif;text-decoration:none">Reservar cita</a>`,
  );

  constructor() {
    this.bookingApi
      .getMyBrand()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (brand) => {
          this.brand.set(brand);
          this.newSlug = brand.slug ?? '';
          this.isLoading.set(false);
          this.makeQr();
          if (brand.slug) {
            // El horario general sale de la página pública (lo arma el backend con los turnos del equipo).
            this.bookingApi.getPublicBusiness(brand.slug).pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe((row) => {
              if (row) {
                this.brand.update((current) => (current ? { ...current, hours: row.hours ?? [], google_review_url: row.google_review_url ?? null } : current));
                this.googleUrl = row.google_review_url ?? '';
              }
            });
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.error.set('No pudimos cargar el negocio.');
        },
      });
    this.settingsApi.getReadiness().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((ready) => this.readiness.set(ready));
    this.reviewsApi.getReviews().pipe(catchError(() => of([] as Review[])), takeUntilDestroyed(this.destroyRef)).subscribe((rows) => this.reviews.set(rows));
    const now = new Date();
    const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.shopApi
      .report(day(new Date(now.getFullYear(), now.getMonth(), 1)), day(now))
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((report) => {
        const sources = report?.by_source ?? {};
        const known = (sources['page'] ?? 0) + (sources['admin'] ?? 0);
        this.presence.set({ page: sources['page'] ?? 0, share: known ? Math.round(((sources['page'] ?? 0) / known) * 100) : null });
      });
  }

  /** QR generado aquí mismo (sin servicios externos), en alta resolución y con el logo del negocio al centro si se puede. */
  private makeQr(): void {
    const url = this.bookingUrl();
    if (!url) {
      return;
    }
    // Nivel H (30 % de tolerancia): aguanta el logo encima sin dejar de leerse.
    void QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'H' }).then(async (data) => {
      this.qr.set(data);
      const logo = this.brand()?.logo_url;
      const marked = logo ? await putLogoOnQr(data, logo) : null;
      if (marked) {
        this.qr.set(marked);
      }
    });
  }

  protected downloadQr(): void {
    const link = document.createElement('a');
    link.href = this.qr();
    link.download = `qr-${this.brand()?.slug ?? 'reservas'}.png`;
    link.click();
  }

  /** Cartel para imprimir (carta o media carta): logo, nombre, QR, "Agenda tu cita aquí" y el enlace. */
  protected printPoster(size: 'letter' | 'half'): void {
    const shop = this.brand();
    if (!shop || !this.qr()) {
      return;
    }
    // El color entra en un <style>: solo se acepta un hex de 6 dígitos (el servidor ya lo exige; aquí es el segundo candado).
    const color = /^#[0-9a-fA-F]{6}$/.test(shop.primary_color) ? shop.primary_color : '#1c1a19';
    const big = size === 'letter';
    const page = big ? 'letter' : '5.5in 8.5in';
    const logo = shop.logo_url ? `<img src="${escapeHtml(shop.logo_url)}" style="width:${big ? 110 : 70}px;height:${big ? 110 : 70}px;border-radius:24px;object-fit:cover">` : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cartel</title><style>
      @page{size:${page};margin:0} body{margin:0;font-family:system-ui,sans-serif;color:#1c1a19}
      .sheet{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${big ? 22 : 12}px;text-align:center;border-top:18px solid ${color}}
      h1{margin:0;font-size:${big ? 40 : 26}px} h2{margin:0;font-size:${big ? 30 : 20}px;color:${color}}
      p{margin:0;font-size:${big ? 18 : 13}px;color:#4a4542} img.qr{width:${big ? 340 : 210}px;height:auto}
    </style></head><body><div class="sheet">${logo}<h1>${escapeHtml(shop.name)}</h1><h2>Agenda tu cita aquí</h2>
      <img class="qr" src="${this.qr()}"><p>Escanea con la cámara de tu celular</p><p><strong>${escapeHtml(this.bookingUrl().replace(/^https?:\/\//, ''))}</strong></p>
    </div><script>onload=()=>{print()}</script></body></html>`;
    const sheet = window.open('', '_blank');
    sheet?.document.write(html);
    sheet?.document.close();
  }

  protected markShared(): void {
    if (this.readiness()?.steps.find((step) => step.key === 'share')?.done) {
      return;
    }
    this.settingsApi.markShared().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => undefined });
  }

  protected copyText(key: string, text: string): void {
    this.markShared();
    void navigator.clipboard.writeText(text).then(() => {
      this.copied.set(key);
      setTimeout(() => this.copied.set(null), 2000);
    });
  }

  /** Para pegar en Instagram o Messenger cuando alguien escribe: lo lleva a reservar solo y deja su celular. */
  protected replyText(): string {
    return this.copy.message('dm_reply', { negocio: this.brand()?.name ?? '', enlace: this.shareUrl() });
  }

  protected whatsappHref(): string {
    return whatsappLink(null, this.copy.message('share_link', { negocio: this.brand()?.name ?? '', enlace: this.shareUrl() }));
  }

  protected saveSlug(): void {
    const slug = this.newSlug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3) {
      this.slugError.set('Usa solo letras minúsculas, números y guiones (mínimo 3).');
      return;
    }
    this.settingsApi
      .changeSlug(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Se recarga para que todo el panel use el enlace nuevo.
        next: () => location.reload(),
        error: (error: unknown) => this.slugError.set(error instanceof HttpErrorResponse && typeof error.error?.detail === 'string' ? error.error.detail : 'No pudimos cambiar el enlace.'),
      });
  }

  protected saveGoogle(): void {
    const url = this.googleUrl.trim();
    if (url && !url.startsWith('https://')) {
      this.error.set('El enlace de Google debe empezar con https://');
      return;
    }
    this.settingsApi
      .updateProfile({ google_review_url: url || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.error.set(null);
        this.googleSaved.set(true);
      });
  }

  protected typeReply(id: number, value: string): void {
    this.replyDraft.update((drafts) => ({ ...drafts, [id]: value }));
  }

  protected sendReply(review: Review): void {
    const text = (this.replyDraft()[review.id] ?? '').trim();
    if (!text) {
      return;
    }
    this.reviewsApi
      .reply(review.id, text)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => this.reviews.update((rows) => rows.map((row) => (row.id === saved.id ? saved : row))));
  }

  protected readonly starRow = [1, 2, 3, 4, 5];

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
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
}

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagen'));
    img.src = src;
  });
}

/** Pone el logo en un círculo blanco al centro del QR. Si el logo no se puede leer (otro dominio sin permiso), devuelve null y se queda el QR liso. */
async function putLogoOnQr(qrData: string, logoUrl: string): Promise<string | null> {
  try {
    const [qr, logo] = await Promise.all([loadImage(qrData), loadImage(logoUrl, true)]);
    const canvas = document.createElement('canvas');
    canvas.width = qr.width;
    canvas.height = qr.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.drawImage(qr, 0, 0);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = canvas.width * 0.11;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + canvas.width * 0.025, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    // Recorte tipo "cover": el logo llena el círculo sin deformarse.
    const side = Math.min(logo.width, logo.height);
    ctx.drawImage(logo, (logo.width - side) / 2, (logo.height - side) / 2, side, side, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
