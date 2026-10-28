import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, timeout } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { CurrentUser, LoginRequest, RegisterRequest } from '../models/user.model';

const SESSION_PROBE_TIMEOUT_MS = 8_000;

/** Páginas que abre cualquier persona sin cuenta (reservar, ver su cita, avisos legales): ahí no hace falta preguntar por la sesión. */
const PUBLIC_PATH = /^\/(?:terminos|privacidad|s\/[^/]+|[^/]+\/(?:book|manage|privacidad))(?:[/?#]|$)/;

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATH.test(path);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly currentUserState = signal<CurrentUser | null>(null);

  /** Logged-in profile, kept only in memory. */
  readonly currentUser = this.currentUserState.asReadonly();

  readonly userRole = computed(() => this.currentUser()?.role ?? null);

  readonly role = this.userRole;

  readonly isOwner = computed(() => this.userRole() === 'owner');

  readonly isStaff = computed(() => this.userRole() === 'staff');

  readonly isSuperAdmin = computed(() => this.userRole() === 'super_admin');

  readonly isAuthenticated = computed(() => this.currentUserState() !== null);

  /** Ya se preguntó al servidor por la sesión (en páginas públicas se omite hasta que haga falta). */
  private sessionProbed = false;

  get hasProbedSession(): boolean {
    return this.sessionProbed;
  }

  /** Resolves the session from the HttpOnly cookie. A missing API leaves the user anonymous. */
  restoreSession(): Observable<CurrentUser | null> {
    this.sessionProbed = true;
    return this.http.get<CurrentUser>(`${this.apiBaseUrl}/auth/me`).pipe(
      timeout(SESSION_PROBE_TIMEOUT_MS),
      tap((user) => this.currentUserState.set(user)),
      catchError(() => {
        this.currentUserState.set(null);
        return of(null);
      }),
    );
  }

  /** Al abrir la app: en páginas públicas no se consulta la sesión (evita un 401 en la consola de cada cliente). */
  restoreSessionOnStart(path: string): Observable<CurrentUser | null> {
    return isPublicPath(path) ? of(null) : this.restoreSession();
  }

  login(credentials: LoginRequest): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${this.apiBaseUrl}/auth/login`, credentials).pipe(
      tap((user) => this.currentUserState.set(user)),
    );
  }

  register(payload: RegisterRequest): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${this.apiBaseUrl}/auth/register`, payload).pipe(
      tap((user) => this.currentUserState.set(user)),
    );
  }

  /** Enlace que recibiría un negocio con este nombre (con sufijo -2, -3… si ya existe). */
  slugPreview(name: string): Observable<string> {
    return this.http
      .get<{ slug: string }>(`${this.apiBaseUrl}/auth/slug-preview`, { params: { name } })
      .pipe(map((response) => response.slug));
  }

  /** Siempre responde 204, exista o no la cuenta. */
  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/auth/forgot-password`, { email });
  }

  /** Cambia la contraseña con el enlace del correo y deja la sesión abierta. */
  resetPassword(token: string, password: string): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${this.apiBaseUrl}/auth/reset-password`, { token, password }).pipe(
      tap((user) => this.currentUserState.set(user)),
    );
  }

  /** Quien entró con contraseña temporal elige la suya; la sesión se renueva. */
  changePassword(currentPassword: string, newPassword: string): Observable<CurrentUser> {
    return this.http
      .post<CurrentUser>(`${this.apiBaseUrl}/auth/change-password`, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .pipe(tap((user) => this.currentUserState.set(user)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/auth/logout`, {}).pipe(
      tap(() => this.currentUserState.set(null)),
    );
  }
}
