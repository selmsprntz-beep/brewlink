export interface Category {
  id: number;
  name: string;
  description?: string | null;
}

export type ProductSize = 'Tall' | 'Grande';

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description?: string | null;
  price: number; // normal price (Tall para sa drinks)
  grande_price?: number | null; // naay value kung ang drink naay Grande
  image?: string | null;
  is_available: boolean;
  category?: Category;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
  // ... ayaw kuhaa ang uban nimo nga fields
}

export interface CafeTable {
  id: number;
  name: string;
  qr_token?: string;
  is_active?: boolean;
}

export interface StaffUser {
  id: number;
  name: string;
  email?: string;
  role?: string;
}

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  size?: ProductSize | null;
  price: number;
  quantity: number;
  subtotal: number;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';


export interface Payment {
  id: number;
  order_id: number;
  amount: number;
  method: 'cash' | 'gcash';
  reference_no?: string | null;
  screenshot?: string | null;
  status: 'pending' | 'verified' | 'rejected';
  verified_at?: string | null;
  paid_at?: string | null;
  order?: Order;
  receiver?: StaffUser | null;
}


export interface Order {
  id: number;
  order_number: string;
  queue_no?: number | null;
  customer_name: string;
  order_type: 'dine_in' | 'takeout';
  payment_method: 'cash' | 'gcash';
  status: OrderStatus;
  total: number;
  notes?: string | null;
  is_paid: boolean;
  created_at: string;
  items?: OrderItem[];
  cafe_table?: CafeTable | null;
  payments?: Payment[];
}


export type ReservationStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed';

export interface Reservation {
  id: number;
  reference_code: string;
  customer_name: string;
  contact_number: string;
  email?: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  notes?: string | null;
  status: ReservationStatus;
}

export interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
  product_id: number | null;
  deduct_per_unit: number;
  is_low: boolean;
  product?: { id: number; name: string } | null;
}

export interface StockMovement {
  id: number;
  inventory_item_id: number;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  balance_after: number;
  reason?: string | null;
  created_at: string;
  inventory_item?: { id: number; name: string; unit: string };
  user?: { id: number; name: string } | null;
}

// Usa ka ingredient sa recipe sa usa ka product
export interface RecipeLine {
  id?: number;
  inventory_item_id: number;
  quantity: number; // kada 1 ka Tall / regular
  grande_quantity?: number | null; // kada 1 ka Grande (kung walay sulod = parehas sa quantity)
  inventory_item?: { id: number; name: string; unit: string };
}

// Product + tanan niyang ingredients
export interface RecipeProduct extends Product {
  ingredients: RecipeLine[];
  size_prices?: string | any; // I-apil kini aron mailhan sa TypeScript
}

export interface Summary {
  pending_orders: number;
  preparing_orders: number;
  ready_orders: number;
  orders_today: number;
  sales_today: number;
  pending_reservations: number;
  reservations_today: number;
  low_stock_count: number;
}

// Usa ka linya sa cart. Ang Tall ug Grande sa parehas nga drink kay duha ka lahi nga linya.
export interface CartItem {
  key: string; // "<product id>:<size o ->"
  product: Product;
  size: ProductSize | null;
  label: string; // "Americano (Tall)"
  price: number; // presyo sa maong size
  quantity: number;
}