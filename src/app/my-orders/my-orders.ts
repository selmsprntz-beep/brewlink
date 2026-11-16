import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  catchError,
  forkJoin,
  map,
  of,
} from 'rxjs';

import { Order } from '../models';
import { readMyOrders, saveMyOrders } from '../my-orders-store';
import { ApiService } from '../services/api';

type TrackedResult = {
  number: string;
  order: Order | null;
  keep: boolean;
};

@Component({
  selector: 'app-my-orders',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './my-orders.html',
})
export class MyOrders implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly table = this.route.snapshot.queryParamMap.get('table');

  // Active orders only. Completed orders are removed from this list.
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly message = signal('');

 
  readonly thanks = signal(false);

  findOrderNo = '';

  private timer?: ReturnType<typeof setInterval>;
  private loadingRequest = false;

  ngOnInit(): void {
    this.load();

    
    this.timer = setInterval(() => {
      this.load();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  
  private read(): string[] {
    return readMyOrders(this.table);
  }

  private save(numbers: string[]): void {
    saveMyOrders(this.table, numbers);
  }

  private isCompleted(status: string): boolean {
    return String(status).toLowerCase() === 'completed';
  }

private sortOrders(list: Order[]): Order[] {
  return [...list].sort((a, b) => {
    const aCancelled = String(a.status).toLowerCase() === 'cancelled';
    const bCancelled = String(b.status).toLowerCase() === 'cancelled';

    // Active orders first, cancelled orders last.
    if (aCancelled !== bCancelled) {
      return Number(aCancelled) - Number(bCancelled);
    }

    // Oldest order first, newest order last.
    return Number(a.id) - Number(b.id);
  });
}

  private load(): void {
    if (this.loadingRequest) {
      return;
    }

    this.loadingRequest = true;
    this.message.set('');

    const savedNumbers = this.read();

    // Load orders belonging to the current table, if applicable.
    const tableOrders$ = this.table
      ? this.api.tableOrders(this.table).pipe(
          catchError((error) => {
            console.error('Unable to load table orders:', error);
            return of([] as Order[]);
          })
        )
      : of([] as Order[]);

    // Load every previously saved order by order number.
    const savedOrders$ = savedNumbers.length > 0
      ? forkJoin(
          savedNumbers.map((number) =>
            this.api.trackOrder(number, this.table).pipe(
              map(
                (order): TrackedResult => ({
                  number,
                  order,
                  keep: true,
                })
              ),
              catchError((error) => {
                console.error('Unable to track order:', number, error);

                return of<TrackedResult>({
                  number,
                  order: null,
                  // Remove numbers only when the API returns 404.
                  keep: error.status !== 404,
                });
              })
            )
          )
        )
      : of([] as TrackedResult[]);

    forkJoin({
      tableOrders: tableOrders$,
      savedOrders: savedOrders$,
    }).subscribe({
      next: ({ tableOrders, savedOrders }) => {
        const uniqueOrders = new Map<string, Order>();

        for (const order of tableOrders) {
          if (order.order_number) {
            uniqueOrders.set(order.order_number, order);
          }
        }

        for (const result of savedOrders) {
          if (result.order?.order_number) {
            uniqueOrders.set(result.order.order_number, result.order);
          }
        }

        const all = Array.from(uniqueOrders.values());
        const completed = all.filter((o) => this.isCompleted(String(o.status)));
        const active = all.filter((o) => !this.isCompleted(String(o.status)));

        // Completed orders disappear from the list.
        this.orders.set(this.sortOrders(active));

        if (completed.length > 0) {
          this.thanks.set(true);
        }

        const completedNumbers = new Set(completed.map((o) => o.order_number));

        // Keep only valid, not-yet-completed order numbers.
        const numbersToSave = [
          ...savedOrders
            .filter((result) => result.keep)
            .map((result) => result.number),

          ...tableOrders
            .map((order) => order.order_number)
            .filter(
              (number): number is string =>
                typeof number === 'string' && number.trim().length > 0
            ),
        ].filter((number) => !completedNumbers.has(number));

        this.save(Array.from(new Set(numbersToSave)));

        this.loading.set(false);
        this.loadingRequest = false;
      },

      error: (error) => {
        console.error('Unable to load orders:', error);
        this.message.set('Unable to load your orders. Please try again.');
        this.loading.set(false);
        this.loadingRequest = false;
      },
    });
  }

  // Search using an order number entered by the customer.
  findOrderByNumber(): void {
    const orderNumber = this.findOrderNo.trim();

    if (!orderNumber) {
      this.message.set('Please enter an order number.');
      return;
    }

    this.message.set('');

    this.api.trackOrder(orderNumber, this.table).subscribe({
      next: (order) => {
        this.findOrderNo = '';

        // Already completed -> do not list it, just say thanks.
        if (this.isCompleted(String(order.status))) {
          this.thanks.set(true);
          this.message.set('That order is already completed. Thank you for ordering!');
          return;
        }

        const existingNumbers = this.read();

        this.save([order.order_number, ...existingNumbers]);

        const updatedOrders = [
          order,
          ...this.orders().filter(
            (item) => item.order_number !== order.order_number
          ),
        ];

        this.orders.set(this.sortOrders(updatedOrders));
      },

      error: (error) => {
        console.error('Order search failed:', error);

        this.message.set(
          error.status === 404
            ? 'Order number not found. Please check the number.'
            : 'Unable to find the order. Please try again.'
        );
      },
    });
  }

  stepIndex(status: string): number {
    const steps = ['pending', 'preparing', 'ready', 'completed'];
    const index = steps.indexOf(String(status).toLowerCase());
    return Math.max(0, index);
  }

  label(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pending',
      preparing: 'Preparing',
      ready: 'Ready! 🎉',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };

    return labels[String(status).toLowerCase()] ?? status;
  }

  badge(status: string): string {
    switch (String(status).toLowerCase()) {
      case 'ready':
        return 'bg-emerald-400 text-emerald-950';
      case 'completed':
        return 'bg-[#e3d8c4] text-[#3d2413]';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-[#d4a373] text-[#1c140e]';
    }
  }
}