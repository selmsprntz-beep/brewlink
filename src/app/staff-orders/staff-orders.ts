import { CurrencyPipe, DatePipe, NgClass, UpperCasePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GCASH } from '../gcash-config';
import { Order, OrderStatus } from '../models';
import { ApiService } from '../services/api';

interface PaymentLike {
  id?: number;
  method?: string;
  status?: string;
  reference_no?: string | null;
  reference_number?: string | null;
  reference?: string | null;
  ref_no?: string | null;
  amount?: number;
}

type ConfirmType = 'verify' | 'reject' | 'cash' | 'cancel';

@Component({
  selector: 'app-staff-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NgClass, UpperCasePipe, FormsModule, RouterLink],
  templateUrl: './staff-orders.html',
})
export class StaffOrders implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  orders = signal<Order[]>([]);

  loading = true;
  error = '';
  successMessage = '';
  errorMessage = '';
  searchTerm = '';
  selectedFilter = 'active';
  processing = false;

  // Confirmation modal state
  confirmType: ConfirmType | null = null;
  confirmOrder: Order | null = null;

  private timer?: ReturnType<typeof setInterval>;
  readonly gcash = GCASH;

  ngOnInit() {
    this.loadOrders();
    this.timer = setInterval(() => this.loadOrders(), 5000);
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  refreshOrders() {
    this.loadOrders();
  }

  clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }

  loadOrders() {
    this.api.orders(this.selectedFilter).subscribe({
      next: (data: Order[]) => {
        this.orders.set(data);
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load orders', err);
        this.loading = false;
      },
    });
  }

  // First come, first served: oldest order first
  private oldestFirst(list: Order[]): Order[] {
    return [...list].sort((a, b) => {
      const ta = new Date(a.created_at as any).getTime() || 0;
      const tb = new Date(b.created_at as any).getTime() || 0;
      return ta !== tb ? ta - tb : Number(a.id) - Number(b.id);
    });
  }

  get filteredOrders(): Order[] {
    const term = this.searchTerm.toLowerCase().trim();
    const list = this.orders().filter((order) => {
      if (!term) return true;
      const matchesNumber = order.order_number?.toLowerCase().includes(term);
      const matchesCustomer = order.customer_name?.toLowerCase().includes(term);
      const matchesTable = order.cafe_table?.name?.toLowerCase().includes(term);
      const matchesItem = order.items?.some((i) => i.product_name?.toLowerCase().includes(term));
      return matchesNumber || matchesCustomer || matchesTable || matchesItem;
    });
    return this.oldestFirst(list);
  }

  get activeOrderCount(): number {
    return this.orders().filter((o) => ['pending', 'preparing', 'ready'].includes(o.status)).length;
  }

  get nowServing(): Order | null {
    const active = this.oldestFirst(
      this.orders().filter((o) => ['pending', 'preparing', 'ready'].includes(o.status)),
    );
    return active.length > 0 ? active[0] : null;
  }

  isGcash(order: Order): boolean {
    return order.payment_method === 'gcash';
  }

  isCash(order: Order): boolean {
    return order.payment_method === 'cash';
  }

  isPaid(order: Order): boolean {
    if (order.is_paid === true || Number(order.is_paid) === 1) return true;
    const anyOrder = order as any;
    if (anyOrder.payments?.some((p: PaymentLike) => p.status === 'verified')) return true;
    if (anyOrder.payment?.status === 'verified') return true;
    return false;
  }

  getLatestPayment(order: Order): PaymentLike | null {
    const anyOrder = order as any;

    const payments = anyOrder.payments ?? [];
    if (Array.isArray(payments) && payments.length > 0) {
      const withRef = payments.find((p: PaymentLike) => p.reference_no);
      return withRef || payments[payments.length - 1];
    }

    if (anyOrder.payment) {
      return anyOrder.payment;
    }

    return null;
  }

  getReferenceNumber(order: Order): string | null {
    const payment = this.getLatestPayment(order);
    if (!payment) return null;

    return (
      payment.reference_no ??
      (payment as any).reference_number ??
      (payment as any).reference ??
      (payment as any).ref_no ??
      null
    );
  }

  getPaymentMethodLabel(order: Order): string {
    return this.isGcash(order) ? 'GCash' : 'Cash';
  }

  getPaymentStatus(order: Order): string {
    if (this.isPaid(order)) return 'Verified';
    const payment = this.getLatestPayment(order);
    if (payment?.status === 'pending') return 'For Verification';
    if (payment?.status === 'rejected') return 'Rejected';
    if (this.isGcash(order) && !this.getReferenceNumber(order)) return 'Waiting for Reference';
    return order.is_paid ? 'Paid' : 'Unpaid';
  }

  getPaymentClass(order: Order): string {
    if (this.isPaid(order)) return 'bg-green-50 text-green-700 border-green-200';
    const payment = this.getLatestPayment(order);
    if (payment?.status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (payment?.status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'preparing': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ready': return 'bg-green-50 text-green-700 border-green-200';
      case 'completed': return 'bg-stone-100 text-stone-700 border-stone-300';
      case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  }

  getStatusButtonLabel(order: Order): string {
    switch (order.status) {
      case 'pending': return 'Mark as Preparing';
      case 'preparing': return 'Mark as Ready';
      case 'ready': return 'Complete Order';
      default: return 'Update Status';
    }
  }

  canVerifyGcash(order: Order): boolean {
    const payment = this.getLatestPayment(order);
    return this.isGcash(order) && payment?.status === 'pending' && !this.isPaid(order);
  }

  copyReference(ref: string | null) {
    if (!ref) return;
    navigator.clipboard.writeText(ref).then(() => {
      this.successMessage = 'GCash reference copied to clipboard!';
      setTimeout(() => (this.successMessage = ''), 2000);
    });
  }

  // ---------- Confirmation modal ----------
  openConfirm(type: ConfirmType, order: Order) {
    this.confirmType = type;
    this.confirmOrder = order;
  }

  closeConfirm() {
    if (this.processing) return;
    this.confirmType = null;
    this.confirmOrder = null;
  }

  get confirmTitle(): string {
    switch (this.confirmType) {
      case 'verify': return 'Verify GCash payment';
      case 'reject': return 'Reject GCash payment';
      case 'cash': return 'Record cash payment';
      case 'cancel': return 'Cancel order';
      default: return '';
    }
  }

  get confirmMessage(): string {
    switch (this.confirmType) {
      case 'verify': return 'Confirm that the GCash payment was received and the reference number is correct.';
      case 'reject': return 'The customer will be asked to submit a new reference number.';
      case 'cash': return 'Confirm that the cash amount below was received at the counter.';
      case 'cancel': return 'This order will be cancelled and cannot be prepared anymore.';
      default: return '';
    }
  }

  get confirmLabel(): string {
    switch (this.confirmType) {
      case 'verify': return 'Verify payment';
      case 'reject': return 'Reject payment';
      case 'cash': return 'Record payment';
      case 'cancel': return 'Cancel order';
      default: return 'Confirm';
    }
  }

  get confirmIsDanger(): boolean {
    return this.confirmType === 'reject' || this.confirmType === 'cancel';
  }

  runConfirm() {
    const order = this.confirmOrder;
    const type = this.confirmType;
    if (!order || !type) return;

    switch (type) {
      case 'verify': this.verifyGcash(order); break;
      case 'reject': this.rejectGcash(order); break;
      case 'cash': this.recordCashPayment(order); break;
      case 'cancel': this.cancelOrder(order); break;
    }
  }

  private done() {
    this.processing = false;
    this.confirmType = null;
    this.confirmOrder = null;
  }

  // ---------- Actions ----------
  verifyGcash(order: Order) {
    const payment = this.getLatestPayment(order);
    if (!payment?.id) { this.done(); return; }
    this.processing = true;
    this.api.verifyPayment(payment.id).subscribe({
      next: () => {
        this.done();
        this.successMessage = `GCash payment verified successfully!`;
        this.loadOrders();
      },
      error: (err: any) => {
        this.done();
        this.errorMessage = err.error?.message || 'Failed to verify payment.';
      },
    });
  }

  rejectGcash(order: Order) {
    const payment = this.getLatestPayment(order);
    if (!payment?.id) { this.done(); return; }
    this.processing = true;
    this.api.rejectPayment(payment.id, 'Rejected by staff').subscribe({
      next: () => {
        this.done();
        this.successMessage = `GCash payment rejected.`;
        this.loadOrders();
      },
      error: (err: any) => {
        this.done();
        this.errorMessage = err.error?.message || 'Failed to reject payment.';
      },
    });
  }

  recordCashPayment(order: Order) {
    this.processing = true;
    this.api.recordCashPayment(order.id).subscribe({
      next: () => {
        this.done();
        this.successMessage = 'Cash payment recorded.';
        this.loadOrders();
      },
      error: (err: any) => {
        this.done();
        this.errorMessage = err.error?.message || 'Failed to record payment.';
      },
    });
  }

  updateStatus(order: Order) {
    let nextStatus: OrderStatus = 'preparing';
    if (order.status === 'pending') nextStatus = 'preparing';
    else if (order.status === 'preparing') nextStatus = 'ready';
    else if (order.status === 'ready') nextStatus = 'completed';

    this.processing = true;
    this.api.updateOrderStatus(order.id, nextStatus).subscribe({
      next: () => {
        this.processing = false;
        this.successMessage = `Order updated to ${nextStatus}.`;
        this.loadOrders();
      },
      error: (err: any) => {
        this.processing = false;
        this.errorMessage = err.error?.message || 'Failed to update status.';
      },
    });
  }

  cancelOrder(order: Order) {
    this.processing = true;
    this.api.updateOrderStatus(order.id, 'cancelled' as OrderStatus).subscribe({
      next: () => {
        this.done();
        this.successMessage = `Order cancelled.`;
        this.loadOrders();
      },
      error: (err: any) => {
        this.done();
        this.errorMessage = err.error?.message || 'Failed to cancel order.';
      },
    });
  }
}