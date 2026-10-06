import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Sends cookies on every API call and accepts `Set-Cookie` from the response.
 * The session token stays in an HttpOnly cookie; the client never reads it.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  return next(request.clone({ withCredentials: true }));
};
