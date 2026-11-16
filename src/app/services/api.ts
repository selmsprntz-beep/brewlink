import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import { API_URL } from '../config';
import {
  CafeTable,
  InventoryItem,
  Order,
  OrderStatus,
  Payment,
  RecipeProduct,
  Reservation,
  ReservationStatus,
  StockMovement,
  Summary,
} from '../models';

export interface GCashReferenceResponse {
  message: string;
  payment: {
    id: number;
    order_id: number;
    amount: number;
    method: string;
    reference_no: string;
    status: 'pending' | 'verified' | 'rejected';
  };
}

export interface NewOrder {
  table_token: string | null;
  customer_name: string;
  order_type: 'dine_in' | 'takeout';
  payment_method: 'cash' | 'gcash';
  reference_no?: string | null;
  notes: string | null;
  items: {
    product_id: number;
    quantity: number;
    size: 'Tall' | 'Grande' | null;
  }[];
}

export interface PendingPayment {
  id: number;
  order_id: number;
  amount: number;
  method: string;
  reference_no: string;
  screenshot?: string | null;
  status: 'pending' | 'verified' | 'rejected';
  order?: {
    order_number: string;
    customer_name: string;
    total: number;
  };
}

export interface NewReservation {
  customer_name: string;
  contact_number: string;
  email?: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  notes?: string | null;
}

export interface InventoryForm {
  name: string;
  unit: string;
  quantity?: number;
  low_stock_threshold: number;
  product_id: number | null;
  deduct_per_unit: number;
}

export interface RecipePayloadLine {
  inventory_item_id: number;
  quantity: number;
  grande_quantity: number | null;
}

