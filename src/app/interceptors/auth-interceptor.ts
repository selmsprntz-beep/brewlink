import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL, TOKEN_KEY, USER_KEY } from '../config';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  if (!req.url.startsWith(API_URL)) {
    return next(req);
  }

  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return next(req.clone({ setHeaders: headers })).pipe(
    catchError((err) => {
      // Token expired / invalid on a staff request -> back to login
      if (err.status === 401 && req.url.includes('/staff/')) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        router.navigate(['/staff/login']);
      }
      return throwError(() => err);
    }),
  );
};
