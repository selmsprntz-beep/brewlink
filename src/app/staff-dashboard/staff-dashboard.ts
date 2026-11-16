import { CurrencyPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventoryItem, Summary } from '../models';
import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-staff-dashboard',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './staff-dashboard.html',
})
export class StaffDashboard implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  summary = signal<Summary | null>(null);
  low = signal<InventoryItem[]>([]);
  failed = signal(false);
  updatedAt = signal('');

  today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  name = computed(() => this.auth.user()?.name ?? 'team');

  actions = [
    { label: 'Orders', link: '/staff/orders' },
    { label: 'Reservations', link: '/staff/reservations' },
    { label: 'Payments', link: '/staff/payments' },
    { label: 'Inventory', link: '/staff/inventory' },
    { label: 'Menu', link: '/staff/products' },
    { label: 'Tables & QR', link: '/staff/tables' },
  ];

  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => this.load(), 15000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  refresh() {
    this.load();
  }

  private load() {
    this.api.summary().subscribe({
      next: (s) => {
        this.summary.set(s);
        this.failed.set(false);
        this.updatedAt.set(new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }));
      },
      error: () => this.failed.set(true),
    });
    this.api.lowStock().subscribe({ next: (l) => this.low.set(l), error: () => {} });
  }
}