import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, PendingPayment } from '../services/api';

@Component({
  selector: 'app-cashier-payments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cashier-payments.html',
})
export class CashierPaymentsComponent implements OnInit {
  private api = inject(ApiService);

  payments: PendingPayment[] = [];
  message = '';
  loading = false;

  ngOnInit(): void {
    this.loadPayments();
  }

  loadPayments(): void {
    this.loading = true;

    this.api.getPendingPayments().subscribe({
      next: (response) => {
        this.payments = response.data;
        this.loading = false;
      },
      error: () => {
        this.message = 'Unable to load payments. Check cashier login and API.';
        this.loading = false;
      },
    });
  }

  verify(payment: PendingPayment): void {
    const confirmed = window.confirm(
      `Have you confirmed receipt of ₱${payment.amount} in the actual GCash records?`
    );

    if (!confirmed) return;

    this.api.verifyPayment(payment.id).subscribe({
      next: () => {
        this.message = 'Payment marked as verified.';
        this.loadPayments();
      },
      error: (error) => {
        this.message =
          error.error?.message ?? 'Unable to verify payment.';
      },
    });
  }

  reject(payment: PendingPayment): void {
    const reason = window.prompt('Reason for rejection or follow-up:');

    if (!reason?.trim()) return;

    this.api.rejectPayment(payment.id, reason.trim()).subscribe({
      next: () => {
        this.message = 'Payment rejected. Follow up with the customer.';
        this.loadPayments();
      },
      error: (error) => {
        this.message =
          error.error?.message ?? 'Unable to reject payment.';
      },
    });
  }
}