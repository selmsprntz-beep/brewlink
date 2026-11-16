import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Payment } from '../models';
import { ApiService } from '../services/api';

@Component({
  selector: 'app-staff-payments',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass],
  templateUrl: './staff-payments.html',
})
export class StaffPayments implements OnInit, OnDestroy {
  private api = inject(ApiService);

  payments = signal<Payment[]>([]);
  error = signal('');
  loading = signal(true);
  method = signal('');
  private timer?: ReturnType<typeof setInterval>;

  methods = [
    { value: '', label: 'All' },
    { value: 'cash', label: 'Cash' },
    { value: 'gcash', label: 'GCash' },
  ];

  private counted(p: Payment) {
    return p.status !== 'pending' && p.status !== 'rejected';
  }

  visible = computed(() => {
    const m = this.method();
    return m ? this.payments().filter((p) => p.method?.toLowerCase() === m) : this.payments();
  });

  todayTotal = computed(() => {
    const today = new Date().toDateString();
    return this.payments()
      .filter((p) => this.counted(p) && p.paid_at && new Date(p.paid_at).toDateString() === today)
      .reduce((sum, p) => sum + Number(p.amount), 0);
  });

  allTotal = computed(() =>
    this.payments()
      .filter((p) => this.counted(p))
      .reduce((sum, p) => sum + Number(p.amount), 0),
  );

  pendingCount = computed(() => this.payments().filter((p) => p.status === 'pending').length);

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => this.load(), 30000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  load() {
    this.api.payments().subscribe({
      next: (list) => {
        this.payments.set(list);
        this.error.set('');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load payments.');
      },
    });
  }
}