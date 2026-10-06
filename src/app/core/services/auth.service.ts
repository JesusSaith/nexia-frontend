import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, timeout } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { CurrentUser, LoginRequest, RegisterRequest } from '../models/user.model';

const SESSION_PROBE_TIMEOUT_MS = 8_000;

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

  /** Resolves the session from the HttpOnly cookie. A missing API leaves the user anonymous. */
  restoreSession(): Observable<CurrentUser | null> {
    return this.http.get<CurrentUser>(`${this.apiBaseUrl}/auth/me`).pipe(
      timeout(SESSION_PROBE_TIMEOUT_MS),
      tap((user) => this.currentUserState.set(user)),
      catchError(() => {
        this.currentUserState.set(null);
        return of(null);
      }),
    );
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

  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiBaseUrl}/auth/logout`, {}).pipe(
      tap(() => this.currentUserState.set(null)),
    );
  }
}
