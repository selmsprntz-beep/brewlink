import { CurrencyPipe, NgClass } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LAST_ORDER_KEY } from '../config';
import { GCASH } from '../gcash-config';
import {
  CafeTable,
  Category,
  Order,
  Product,
  ProductSize,
} from '../models';
import {
  addMyOrder,
  currentTable,
  forgetTable,
} from '../my-orders-store';
import { ApiService } from '../services/api';
import { CartService } from '../services/cart';
import { ProductService } from '../services/product';

interface DrinkPrices {
  Tall?: number | string | null;
  Grande?: number | string | null;
}

interface ProductWithSizes {
  id: number;
  category_id: number;
  name: string;
  description?: string | null;
  price: number | string;
  size_prices?: DrinkPrices | null;
  grande_price?: number | string | null;
  image?: string | null;
  is_available?: boolean | number;
}

interface OrderDetails {
  id?: number;
  order_number?: string;
  total?: number | string;
  payment_method?: 'cash' | 'gcash';
  status?: string;
}

interface CreateOrderResponse {
  message?: string;
  data?: OrderDetails;
  order_number?: string;
}

@Component({
  selector: 'app-customer-home',
  standalone: true,
  imports: [FormsModule, RouterLink, CurrencyPipe, NgClass],
  templateUrl: './customer-home.html',
})
export class CustomerHome implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly cart = inject(CartService);

  // Tanang categories gikan sa API (apil ang inactive)
  private allCategories = signal<Category[]>([]);

  // Active categories ra ang makita sa customer
  categories = computed(() =>
    this.allCategories().filter((c) => this.isCategoryActive(c))
  );

  // ID sa mga inactive nga categories (itago pud ang ilang products)
  private inactiveCategoryIds = computed(
    () =>
      new Set(
        this.allCategories()
          .filter((c) => !this.isCategoryActive(c))
          .map((c) => Number(c.id))
      )
  );

  products = signal<Product[]>([]);
  selectedCategory = signal<number | null>(null);

  table = signal<CafeTable | null>(null);
  tableToken: string | null = null;

  loading = signal(true);
  error = signal('');
  submitting = signal(false);
  cartOpen = signal(false);

  customerName = '';
  orderType: 'dine_in' | 'takeout' = 'dine_in';
  paymentMethod: 'cash' | 'gcash' = 'cash';
  notes = '';

  // ---------- GCash payment step ----------
  readonly gcash = GCASH;

  gcashOrder = signal<{ total: number } | null>(null);
  gcashRef = '';

  gcashSubmitting = signal(false);
  gcashError = signal('');
  gcashCopied = signal(false);
  gcashQrFailed = signal(false);

  visibleProducts = computed(() => {
    const categoryId = this.selectedCategory();
    const inactive = this.inactiveCategoryIds();

    const products = this.products().filter(
      (product) => !inactive.has(Number(product.category_id))
    );

    return categoryId === null
      ? products
      : products.filter(
          (product) => Number(product.category_id) === categoryId
        );
  });

  cartCount = computed(() =>
    this.cart.items().reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    )
  );

  cartTotal = computed(() =>
    this.cart.items().reduce(
      (total, item) =>
        total +
        this.getItemPrice(item.product, item.size) *
          Number(item.quantity || 0),
      0
    )
  );

  ngOnInit(): void {
    this.tableToken = currentTable(
      this.route.snapshot.queryParamMap.get('table')
    );

    if (this.tableToken) {
      this.api.tableByToken(this.tableToken).subscribe({
        next: (table) => this.table.set(table),
        error: (err) => {
          if (err?.status === 404) {
            forgetTable();
          }

          this.tableToken = null;
          this.orderType = 'takeout';
          this.error.set(
            'This table QR code is not valid. You can still order for takeout.'
          );
        },
      });
    } else {
      this.orderType = 'takeout';
    }

    this.productService.categories().subscribe({
      next: (categories) => this.allCategories.set(categories),
      error: () =>
        this.error.set(
          'Cannot load menu categories. Please try again later.'
        ),
    });

    this.productService.products().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Loading products failed:', err);
        this.loading.set(false);
        this.error.set(
          'Cannot load the menu. Please try again later.'
        );
      },
    });
  }

  private isCategoryActive(category: Category): boolean {
    const value = (category as Category & { is_active?: boolean | number })
      .is_active;

    return value === undefined || value === null || Number(value) === 1 || value === true;
  }

  private getProductSizes(product: Product): ProductWithSizes {
    return product as ProductWithSizes;
  }

  getSizePrices(product: Product): DrinkPrices | null {
    const item = this.getProductSizes(product);
    let prices: any = item.size_prices;

    if (typeof prices === 'string') {
      try {
        prices = JSON.parse(prices);
      } catch (e) {
        prices = null;
      }
    }

    if (prices && typeof prices === 'object') {
      const tall = Number(prices.Tall ?? prices.tall);
      const grande = Number(prices.Grande ?? prices.grande);

      if (
        Number.isFinite(tall) &&
        Number.isFinite(grande) &&
        grande > 0
      ) {
        return { Tall: tall, Grande: grande };
      }
    }

    const grandePrice = item.grande_price;
    if (
      grandePrice != null &&
      String(grandePrice).trim() !== '' &&
      Number.isFinite(Number(grandePrice)) &&
      Number(grandePrice) > 0
    ) {
      return {
        Tall: Number(product.price),
        Grande: Number(grandePrice),
      };
    }

    return null;
  }

  hasSizes(product: Product): boolean {
    return this.getSizePrices(product) !== null;
  }

  getPrice(product: Product, size: ProductSize): number {
    const prices = this.getSizePrices(product);

    if (prices) {
      const normalizedSize = String(size).toLowerCase();
      const selectedPrice =
        normalizedSize === 'grande' ? prices.Grande : prices.Tall;

      if (
        selectedPrice != null &&
        String(selectedPrice).trim() !== '' &&
        Number.isFinite(Number(selectedPrice))
      ) {
        return Number(selectedPrice);
      }
    }

    return Number(product.price) || 0;
  }

  getItemPrice(
    product: Product,
    size: ProductSize | null
  ): number {
    if (size !== null && this.hasSizes(product)) {
      return this.getPrice(product, size);
    }

    return Number(product.price) || 0;
  }

  getProductImage(productName: string): string {
    const name = (productName || '').toLowerCase();

    if (name.includes('durian') && (name.includes('arctic') || name.includes('blast'))) {
      return '/assets/menu/durian-arctic-blast.jpg';
    }
    if (name.includes('iced') && (name.includes('white') || name.includes('mocha'))) {
      return '/assets/menu/iced-white-mocha.jpg';
    }
    if (name.includes('mocha') && (name.includes('blended'))) {
      return '/assets/menu/mocha-blended.jpg';
    }
    if (name.includes('iced') && (name.includes('americano'))) {
      return '/assets/menu/iced-americano.jpg';
    }
    if (name.includes('iced') && (name.includes('mocha'))) {
      return '/assets/menu/iced-mocha.jpg';
    }
    if (name.includes('white') && (name.includes('mocha') || name.includes('blended'))) {
      return '/assets/menu/white-mocha-blended.jpg';
    }
    if (name.includes('durian coffeeccino')) return '/assets/menu/durian-coffeeccino.jpg';
    if (name.includes('durian iced latte')) return '/assets/menu/durian-iced-latte.jpg';

    if (name.includes('latte')) return '/assets/menu/cafe-latte.jpg';
    if (name.includes('cappuccino')) return '/assets/menu/cappuccino.jpg';
    if (name.includes('americano') || name.includes('espresso')) return '/assets/menu/americano.jpg';
    if (name.includes('mocha')) return '/assets/menu/mocha.jpg';
    if (name.includes('mochagelo')) return '/assets/menu/mochagelo.jpg';
    if (name.includes('oreo')) return '/assets/menu/oreo.jpg';
    if (name.includes('cafe')) return '/assets/menu/cafe.jpg';
    if (name.includes('durian')) return '/assets/menu/durian.jpg';

    if (name.includes('bangus') || name.includes('scrambler')) return '/assets/menu/bangus.jpg';
    if (name.includes('chicken') && (name.includes('adobo'))) {
      return '/assets/menu/chicken-adobo.jpg';
    }
    if (name.includes('chicken') && (name.includes('ham'))) {
      return '/assets/menu/chicken-ham.jpg';
    }
    if (name.includes('chicken') && (name.includes('pesto'))) {
      return '/assets/menu/chicken-pesto.jpg';
    }
    if (name.includes('pepper') && (name.includes('penne'))) {
      return '/assets/menu/pepper-penne.jpg';
    }
    if (name.includes('chicken') && (name.includes('enchilada'))) {
      return '/assets/menu/chicken-enchilada.jpg';
    }
    if (name.includes('penne') && (name.includes('tuna'))) {
      return '/assets/menu/penne-tuna.jpg';
    }
    if (name.includes('beef') && (name.includes('carbonara'))) {
      return '/assets/menu/beef-carbonara.jpg';
    }
    if (name.includes('meat') && (name.includes('sauce'))) {
      return '/assets/menu/meat-sauce.jpg';
    }
    if (name.includes('grilled') && (name.includes('cheese'))) {
      return '/assets/menu/grilled-cheese.jpg';
    }
    if (name.includes('pita') && (name.includes('chips'))) {
      return '/assets/menu/pita-chips.jpg';
    }
    if (name.includes('potato') && (name.includes('chips'))) {
      return '/assets/menu/potato-chips.jpg';
    }
    if (name.includes('spicy') && (name.includes('beef'))) {
      return '/assets/menu/spicy-beef.jpg';
    }
    if (name.includes('beef') && (name.includes('sausage'))) {
      return '/assets/menu/beef-sausage.jpg';
    }
    if (name.includes('beef') && (name.includes('scramble'))) {
      return '/assets/menu/beef-scramble.jpg';
    }
    if (name.includes('garlic') && (name.includes('chicken'))) {
      return '/assets/menu/garlic-chicken.jpg';
    }
    if (name.includes('tuna') && (name.includes('scramble'))) {
      return '/assets/menu/tuna-scramble.jpg';
    }
    if (name.includes('tuna')) return '/assets/menu/tuna.jpg';
    if (name.includes('tapa')) return '/assets/menu/tapa.jpg';
    return ''; 
  }

  getImageUrl(product: Product): string {
    const image = this.getProductSizes(product).image;

    if (image && image.trim()) {
      if (/^https?:\/\//i.test(image)) {
        return image;
      }

      return '/' + image.replace(/^\/+/, '');
    }

    return this.getProductImage(product.name);
  }

  isAvailable(product: Product): boolean {
    const available = this.getProductSizes(product).is_available;

    return (
      available === undefined ||
      available === true ||
      Number(available) === 1
    );
  }

  scrollToMenu(): void {
    document.getElementById('menu-section')?.scrollIntoView({
      behavior: 'smooth',
    });
  }

  selectCategory(categoryId: number | null): void {
    this.selectedCategory.set(categoryId);
  }

  addToCart(
    product: Product,
    size: ProductSize | null = null
  ): void {
    if (!this.isAvailable(product)) {
      this.error.set('This product is currently unavailable.');
      return;
    }

    this.cart.add(product, size);
    this.error.set('');
    this.cartOpen.set(true);
  }

  openCart(): void {
    this.cartOpen.set(true);
  }

  closeCart(): void {
    this.cartOpen.set(false);
  }

  onBackdropClick(): void {
    if (!this.gcashOrder()) {
      this.closeCart();
    }
  }

  private goToOrder(orderNumber: string): void {
    void this.router.navigate(['/order', orderNumber], {
      queryParams: this.tableToken
        ? { table: this.tableToken }
        : {},
    });
  }

  async copyGCashNumber(): Promise<void> {
    const digits = this.gcash.number.replace(/\s+/g, '');

    try {
      await navigator.clipboard.writeText(digits);
      this.gcashCopied.set(true);
      setTimeout(() => this.gcashCopied.set(false), 2000);
    } catch {
      this.gcashCopied.set(false);
    }
  }

  cancelGCashStep(): void {
    this.gcashOrder.set(null);
    this.resetGCashForm();
    this.gcashCopied.set(false);
  }

  submitGCashReference(): void {
  if (!this.gcashOrder() || this.gcashSubmitting()) return;

  const reference = this.gcashRef.replace(/[\s-]+/g, '');

  if (!/^[A-Za-z0-9]{8,30}$/.test(reference)) {
    this.gcashError.set(
      'Enter the Reference No. shown on your GCash receipt.'
    );
    return;
  }

  this.gcashSubmitting.set(true);
  this.gcashError.set('');


  this.sendOrder(reference);
}

  private resetGCashForm(): void {
    this.gcashRef = '';
    this.gcashError.set('');
  }

  getCartKey(item: {
    key?: string;
    product: Product;
    size: ProductSize | null;
  }): string {
    return item.key ?? `${item.product.id}-${item.size ?? 'regular'}`;
  }

  increaseQuantity(item: {
    key?: string;
    product: Product;
    size: ProductSize | null;
    quantity: number;
  }): void {
    this.cart.setQuantity(
      this.getCartKey(item),
      Number(item.quantity) + 1
    );
  }

  decreaseQuantity(item: {
    key?: string;
    product: Product;
    size: ProductSize | null;
    quantity: number;
  }): void {
    const nextQuantity = Number(item.quantity) - 1;
    const key = this.getCartKey(item);

    if (nextQuantity <= 0) {
      this.cart.remove(key);
    } else {
      this.cart.setQuantity(key, nextQuantity);
    }
  }

  removeItem(key: string): void {
    this.cart.remove(key);
  }

  goToMyOrders(): void {
    void this.router.navigate(['/my-orders'], {
      queryParams: this.tableToken
        ? { table: this.tableToken }
        : {},
    });
  }

  placeOrder(): void {
    if (this.submitting()) {
      return;
    }

    if (this.cart.items().length === 0) {
      this.error.set('Please add an item to your order first.');
      return;
    }

    if (!this.customerName.trim()) {
      this.error.set(
        'Please enter your name so we can call your order.'
      );
      return;
    }

    this.error.set('');

    if (this.paymentMethod === 'gcash') {
      this.resetGCashForm();
      this.gcashCopied.set(false);
      this.gcashOrder.set({ total: this.cartTotal() });
      return;
    }

    this.submitting.set(true);
    this.sendOrder(null);
  }

  private sendOrder(referenceNo: string | null): void {
    // GI-FIX: Gamiton ang gipili nga paymentMethod ('gcash' o 'cash')
    const selectedMethod = this.paymentMethod;

    const payload = {
      table_token: this.tableToken,
      customer_name: this.customerName.trim(),
      order_type: this.orderType,
      payment_method: selectedMethod,
      reference_no: referenceNo,
      notes: this.notes.trim() || null,
      items: this.cart.items().map((item) => ({
        product_id: item.product.id,
        quantity: Number(item.quantity),
        size: item.size,
      })),
    };

    this.api.createOrder(payload).subscribe({
      next: (response: Order) => {
        const result = response as unknown as CreateOrderResponse;
        const order = (result.data ?? response) as OrderDetails;
        const orderNumber = order.order_number ?? result.order_number;

        this.submitting.set(false);
        this.gcashSubmitting.set(false);

        if (!orderNumber || !String(orderNumber).trim()) {
          this.error.set(
            'The order response did not contain an order number. Check the order list before submitting again.'
          );
          this.gcashError.set(this.error());
          return;
        }

        const savedOrderNumber = String(orderNumber);

        // I-save ang order status sa local storage
        if (selectedMethod === 'gcash') {
          localStorage.setItem(`gcash_done_${savedOrderNumber}`, 'true');
        }

        addMyOrder(this.tableToken, savedOrderNumber);
        localStorage.setItem(LAST_ORDER_KEY, savedOrderNumber);

        this.cart.clear();
        this.resetGCashForm();
        this.gcashOrder.set(null);
        this.cartOpen.set(false);
        this.goToOrder(savedOrderNumber);
      },

      error: (err) => {
        console.error('Order submission failed:', err);

        this.submitting.set(false);
        this.gcashSubmitting.set(false);

        const validationErrors = err.error?.errors;
        const firstError = validationErrors
          ? (
              Object.values(validationErrors)[0] as
                | string[]
                | undefined
            )?.[0]
          : null;

        const message =
          firstError ??
          err.error?.message ??
          'Could not place your order. Please try again.';

        if (selectedMethod === 'gcash') {
          this.gcashError.set(message);
        } else {
          this.error.set(message);
        }
      },
    });
  }
}