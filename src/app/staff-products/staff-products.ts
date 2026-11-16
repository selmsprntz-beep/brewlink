
import { CurrencyPipe, NgClass } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Category, Product } from '../models';
import { ApiService } from '../services/api';
import { ProductService } from '../services/product';

// Category with optional is_active
type CategoryRow = Category & { is_active?: boolean };

@Component({
  selector: 'app-staff-products',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, NgClass],
  templateUrl: './staff-products.html',
})
export class StaffProducts implements OnInit {
  private productService = inject(ProductService);
  private api = inject(ApiService);

  categories = signal<CategoryRow[]>([]);
  products = signal<Product[]>([]);
  error = signal('');
  loading = signal(true);
  uploading = signal(false);

  // Category deletion confirmation modal
  deletingCategory = signal<CategoryRow | null>(null);

  // Product deletion confirmation modal
  deletingProduct = signal<Product | null>(null);

  // Add category confirmation modal
  addCategoryModal = signal(false);

  // Add menu item confirmation modal
  addProductModal = signal(false);

  // Save menu item confirmation modal
  saveProductModal = signal(false);

  // Cancel form confirmation modal
  cancelFormModal = signal(false);

  // Active tab
  tab = signal<'categories' | 'menu'>('categories');

  // Category filter: 0 = All
  filterCategory = signal(0);

  visible = computed(() => {
    const id = this.filterCategory();

    return id === 0
      ? this.products()
      : this.products().filter((p) => p.category_id === id);
  });

  newCategory = '';
  formOpen = signal(false);
  editingId = signal<number | null>(null);
  form = this.emptyForm();

  ngOnInit() {
    this.load();
  }

  load() {
    this.productService.categories().subscribe({
      next: (c) => this.categories.set(c),
      error: () => this.error.set('Could not load categories.'),
    });

    this.productService.products().subscribe({
      next: (p) => {
        this.products.set(p);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load menu.');
      },
    });
  }

  private emptyForm() {
    return {
      category_id: 0,
      name: '',
      description: '',
      price: 0,
      grande_price: null as number | null,
      image: '',
      is_available: true,
    };
  }

  /* ---------- Sizes (Tall / Grande) ---------- */

  private sizePrices(
    p: Product
  ): { Tall?: number | string; Grande?: number | string } | null {
    const raw = (p as unknown as { size_prices?: unknown }).size_prices;

    if (!raw) return null;

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    return raw as { Tall?: number | string; Grande?: number | string };
  }

  grandeOf(p: Product): number | null {
    const direct = p.grande_price;

    if (direct !== null && direct !== undefined && Number(direct) > 0) {
      return Number(direct);
    }

    const g = this.sizePrices(p)?.Grande;

    return g !== undefined && g !== null && Number(g) > 0
      ? Number(g)
      : null;
  }

  tallOf(p: Product): number {
    const t = this.sizePrices(p)?.Tall;

    return t !== undefined && t !== null
      ? Number(t)
      : Number(p.price);
  }

  hasSizes(p: Product): boolean {
    return this.grandeOf(p) !== null;
  }

  /* ---------- Categories ---------- */

  private palette = [
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-sky-100 text-sky-800 border-sky-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bg-rose-100 text-rose-800 border-rose-200',
    'bg-violet-100 text-violet-800 border-violet-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-teal-100 text-teal-800 border-teal-200',
  ];

  tagClass(categoryId: number): string {
    return this.palette[categoryId % this.palette.length];
  }

  itemCount(c: CategoryRow): number {
    return this.products().filter((p) => p.category_id === c.id).length;
  }

  formCategories(): CategoryRow[] {
    return this.categories().filter(
      (c) => c.is_active !== false || c.id === this.form.category_id
    );
  }

  // Open add category confirmation
  addCategory() {
    const name = this.newCategory.trim();

    if (!name) {
      this.error.set('Please enter a category name.');
      return;
    }

    this.error.set('');
    this.addCategoryModal.set(true);
  }

  // Confirm adding category
  confirmAddCategory() {
    const name = this.newCategory.trim();

    if (!name) {
      this.addCategoryModal.set(false);
      this.error.set('Please enter a category name.');
      return;
    }

    this.productService
      .saveCategory({ name, is_active: true } as Partial<Category>)
      .subscribe({
        next: () => {
          this.newCategory = '';
          this.addCategoryModal.set(false);
          this.error.set('');
          this.load();
        },
        error: (err) => {
          this.addCategoryModal.set(false);
          this.error.set(
            err.error?.errors?.name?.[0] ?? 'Could not add the category.'
          );
        },
      });
  }

  cancelAddCategory() {
    this.addCategoryModal.set(false);
  }

  toggleCategory(c: CategoryRow) {
    const next = c.is_active === false;

    this.productService
      .saveCategory({ is_active: next } as Partial<Category>, c.id)
      .subscribe({
        next: () => {
          this.error.set('');
          this.load();
        },
        error: () =>
          this.error.set('Could not update the category status.'),
      });
  }

