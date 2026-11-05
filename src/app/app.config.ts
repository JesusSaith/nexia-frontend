import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { offlineInterceptor } from './core/interceptors/offline.interceptor';
import { NexiaTitleStrategy } from './core/nexia-title-strategy';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([offlineInterceptor, authInterceptor])),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: NexiaTitleStrategy },
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSessionOnStart(location.pathname))),
  ],
};
