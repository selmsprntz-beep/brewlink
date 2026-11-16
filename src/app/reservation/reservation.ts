
import { DatePipe, NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { Reservation as ReservationModel } from '../models';
import { ApiService } from '../services/api';

const MY_RESERVATIONS_KEY = 'brewlink_my_reservations';
const MAX_SAVED = 10;

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, NgClass],
  templateUrl: './reservation.html',
})
export class Reservation implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private timer?: ReturnType<typeof setInterval>;

  today = this.getToday();

  form = {
    customer_name: '',
    contact_number: '',
    email: '',
    reservation_date: '',
    reservation_time: '',
    party_size: 2,
    notes: '',
  };

  submitting = signal(false);
  error = signal('');

  created = signal<ReservationModel | null>(null);

  code = '';
  found = signal<ReservationModel | null>(null);
  checking = signal(false);
  checkError = signal('');

  mine = signal<ReservationModel[]>([]);
  loadingMine = signal(false);

  // Confirmation modal
  confirmationOpen = signal(false);

  ngOnInit(): void {
    this.loadMine();

    this.timer = setInterval(() => {
      this.loadMine(false);
    }, 20000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /* ---------- Contact Number ---------- */

// Block letters and special characters while typing.
onContactKeydown(event: KeyboardEvent): void {
  const allowedKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
  ];

  // Allow navigation and editing shortcuts (Ctrl+A, Ctrl+C, etc.)
  if (
    allowedKeys.includes(event.key) ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }

  // Allow digits only.
  if (!/^[0-9]$/.test(event.key)) {
    event.preventDefault();
    return;
  }

  const input = event.target as HTMLInputElement;

  // Prevent more than 11 digits.
  if (
    input.value.length >= 11 &&
    input.selectionStart === input.selectionEnd
  ) {
    event.preventDefault();
  }
}

// Clean pasted content and accept numbers only.
onContactPaste(event: ClipboardEvent): void {
  event.preventDefault();

  const input = event.target as HTMLInputElement;
  const pastedText = event.clipboardData?.getData('text') ?? '';
  const numbers = pastedText.replace(/[^0-9]/g, '');

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  const currentValue = this.form.contact_number;

  const newValue = (
    currentValue.slice(0, start) +
    numbers +
    currentValue.slice(end)
  ).slice(0, 11);

  this.form.contact_number = newValue;
}

// Final input protection.
onContactNumberChange(value: string): void {
  this.form.contact_number = String(value ?? '')
    .replace(/[^0-9]/g, '')
    .slice(0, 11);
}

  /* ---------- Saved Codes ---------- */

  private readCodes(): string[] {
    try {
      const raw = JSON.parse(
        localStorage.getItem(MY_RESERVATIONS_KEY) ?? '[]'
      );

      return Array.isArray(raw)
        ? raw.filter((c) => typeof c === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private writeCodes(codes: string[]): void {
    try {
      localStorage.setItem(
        MY_RESERVATIONS_KEY,
        JSON.stringify(codes.slice(0, MAX_SAVED))
      );
    } catch {
      // Ignore localStorage errors.
    }
  }

  private addCode(code: string): void {
    const codes = this.readCodes().filter((c) => c !== code);
    this.writeCodes([code, ...codes]);
  }

  removeMine(code: string): void {
    this.writeCodes(
      this.readCodes().filter((c) => c !== code)
    );

    this.mine.update((list) =>
      list.filter((r) => r.reference_code !== code)
    );
  }

  loadMine(showLoading = true): void {
    const codes = this.readCodes();

    if (codes.length === 0) {
      this.mine.set([]);
      return;
    }

    if (showLoading && this.mine().length === 0) {
      this.loadingMine.set(true);
    }

    forkJoin(
      codes.map((code) =>
        this.api.trackReservation(code).pipe(
          map((r) => ({ code, r, gone: false })),
          catchError((err) =>
            of({
              code,
              r: null as ReservationModel | null,
              gone: err?.status === 404,
            })
          )
        )
      )
    ).subscribe((results) => {
      const gone = results
        .filter((x) => x.gone)
        .map((x) => x.code);

      if (gone.length) {
        this.writeCodes(
          codes.filter((c) => !gone.includes(c))
        );
      }

      const loaded = results
        .map((x) => x.r)
        .filter(
          (r): r is ReservationModel => !!r
        );

      // Keep previously loaded reservations if network fails.
      const failed = results
        .filter((x) => !x.r && !x.gone)
        .map((x) => x.code);

      const kept = this.mine().filter((r) =>
        failed.includes(r.reference_code)
      );

      this.mine.set([...loaded, ...kept]);
      this.loadingMine.set(false);
    });
  }

  /* ---------- Helpers ---------- */

  private getToday(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  asTime(time: string): Date | null {
    if (!time) return null;

    const [h, m] = time.split(':').map(Number);

    if (Number.isNaN(h)) return null;

    const d = new Date();
    d.setHours(h, m || 0, 0, 0);

    return d;
  }

  statusMessage(status: string): string {
    switch (status) {
      case 'pending':
        return 'Waiting for staff confirmation.';
      case 'confirmed':
        return 'Your table is confirmed. See you!';
      case 'declined':
        return 'Sorry, this request was declined.';
      case 'completed':
        return 'Thank you for visiting us!';
      case 'cancelled':
        return 'This reservation was cancelled.';
      default:
        return '';
    }
  }

  /* ---------- Validation ---------- */

  private validateForm(): boolean {
    const f = this.form;

    if (
      !f.customer_name.trim() ||
      !f.contact_number.trim() ||
      !f.reservation_date ||
      !f.reservation_time ||
      !f.party_size
    ) {
      this.error.set(
        'Please fill in your name, contact number, date, time and party size.'
      );
      return false;
    }

    // Exactly 11 digits, numbers only.
    if (!/^[0-9]{11}$/.test(f.contact_number)) {
      this.error.set(
        'Contact number must contain exactly 11 digits. Letters and special characters are not allowed.'
      );
      return false;
    }

    if (
      f.party_size < 1 ||
      f.party_size > 30 ||
      !Number.isInteger(Number(f.party_size))
    ) {
      this.error.set(
        'Party size must be between 1 and 30 guests.'
      );
      return false;
    }

    if (f.reservation_date < this.today) {
      this.error.set(
        'Please select today or a future date.'
      );
      return false;
    }

    if (
      f.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())
    ) {
      this.error.set('Please enter a valid email address.');
      return false;
    }

    this.error.set('');
    return true;
  }

  /* ---------- Confirmation Modal ---------- */

  openConfirmation(): void {
    if (this.submitting()) {
      return;
    }

    if (!this.validateForm()) {
      return;
    }

    this.confirmationOpen.set(true);
  }

  cancelConfirmation(): void {
    if (this.submitting()) {
      return;
    }

    this.confirmationOpen.set(false);
  }

  /* ---------- Submit Reservation ---------- */

  submit(): void {
    if (this.submitting()) {
      return;
    }

    // Validate again before sending to the API.
    if (!this.validateForm()) {
      this.confirmationOpen.set(false);
      return;
    }

    const f = this.form;

    this.submitting.set(true);
    this.error.set('');
    this.confirmationOpen.set(false);

    this.api
      .createReservation({
        customer_name: f.customer_name.trim(),
        contact_number: f.contact_number.trim(),
        email: f.email.trim() || null,
        reservation_date: f.reservation_date,
        reservation_time: f.reservation_time,
        party_size: Number(f.party_size),
        notes: f.notes.trim() || null,
      })
      .subscribe({
        next: (reservation) => {
          this.submitting.set(false);
          this.created.set(reservation);
          this.found.set(null);

          // Save reference code.
          this.addCode(reservation.reference_code);
          this.loadMine(false);
        },

        error: (err) => {
          this.submitting.set(false);

          const errors = err.error?.errors;

          const firstError = errors
            ? (Object.values(errors)[0] as string[] | undefined)?.[0]
            : null;

          this.error.set(
            firstError ??
              err.error?.message ??
              'Could not send your reservation. Please try again.'
          );
        },
      });
  }

  /* ---------- Check Reservation ---------- */

  check(): void {
    const referenceCode = this.code.trim().toUpperCase();

    this.found.set(null);
    this.checkError.set('');

    if (!referenceCode) {
      this.checkError.set(
        'Please enter your reservation reference code.'
      );
      return;
    }

    if (this.checking()) {
      return;
    }

    this.checking.set(true);

    this.api.trackReservation(referenceCode).subscribe({
      next: (reservation) => {
        this.found.set(reservation);
        this.checking.set(false);

        // Add to My reservations.
        this.addCode(reservation.reference_code);
        this.loadMine(false);
      },

      error: (err) => {
        console.error('Reservation lookup failed:', err);

        this.checking.set(false);

        this.checkError.set(
          err.status === 404
            ? 'No reservation found with that code.'
            : 'Unable to check your reservation. Please try again.'
        );
      },
    });
  }

  /* ---------- Reset Form ---------- */

  resetForm(): void {
    this.created.set(null);
    this.error.set('');
    this.confirmationOpen.set(false);

    this.form = {
      customer_name: '',
      contact_number: '',
      email: '',
      reservation_date: '',
      reservation_time: '',
      party_size: 2,
      notes: '',
    };
  }
}
