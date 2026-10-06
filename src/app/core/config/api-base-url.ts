import { InjectionToken } from '@angular/core';

/** Base URL of the Nexia REST API. Override this token per environment. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:8000/api',
});
