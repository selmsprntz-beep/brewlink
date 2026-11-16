import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { GCASH } from '../gcash-config';
import { Order } from '../models';
import { ApiService } from '../services/api';

type PayState = 'none' | 'pending' | 'verified' | 'rejected';

interface PaymentLike {
  id?: number;
  method?: string;
  status?: string;
  reference_no?: string | null;
}

interface OrderPaymentFields {
  id?: number;
  payment_method?: string;
  is_paid?: boolean | number;
  payments?: PaymentLike[];
  order_number?: string;
}

@Component({
  selector: 'app-order-status',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './order-status.html',
})
export class OrderStatus implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  order = signal<Order | null>(null);
  error = signal('');

  private timer?: ReturnType<typeof setInterval>;

  steps = ['pending', 'preparing', 'ready', 'completed'];
  labels = ['Received', 'Preparing', 'Ready', 'Completed'];

  stepIndex = computed(() =>
    this.steps.indexOf(this.order()?.status ?? 'pending')
  );

  readonly gcash = GCASH;

  gcashRef = '';

  submitting = signal(false);
  payError = signal('');
  copied = signal(false);
  qrFailed = signal(false);

  localSubmitted = signal(false);

  private payFields = computed(
    () => (this.order() ?? {}) as unknown as OrderPaymentFields
  );

  paymentMethod = computed(() =>
    this.payFields().payment_method === 'gcash' ? 'gcash' : 'cash'
  );

  gcashPayment = computed<PaymentLike | null>(() => {
    const list = (this.payFields().payments ?? []).filter(
      p => p.method === 'gcash'
    );

    return list.length ? list[list.length - 1] : null;
  });

  payState = computed<PayState>(() => {
    const fields = this.payFields();

    if (
      fields.is_paid === true ||
      Number(fields.is_paid) === 1
    ) {
      return 'verified';
    }

    const status = this.gcashPayment()?.status?.toLowerCase();

    if (status === 'verified') return 'verified';
    if (status === 'pending') return 'pending';
    if (status === 'rejected') return 'rejected';

    if (this.localSubmitted()) return 'pending';

    return 'none';
  });

  // True once the GCash payment is done -> the whole GCash section is hidden in the HTML.
  // Paid = is_paid flag, OR payment verified, OR the order is already being processed.
  paymentCompleted = computed(() => {
    const fields = this.payFields();
    const orderStatus = this.order()?.status?.toLowerCase() ?? '';

    const isPaid =
      fields.is_paid === true ||
      Number(fields.is_paid) === 1;

    const isVerified =
      this.gcashPayment()?.status?.toLowerCase() === 'verified';

    const isProcessing = [
      'preparing',
      'ready',
      'completed',
    ].includes(orderStatus);

    return isPaid || isVerified || isProcessing;
  });

  ngOnInit() {
    const orderNumber =
      this.route.snapshot.paramMap.get('orderNumber') ?? '';

    if (
      orderNumber &&
      localStorage.getItem(`gcash_done_${orderNumber}`) === 'true'
    ) {
      this.localSubmitted.set(true);
    }

    this.load();

    this.timer = setInterval(() => {
      this.load();
    }, 5000);
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private load() {
    const number =
      this.route.snapshot.paramMap.get('orderNumber') ?? '';

    const table =
      this.route.snapshot.queryParamMap.get('table');

    this.api.trackOrder(number, table).subscribe({
      next: (o) => {
        this.error.set('');
        this.order.set(o);

        const payList =
          (o as unknown as OrderPaymentFields).payments ?? [];

        if (payList.length > 0 && number) {
          localStorage.setItem(`gcash_done_${number}`, 'true');
          this.localSubmitted.set(true);
        }

        if (this.isFinished() && this.timer) {
          clearInterval(this.timer);
        }
      },
      error: (err) => {
        if (err.status === 404) {
          this.error.set('We could not find that order.');

          if (this.timer) {
            clearInterval(this.timer);
          }
        }
      },
    });
  }

  private isFinished(): boolean {
    const o = this.order();

    if (!o) return false;

    if (o.status === 'cancelled') return true;

    if (o.status !== 'completed') return false;

    return (
      this.paymentMethod() !== 'gcash' ||
      this.paymentCompleted()
    );
  }

  async copyNumber(): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        this.gcash.number.replace(/\s+/g, '')
      );

      this.copied.set(true);

      setTimeout(() => {
        this.copied.set(false);
      }, 2000);
    } catch {
      this.copied.set(false);
    }
  }

  submitReference() {
    const id = this.payFields().id;

    const orderNumber =
      this.payFields().order_number ||
      this.route.snapshot.paramMap.get('orderNumber') ||
      '';

    if (typeof id !== 'number' || this.submitting()) {
      return;
    }

    const reference = this.gcashRef.replace(/[\s-]+/g, '');

    if (!/^[A-Za-z0-9]{8,30}$/.test(reference)) {
      this.payError.set(
        'Enter the Reference No. shown on your GCash receipt.'
      );
      return;
    }

    this.submitting.set(true);
    this.payError.set('');

    this.api.submitGCashReference(id, reference).subscribe({
      next: () => {
        this.submitting.set(false);
        this.gcashRef = '';

        if (orderNumber) {
          localStorage.setItem(
            `gcash_done_${orderNumber}`,
            'true'
          );
        }

        this.localSubmitted.set(true);
        this.load();
      },
      error: (err) => {
        this.submitting.set(false);

        const validationErrors = err.error?.errors;

        const firstError = validationErrors
          ? (
              Object.values(validationErrors)[0] as
                | string[]
                | undefined
            )?.[0]
          : null;

        this.payError.set(
          firstError ??
          err.error?.message ??
          'Could not send your reference number. Please try again.'
        );
      },
    });
  }
}