import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { CashierLogin } from './cashier-login/cashier-login';
import { CustomerHome } from './customer-home/customer-home';
import { Reservation } from './reservation/reservation';
import { StaffDashboard } from './staff-dashboard/staff-dashboard';
import { StaffInventory } from './staff-inventory/staff-inventory';
import { StaffLayout } from './staff-layout/staff-layout';
import { StaffOrders } from './staff-orders/staff-orders';
import { StaffPayments } from './staff-payments/staff-payments';
import { StaffProducts } from './staff-products/staff-products';
import { StaffReservations } from './staff-reservations/staff-reservations';
import { StaffTables } from './staff-tables/staff-tables';
import { MyOrders } from './my-orders/my-orders';
import { OrderStatus } from './order-status/order-status';

export const routes: Routes = [
  // ---------- Customer side ----------
  { path: '', redirectTo: 'menu', pathMatch: 'full' },
  { path: 'menu', component: CustomerHome }, // table QR codes open /menu?table=<token>

  { path: 'reservation', component: Reservation },
  { path: 'my-orders', component: MyOrders },
  { path: 'order/:orderNumber', component: OrderStatus },
  { path: 'track', component: MyOrders },

  // ---------- Staff / Cashier portal (separate URL: /staff) ----------
  { path: 'staff/login', component: CashierLogin },
  {
    path: 'staff',
    component: StaffLayout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: StaffDashboard },
      { path: 'orders', component: StaffOrders },
      { path: 'reservations', component: StaffReservations },
      { path: 'payments', component: StaffPayments },
      { path: 'inventory', component: StaffInventory },
      { path: 'products', component: StaffProducts },
      { path: 'tables', component: StaffTables },
    ],
  },

  { path: '**', redirectTo: 'menu' },
];