type ApiEnvelope<T> = {
  data: T;
  message?: string;
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);

  /**
   * Extracts Laravel's { data: ... } response when present.
   * Also accepts endpoints that return the resource directly.
   */
  private unwrap<T>(response: T | ApiEnvelope<T>): T {
    if (
      response !== null &&
      typeof response === 'object' &&
      'data' in response
    ) {
      return (response as ApiEnvelope<T>).data;
    }

    return response as T;
  }

  tableByToken(token: string): Observable<CafeTable> {
    return this.http
      .get<CafeTable | ApiEnvelope<CafeTable>>(
        `${API_URL}/tables/${encodeURIComponent(token)}`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  createOrder(order: NewOrder): Observable<Order> {
    return this.http
      .post<Order | ApiEnvelope<Order>>(
        `${API_URL}/orders`,
        order
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  trackOrder(
    orderNumber: string,
    table?: string | null
  ): Observable<Order> {
    let params = new HttpParams();

    if (table && table.trim()) {
      params = params.set('table', table.trim());
    }

    return this.http
      .get<Order | ApiEnvelope<Order>>(
        `${API_URL}/orders/track/${encodeURIComponent(orderNumber)}`,
        { params }
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  tableOrders(token: string): Observable<Order[]> {
    return this.http
      .get<Order[] | ApiEnvelope<Order[]>>(
        `${API_URL}/tables/${encodeURIComponent(token)}/orders`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  // GI-FIX DINHI: Gi-ilis ang URL path ngadto sa /orders/{orderId}/gcash aron mo-match sa backend route
  submitGCashReference(
    orderId: number,
    referenceNo: string
  ): Observable<GCashReferenceResponse> {
    return this.http.post<GCashReferenceResponse>(
      `${API_URL}/orders/${orderId}/gcash`,
      { reference_no: referenceNo }
    );
  }

  getPendingPayments(): Observable<{ data: PendingPayment[] }> {
    return this.http.get<{ data: PendingPayment[] }>(
      `${API_URL}/cashier/payments/pending`
    );
  }

  verifyPayment(paymentId: number): Observable<unknown> {
    return this.http.patch(
      `${API_URL}/cashier/payments/${paymentId}/verify`,
      {}
    );
  }

  rejectPayment(
    paymentId: number,
    reason: string
  ): Observable<unknown> {
    return this.http.patch(
      `${API_URL}/cashier/payments/${paymentId}/reject`,
      { reason }
    );
  }

  createReservation(
    data: NewReservation
  ): Observable<Reservation> {
    return this.http.post<Reservation>(
      `${API_URL}/reservations`,
      data
    );
  }

  trackReservation(code: string): Observable<Reservation> {
    return this.http.get<Reservation>(
      `${API_URL}/reservations/track/${encodeURIComponent(code)}`
    );
  }

  summary(): Observable<Summary> {
    return this.http.get<Summary>(
      `${API_URL}/staff/summary`
    );
  }

  orders(status?: string): Observable<Order[]> {
    let params = new HttpParams();

    if (status) {
      params = params.set('status', status);
    }

    return this.http
      .get<Order[] | ApiEnvelope<Order[]>>(
        `${API_URL}/staff/orders`,
        { params }
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  updateOrderStatus(
    id: number,
    status: OrderStatus
  ): Observable<unknown> {
    return this.http.patch(
      `${API_URL}/staff/orders/${id}/status`,
      { status }
    );
  }
  recordCashPayment(orderId: number): Observable<Order> {
    return this.http.post<Order>(
      `${API_URL}/staff/orders/${orderId}/record-cash`,
      {}
    );
  }
  reservations(status?: string): Observable<Reservation[]> {
    let params = new HttpParams();

    if (status) {
      params = params.set('status', status);
    }

    return this.http
      .get<Reservation[] | ApiEnvelope<Reservation[]>>(
        `${API_URL}/staff/reservations`,
        { params }
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  updateReservationStatus(
    id: number,
    status: ReservationStatus
  ): Observable<unknown> {
    return this.http.patch(
      `${API_URL}/staff/reservations/${id}/status`,
      { status }
    );
  }

  payments(): Observable<Payment[]> {
    return this.http
      .get<Payment[] | ApiEnvelope<Payment[]>>(
        `${API_URL}/staff/payments`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  createPayment(data: Record<string, unknown>): Observable<Payment> {
    return this.http.post<Payment>(
      `${API_URL}/staff/payments`,
      data
    );
  }

  tables(): Observable<CafeTable[]> {
    return this.http
      .get<CafeTable[] | ApiEnvelope<CafeTable[]>>(
        `${API_URL}/staff/tables`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  createTable(name: string): Observable<CafeTable> {
    return this.http.post<CafeTable>(
      `${API_URL}/staff/tables`,
      { name }
    );
  }

  deleteTable(id: number): Observable<unknown> {
    return this.http.delete(
      `${API_URL}/staff/tables/${id}`
    );
  }

  inventory(): Observable<InventoryItem[]> {
    return this.http
      .get<InventoryItem[] | ApiEnvelope<InventoryItem[]>>(
        `${API_URL}/staff/inventory`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  lowStock(): Observable<InventoryItem[]> {
    return this.http
      .get<InventoryItem[] | ApiEnvelope<InventoryItem[]>>(
        `${API_URL}/staff/inventory/low-stock`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  movements(): Observable<StockMovement[]> {
    return this.http
      .get<StockMovement[] | ApiEnvelope<StockMovement[]>>(
        `${API_URL}/staff/inventory/movements`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  saveInventory(
    data: InventoryForm | Partial<InventoryForm>,
    id?: number
  ): Observable<InventoryItem> {
    if (id !== undefined) {
      return this.http.put<InventoryItem>(
        `${API_URL}/staff/inventory/${id}`,
        data
      );
    }

    return this.http.post<InventoryItem>(
      `${API_URL}/staff/inventory`,
      data
    );
  }

  deleteInventory(id: number): Observable<unknown> {
    return this.http.delete(
      `${API_URL}/staff/inventory/${id}`
    );
  }

  adjustStock(
    id: number,
    data: {
      type: 'in' | 'out' | 'adjustment';
      quantity: number;
      reason: string | null;
    }
  ): Observable<InventoryItem> {
    return this.http.post<InventoryItem>(
      `${API_URL}/staff/inventory/${id}/adjust`,
      data
    );
  }

  recipes(): Observable<RecipeProduct[]> {
    return this.http
      .get<RecipeProduct[] | ApiEnvelope<RecipeProduct[]>>(
        `${API_URL}/staff/recipes`
      )
      .pipe(map((response) => this.unwrap(response)));
  }

  saveRecipe(
    productId: number,
    ingredients: RecipePayloadLine[]
  ): Observable<RecipeProduct> {
    return this.http.put<RecipeProduct>(
      `${API_URL}/staff/products/${productId}/ingredients`,
      { ingredients }
    );
  }

  uploadProductImage(file: File): Observable<{ path: string; url: string }> {
    const body = new FormData();
    body.append('image', file);

    return this.http.post<{ path: string; url: string }>(
      `${API_URL}/staff/upload-image`,
      body
    );
  }
}