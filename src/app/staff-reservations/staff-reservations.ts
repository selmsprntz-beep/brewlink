import { DatePipe, NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Reservation, ReservationStatus } from '../models';
import { ApiService } from '../services/api';

// Kanus-a gihimo ang reservation (gikan sa Laravel created_at)
interface ConfirmDialog {
  title: string;
  message: string;
  warning?: string;
  confirmLabel: string;
  tone: 'green' | 'brown' | 'red';
  run: () => void;
}

const bookedAt = (r: Reservation): number => {
  const value = (r as Reservation & { created_at?: string }).created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

@Component({
  selector: 'app-staff-reservations',
  standalone: true,
  imports: [DatePipe, NgClass],
  templateUrl: './staff-reservations.html',
})
export class StaffReservations implements OnInit, OnDestroy {
  private api = inject(ApiService);

  filters = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'declined', label: 'Declined' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  filter = signal('pending');
  private raw = signal<Reservation[]>([]);
  error = signal('');
  loading = signal(true);
  busy = signal(false); 

  // Pop-up confirmation (puli sa browser confirm)
  dialog = signal<ConfirmDialog | null>(null);
  private timer?: ReturnType<typeof setInterval>;

  reservations = computed(() =>
    [...this.raw()].sort((a, b) => bookedAt(a) - bookedAt(b) || Number(a.id) - Number(b.id)),
  );


  private queueNumbers = computed(() => {
    const map = new Map<number, number>();
    this.reservations()
      .filter((r) => r.status === 'pending')
      .forEach((r, i) => map.set(r.id, i + 1));
    return map;
  });

  queueNo(r: Reservation): number | null {
    return this.queueNumbers().get(r.id) ?? null;
  }


  bookedOn(r: Reservation): Date | null {
    const t = bookedAt(r);
    return t ? new Date(t) : null;
  }

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => this.load(), 20000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  setFilter(value: string) {
    this.filter.set(value);
    this.loading.set(true);
    this.load();
  }

  load() {
    this.api.reservations(this.filter() || undefined).subscribe({
      next: (list) => {
        this.raw.set(list);
        this.error.set('');
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load reservations.');
      },
    });
  }

  private setStatus(r: Reservation, status: ReservationStatus) {
    if (this.busy()) return;

    this.error.set('');
    this.busy.set(true);

    this.api.updateReservationStatus(r.id, status).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not update the reservation.');
      },
    });
  }

  /* ---------- Confirmation pop-up ---------- */

  private ask(dialog: ConfirmDialog) {
    if (this.busy()) return;
    this.dialog.set(dialog);
  }

  closeDialog() {
    this.dialog.set(null);
  }

  acceptDialog() {
    const d = this.dialog();
    this.dialog.set(null);
    d?.run();
  }

  private timeLabel(r: Reservation): string {
    const d = this.asTime(r.reservation_time);
    return d
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : r.reservation_time;
  }

  private summary(r: Reservation): string {
    return `#${r.reference_code} · ${r.party_size} guests · ${this.timeLabel(r)}`;
  }

  confirmReservation(r: Reservation) {
    // Pagpugong sa sayop: naay mas una nga nagpa-reserve nga pending pa
    const head = this.reservations().find((x) => x.status === 'pending');
    const warning =
      head && head.id !== r.id
        ? `${head.customer_name} (#${head.reference_code}) reserved earlier and is still pending.`
        : undefined;

    this.ask({
      title: 'Confirm reservation?',
      message: `${r.customer_name}\n${this.summary(r)}`,
      warning,
      confirmLabel: 'Yes, confirm',
      tone: 'green',
      run: () => this.setStatus(r, 'confirmed'),
    });
  }

  complete(r: Reservation) {
    this.ask({
      title: 'Mark as completed?',
      message: `${r.customer_name}\n${this.summary(r)}`,
      confirmLabel: 'Yes, completed',
      tone: 'brown',
      run: () => this.setStatus(r, 'completed'),
    });
  }

  decline(r: Reservation) {
    this.ask({
      title: 'Decline reservation?',
      message: `${r.customer_name}\n${this.summary(r)}`,
      confirmLabel: 'Yes, decline',
      tone: 'red',
      run: () => this.setStatus(r, 'declined'),
    });
  }

  cancel(r: Reservation) {
    this.ask({
      title: 'Cancel reservation?',
      message: `${r.customer_name}\n${this.summary(r)}`,
      confirmLabel: 'Yes, cancel it',
      tone: 'red',
      run: () => this.setStatus(r, 'cancelled'),
    });
  }

  asTime(time: string): Date | null {
    if (!time) return null;
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d;
  }
}