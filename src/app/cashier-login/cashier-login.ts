import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-cashier-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './cashier-login.html',
})
export class CashierLogin {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/staff']);
    }
  }

  submit() {

    if (this.loading()) return;

    const email = this.email.trim().toLowerCase();

    if (!email || !this.password) {
      this.error.set('Please enter your email and password.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error.set('Please enter a valid email address.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login(email, this.password).subscribe({
      next: () => {
        this.password = '';
        this.router.navigate(['/staff']);
      },
      error: (err) => {
        this.loading.set(false);
        this.password = '';
        this.showPassword.set(false);

        switch (err.status) {
          case 0:
            this.error.set('Cannot reach the server. Please try again.');
            break;
          case 401:
          case 422:
            this.error.set('Incorrect email or password.');
            break;
          case 403:
            this.error.set('This account is not allowed to sign in here.');
            break;
          case 429:
            this.error.set('Too many attempts. Please wait a minute and try again.');
            break;
          default:
            this.error.set('Something went wrong. Please try again.');
        }
      },
    });
  }
}