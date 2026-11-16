import { Injectable, computed, signal } from '@angular/core';
import { CartItem, Product, ProductSize } from '../models';

@Injectable({ providedIn: 'root' })
export class CartService {
  items = signal<CartItem[]>([]);

  count = computed(() => this.items().reduce((sum, i) => sum + i.quantity, 0));
  total = computed(() => this.items().reduce((sum, i) => sum + i.price * i.quantity, 0));

  // size = null para sa pagkaon ug sa item nga usa ra ang size
  add(product: Product, size: ProductSize | null = null) {
    const key = `${product.id}:${size ?? '-'}`;
    const price = size === 'Grande' ? Number(product.grande_price ?? product.price) : Number(product.price);
    const label = size ? `${product.name} (${size})` : product.name;

    this.items.update((list) => {
      const found = list.find((i) => i.key === key);
      return found
        ? list.map((i) => (i.key === key ? { ...i, quantity: i.quantity + 1 } : i))
        : [...list, { key, product, size, label, price, quantity: 1 }];
    });
  }

  setQuantity(key: string, quantity: number) {
    if (quantity <= 0) {
      this.remove(key);
      return;
    }
    this.items.update((list) => list.map((i) => (i.key === key ? { ...i, quantity } : i)));
  }

  remove(key: string) {
    this.items.update((list) => list.filter((i) => i.key !== key));
  }

  clear() {
    this.items.set([]);
  }
}