import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';

interface NavItem {
  label: string;
  link: string;
  icon: string; // SVG path data
}

@Component({
  selector: 'app-staff-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="min-h-screen bg-[#f8f6f0] text-[#2c221e]">

      <!-- ===== Top bar (phones and tablets) ===== -->
      <header class="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-[#1c140e] px-4 text-[#f5efe6] lg:hidden">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="grid h-9 w-9 cursor-pointer place-items-center rounded-lg hover:bg-white/10"
            aria-label="Open menu"
            (click)="menuOpen.set(true)"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span class="text-sm font-black uppercase tracking-[0.18em]">BrewLink</span>
        </div>
        @if (lowStock() > 0) {
          <a routerLink="/staff/inventory" class="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-[#1c140e]">
            {{ lowStock() }} low stock
          </a>
        }
      </header>

      <!-- backdrop for the slide-in menu -->
      @if (menuOpen()) {
        <div class="fixed inset-0 z-30 bg-black/50 lg:hidden" (click)="menuOpen.set(false)"></div>
      }

      <!-- ===== Sidebar ===== -->
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#1c140e] text-[#f5efe6] transition-transform duration-200 lg:translate-x-0"
        [class.-translate-x-full]="!menuOpen()"
      >
        <div class="flex items-center gap-3 px-5 py-6">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-[#d4a373] text-[#1c140e]">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 2v2M14 2v2M6 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
            </svg>
          </span>
          <div class="leading-tight">
            <p class="text-base font-black uppercase tracking-[0.2em]">BrewLink</p>
            <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4a373]">Blugre Cafe · POS</p>
          </div>
        </div>

        <nav class="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          @for (n of nav; track n.link) {
            <a
              [routerLink]="n.link"
              routerLinkActive
              #rla="routerLinkActive"
              (click)="menuOpen.set(false)"
              class="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition"
              [class]="rla.isActive ? 'bg-[#d4a373] text-[#1c140e]' : 'text-[#d0c0b0] hover:bg-white/5 hover:text-white'"
            >
              <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path [attr.d]="n.icon" />
              </svg>
              <span class="flex-1">{{ n.label }}</span>
              @if (n.link === '/staff/inventory' && lowStock() > 0) {
                <span class="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1.5 text-[11px] font-black text-[#1c140e]">
                  {{ lowStock() }}
                </span>
              }
            </a>
          }
        </nav>

        <div class="border-t border-white/10 p-4">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d4a373]/20 text-sm font-black text-[#d4a373]">
              {{ (auth.user()?.name ?? '?').charAt(0).toUpperCase() }}
            </span>
            <div class="min-w-0 flex-1 leading-tight">
              <p class="truncate text-sm font-bold">{{ auth.user()?.name }}</p>
              <p class="text-[11px] capitalize text-[#d0c0b0]/70">{{ auth.user()?.role }}</p>
            </div>
            <button
              type="button"
              class="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-[#d0c0b0] hover:bg-white/10 hover:text-white"
              aria-label="Log out"
              title="Log out"
              (click)="auth.logout()"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <!-- ===== Page content ===== -->
      <main class="lg:pl-64">
        <div class="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class StaffLayout implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);

  menuOpen = signal(false);
  lowStock = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  nav: NavItem[] = [
    { label: 'Dashboard', link: '/staff/dashboard', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
    { label: 'Orders', link: '/staff/orders', icon: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1ZM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11' },
    { label: 'Reservations', link: '/staff/reservations', icon: 'M8 2v4M16 2v4M3 6h18v15H3zM3 10h18' },
    { label: 'Payments', link: '/staff/payments', icon: 'M2 5h20v14H2zM2 10h20M6 15h4' },
    { label: 'Inventory', link: '/staff/inventory', icon: 'M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7 12 12l8.7-5M12 22V12' },
    { label: 'Menu', link: '/staff/products', icon: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4' },
    { label: 'Tables & QR', link: '/staff/tables', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7M14 20h3' },
  ];

  ngOnInit() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 30000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  private refresh() {
    this.api.lowStock().subscribe({
      next: (items) => this.lowStock.set(items.length),
      error: () => {},
    });
  }
}