  // Open custom delete confirmation modal
  deleteCategory(c: CategoryRow) {
    this.deletingCategory.set(c);
  }

  // Execute deletion only after confirmation
  confirmDeleteCategory() {
    const category = this.deletingCategory();

    if (!category) return;

    this.productService.deleteCategory(category.id).subscribe({
      next: () => {
        if (this.filterCategory() === category.id) {
          this.filterCategory.set(0);
        }

        this.deletingCategory.set(null);
        this.error.set('');
        this.load();
      },
      error: () => {
        this.deletingCategory.set(null);
        this.error.set('Could not delete the category.');
      },
    });
  }

  cancelDeleteCategory() {
    this.deletingCategory.set(null);
  }

  /* ---------- Add / Edit ---------- */

  startAdd() {
    this.tab.set('menu');
    this.form = this.emptyForm();
    this.editingId.set(null);
    this.formOpen.set(true);
    this.error.set('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Confirm before opening a new menu item form
  requestAddProduct() {
    this.addProductModal.set(true);
  }

  confirmAddProduct() {
    this.addProductModal.set(false);
    this.startAdd();
  }

  cancelAddProduct() {
    this.addProductModal.set(false);
  }

  startEdit(p: Product) {
    this.tab.set('menu');

    this.form = {
      category_id: p.category_id,
      name: p.name,
      description: p.description ?? '',
      price: this.tallOf(p),
      grande_price: this.grandeOf(p),
      image: p.image ?? '',
      is_available: p.is_available,
    };

    this.editingId.set(p.id);
    this.formOpen.set(true);
    this.error.set('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Cancel Form ---------- */

  cancelForm() {
    this.cancelFormModal.set(true);
  }

  keepEditing() {
    this.cancelFormModal.set(false);
  }

  confirmCancelForm() {
    this.cancelFormModal.set(false);
    this.formOpen.set(false);
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.error.set('');
  }

  /* ---------- Upload picture ---------- */

  onImagePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.error.set('Please choose an image file (JPG, PNG or WEBP).');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      this.error.set('The picture must be 4MB or smaller.');
      return;
    }

    this.error.set('');
    this.uploading.set(true);

    this.api.uploadProductImage(file).subscribe({
      next: (res) => {
        this.form.image = res.url;
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);

        const first = err.error?.errors
          ? (Object.values(err.error.errors)[0] as string[])[0]
          : null;

        this.error.set(
          first ??
            err.error?.message ??
            `Could not upload the picture${
              err.status ? ' (HTTP ' + err.status + ')' : ''
            }.`
        );
      },
    });
  }

  removeImage() {
    this.form.image = '';
  }

  /* ---------- Save Product ---------- */

  save() {
    if (
      !this.form.category_id ||
      !this.form.name.trim() ||
      this.form.price === null
    ) {
      this.error.set('Category, name and price are required.');
      return;
    }

    if (this.uploading()) {
      this.error.set('Please wait for the picture to finish uploading.');
      return;
    }

    this.error.set('');
    this.saveProductModal.set(true);
  }

  // Execute save only after confirmation
  confirmSaveProduct() {
    if (this.uploading()) {
      this.saveProductModal.set(false);
      this.error.set('Please wait for the picture to finish uploading.');
      return;
    }

    const grande =
      this.form.grande_price === null ||
      (this.form.grande_price as unknown) === ''
        ? null
        : Number(this.form.grande_price);

    const payload = {
      category_id: this.form.category_id,
      name: this.form.name.trim(),
      description: this.form.description.trim() || null,
      price: Number(this.form.price),
      grande_price: grande,
      image: this.form.image.trim() || null,
      is_available: this.form.is_available,
    };

    this.productService
      .saveProduct(payload, this.editingId() ?? undefined)
      .subscribe({
        next: () => {
          this.saveProductModal.set(false);
          this.error.set('');
          this.formOpen.set(false);
          this.editingId.set(null);
          this.form = this.emptyForm();
          this.load();
        },
        error: (err) => {
          this.saveProductModal.set(false);
          this.error.set(
            err.error?.message ?? 'Could not save the menu item.'
          );
        },
      });
  }

  cancelSaveProduct() {
    this.saveProductModal.set(false);
  }

  /* ---------- Product Actions ---------- */

  toggle(p: Product) {
    this.productService
      .saveProduct({ is_available: !p.is_available }, p.id)
      .subscribe({
        next: () => this.load(),
        error: () => this.error.set('Could not update availability.'),
      });
  }

  // Open product delete confirmation modal
  remove(p: Product) {
    this.deletingProduct.set(p);
  }

  // Execute deletion only after confirmation
  confirmDeleteProduct() {
    const product = this.deletingProduct();

    if (!product) return;

    this.productService.deleteProduct(product.id).subscribe({
      next: () => {
        this.deletingProduct.set(null);
        this.error.set('');
        this.load();
      },
      error: () => {
        this.deletingProduct.set(null);
        this.error.set('Could not delete the menu item.');
      },
    });
  }

  cancelDeleteProduct() {
    this.deletingProduct.set(null);
  }
}
