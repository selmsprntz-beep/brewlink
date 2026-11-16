import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { API_URL, TOKEN_KEY, USER_KEY } from '../config';
import { StaffUser } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  user = signal<StaffUser | null>(this.readUser());

  isLoggedIn(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http
      .post<{ token: string; user: StaffUser }>(`${API_URL}/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.token);
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          this.user.set(res.user);
        }),
      );
  }

  logout() {
    const done = () => {
      this.clear();
      this.router.navigate(['/staff/login']);
    };
    this.http.post(`${API_URL}/staff/logout`, {}).subscribe({ next: done, error: done });
  }

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
  }

  private readUser(): StaffUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as StaffUser) : null;
    } catch {
      return null;
    }
  }
}
