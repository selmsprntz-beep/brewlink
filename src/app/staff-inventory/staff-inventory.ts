import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryItem, Product, RecipeLine, RecipeProduct, StockMovement } from '../models';
import { ApiService } from '../services/api';
import { ProductService } from '../services/product';

type View = 'products' | 'ingredients';
type RecipeStatus = 'none' | 'out' | 'low' | 'ok';

type Size = 'Tall' | 'Grande';

interface MovementRow {
  id: number;
  name: string;
  unit: string;
  type: string;
  sign: string;
  qty: number;
  before: number | null;
  after: number | null;
  reason: string;
  at: string;
}

interface DraftLine {
  inventory_item_id: number | null;
  amount: number | null;
}

// Han-ay sa kategorya sa inventory (parehas sa menu)
const CATEGORY_ORDER = [
  'blended',
  'hot coffee',
  'iced coffee',
  'panini',
  'pasta',
  'pica',
  'rice',
];

function categoryRank(name: string | undefined | null): number {
  const n = (name ?? '').toLowerCase();
  const i = CATEGORY_ORDER.findIndex((key) => n.includes(key));
  return i === -1 ? CATEGORY_ORDER.length : i; // ang uban, sa katapusan
}

@Component({
  selector: 'app-staff-inventory',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, NgClass],
  templateUrl: './staff-inventory.html',
})
export class StaffInventory implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private productService = inject(ProductService);
  private timer?: ReturnType<typeof setInterval>;

  view = signal<View>('products');
  q = signal('');
  onlyIssues = signal(false);

 
  items = signal<InventoryItem[]>([]);

  menu = signal<Product[]>([]);

  
  recipeMap = signal<Map<number, RecipeLine[]>>(new Map());
  recipesFailed = signal(false);

  products = computed<RecipeProduct[]>(() =>
    this.menu().map((p) => ({ ...p, ingredients: this.recipeMap().get(p.id) ?? [] })),
  );

  movements = signal<StockMovement[]>([]);
  error = signal('');
  loading = signal(true);
  showMovements = signal(true); 

  lowItems = computed(() => this.items().filter((i) => i.is_low));

  /* ---------- Load ---------- */

  ngOnInit() {
    this.load();
    // Refresh matag 30s aron makita ang deduction inig complete sa orders
    this.timer = setInterval(() => this.load(), 30000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  private failMessage(what: string, err: { status?: number }): string {
    const code = err?.status ? ` (HTTP ${err.status})` : '';
    return `Could not load ${what}${code}.`;
  }

  load() {
    this.productService.products().subscribe({
      next: (list) => {
        this.menu.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.failMessage('the menu', err));
      },
    });

    this.api.inventory().subscribe({
      next: (list) => {
        this.items.set(list);
        if (this.error().startsWith('Could not load inventory')) this.error.set('');
      },
      error: (err) => {
        console.error('Inventory load failed:', err);
        this.error.set(this.failMessage('inventory', err));
      },
    });

    this.api.recipes().subscribe({
      next: (list) => {
        const map = new Map<number, RecipeLine[]>();
        for (const p of list) map.set(p.id, p.ingredients ?? []);
        this.recipeMap.set(map);
        this.recipesFailed.set(false);
      },
      error: (err) => {
        console.error('Recipes load failed:', err);
        this.recipesFailed.set(true);
      },
    });

    if (this.showMovements()) this.loadMovements();
  }

  loadMovements() {
    this.api.movements().subscribe({ next: (m) => this.movements.set(m), error: () => {} });
  }

  movementGroups = computed(() => {
    const groups: {
      key: string;
      title: string;
      kind: 'order' | 'stock';
      at: string;
      rows: MovementRow[];
    }[] = [];

    for (const m of this.movements().slice(0, 150)) {
      const v = this.movementView(m);
      const key = v.reason || 'Stock change #' + v.id;
      let g = groups.find((x) => x.key === key);

      if (!g) {
        if (groups.length >= 25) continue;
        g = {
          key,
          title: v.reason || 'Stock change',
          kind: v.reason.toLowerCase().startsWith('order') ? 'order' : 'stock',
          at: v.at,
          rows: [],
        };
        groups.push(g);
      }

      g.rows.push(v);
    }

    return groups;
  });

  private movementView(m: StockMovement): MovementRow {
    const x = m as unknown as {
      id: number;
      type?: string;
      quantity?: number | string;
      balance_after?: number | string | null;
      reason?: string | null;
      created_at?: string;
      inventory_item_id?: number;
      inventory_item?: { name?: string; unit?: string };
    };

    const item = this.items().find((i) => i.id === x.inventory_item_id);
    const type = x.type ?? '';
    const qty = Math.abs(Number(x.quantity ?? 0));
    const after =
      x.balance_after === null || x.balance_after === undefined ? null : Number(x.balance_after);

    const before =
      after === null ? null : type === 'out' ? after + qty : type === 'in' ? after - qty : null;

    return {
      id: x.id,
      name: x.inventory_item?.name ?? item?.name ?? 'Ingredient',
      unit: x.inventory_item?.unit ?? item?.unit ?? '',
      type,
      sign: type === 'in' ? '+' : type === 'out' ? '−' : '=',
      qty,
      before,
      after,
      reason: x.reason ?? '',
      at: x.created_at ?? '',
    };
  }

  toggleMovements() {
    this.showMovements.update((v) => !v);
    if (this.showMovements()) this.loadMovements();
  }

  /* ---------- Recipe helpers ---------- */

  hasSizes(p: RecipeProduct): boolean {
    if (!p.size_prices) return false;
    try {
      const prices = typeof p.size_prices === 'string' ? JSON.parse(p.size_prices) : p.size_prices;
      return prices && (prices.Grande !== undefined || prices.Tall !== undefined);
    } catch (e) {
      return false;
    }
  }
  sizeTabs: Size[] = ['Tall', 'Grande'];

  private tabs = signal<Record<number, Size>>({});

  tabOf(p: RecipeProduct): Size {
    return this.hasSizes(p) ? (this.tabs()[p.id] ?? 'Tall') : 'Tall';
  }

  setTab(p: RecipeProduct, size: Size) {
    this.tabs.update((t) => ({ ...t, [p.id]: size }));
  }

  linesFor(p: RecipeProduct, size: Size): RecipeLine[] {
    return p.ingredients.filter((l) => this.perServing(l, size) > 0);
  }

  itemOf(line: RecipeLine): InventoryItem | undefined {
    return this.items().find((i) => i.id === line.inventory_item_id);
  }

  unitOf(line: RecipeLine): string {
    return this.itemOf(line)?.unit ?? line.inventory_item?.unit ?? '';
  }

  nameOf(line: RecipeLine): string {
    return this.itemOf(line)?.name ?? line.inventory_item?.name ?? 'Unknown';
  }

  stockOf(line: RecipeLine): number {
    return Number(this.itemOf(line)?.quantity ?? 0);
  }

  perServing(line: RecipeLine, size: 'Tall' | 'Grande'): number {
    const g = line.grande_quantity;
    return Number(size === 'Grande' && g !== null && g !== undefined ? g : line.quantity);
  }

  lineState(line: RecipeLine): 'out' | 'low' | 'ok' {
    const item = this.itemOf(line);
    if (!item || Number(item.quantity) <= 0) return 'out';
    return item.is_low ? 'low' : 'ok';
  }

  servings(p: RecipeProduct, size: 'Tall' | 'Grande'): number | null {
    let min: number | null = null;

    for (const l of p.ingredients) {
      const per = this.perServing(l, size);
      if (per <= 0) continue;
      const n = Math.floor(this.stockOf(l) / per);
      min = min === null ? n : Math.min(min, n);
    }

    return min;
  }

  limiting(p: RecipeProduct, size: 'Tall' | 'Grande' = 'Tall'): string {
    let best: { name: string; n: number } | null = null;

    for (const l of p.ingredients) {
      const per = this.perServing(l, size);
      if (per <= 0) continue;
      const n = Math.floor(this.stockOf(l) / per);
      if (!best || n < best.n) best = { name: this.nameOf(l), n };
    }

    return best?.name ?? '';
  }

  lowLines(p: RecipeProduct): { name: string; qty: number; unit: string; out: boolean }[] {
    return p.ingredients
      .filter((l) => this.lineState(l) !== 'ok')
      .map((l) => ({
        name: this.nameOf(l),
        qty: this.stockOf(l),
        unit: this.unitOf(l),
        out: this.lineState(l) === 'out',
      }));
  }

  status(p: RecipeProduct): RecipeStatus {
    if (p.ingredients.length === 0) return 'none';

    const states = p.ingredients.map((l) => this.lineState(l));
    if (states.includes('out')) return 'out';
    if (states.includes('low')) return 'low';
    return 'ok';
  }

  usedIn(item: InventoryItem): string[] {
    return this.products()
      .filter((p) => p.ingredients.some((l) => l.inventory_item_id === item.id))
      .map((p) => p.name);
  }

  /* ---------- Filters ---------- */

  visibleProducts = computed(() => {
    const term = this.q().trim().toLowerCase();

    return this.products()
      .filter((p) => {
        if (this.onlyIssues() && this.status(p) === 'ok') return false;
        if (!term) return true;

        const text = [p.name, p.category?.name ?? '', ...p.ingredients.map((l) => this.nameOf(l))]
          .join(' ')
          .toLowerCase();

        return text.includes(term);
      })
      .sort((a, b) => {
        const byCategory = categoryRank(a.category?.name) - categoryRank(b.category?.name);
        return byCategory !== 0 ? byCategory : a.name.localeCompare(b.name);
      });
  });

  visibleItems = computed(() => {
    const term = this.q().trim().toLowerCase();
    return term ? this.items().filter((i) => i.name.toLowerCase().includes(term)) : this.items();
  });

  issueCount = computed(() => this.products().filter((p) => this.status(p) !== 'ok').length);

  /* ---------- Recipe editor ---------- */

  recipeEditingId = signal<number | null>(null);
  recipeSaving = signal(false);
  editSize = signal<Size>('Tall');
  draft: Record<Size, DraftLine[]> = { Tall: [], Grande: [] };

  startRecipe(p: RecipeProduct) {
    const toDraft = (size: Size): DraftLine[] =>
      this.linesFor(p, size).map((l) => ({
        inventory_item_id: l.inventory_item_id,
        amount: this.perServing(l, size),
      }));

    this.draft = { Tall: toDraft('Tall'), Grande: this.hasSizes(p) ? toDraft('Grande') : [] };
    this.editSize.set(this.tabOf(p));
    if (this.draft[this.editSize()].length === 0) this.addLine();
    this.recipeEditingId.set(p.id);
    this.error.set('');
  }

  cancelRecipe() {
    this.recipeEditingId.set(null);
    this.draft = { Tall: [], Grande: [] };
  }

  switchEditSize(size: Size) {
    this.editSize.set(size);
    if (this.draft[size].length === 0) this.addLine();
  }

  addLine() {
    const s = this.editSize();
    this.draft = { ...this.draft, [s]: [...this.draft[s], { inventory_item_id: null, amount: null }] };
  }

  removeLine(index: number) {
    const s = this.editSize();
    this.draft = { ...this.draft, [s]: this.draft[s].filter((_, i) => i !== index) };
  }

  copyTallToGrande() {
    this.draft = {
      ...this.draft,
      Grande: this.draft.Tall.filter((l) => l.inventory_item_id !== null).map((l) => ({ ...l })),
    };
  }

  draftUnit(id: number | null): string {
    return this.items().find((i) => i.id === id)?.unit ?? '';
  }

 
  unitHint(id: number | null): string {
    return this.draftUnit(id) || 'unit';
  }

  saveRecipe(p: RecipeProduct) {
    const sized = this.hasSizes(p);
    const sizes: Size[] = sized ? ['Tall', 'Grande'] : ['Tall'];
    const num = (v: unknown): number | null =>
      v === null || v === undefined || v === '' ? null : Number(v);

    const amounts: Record<Size, Map<number, number>> = { Tall: new Map(), Grande: new Map() };

    for (const size of sizes) {
      const lines = this.draft[size].filter((l) => l.inventory_item_id !== null || l.amount !== null);

      if (sized && lines.length === 0) {
        this.error.set(`${size} has no ingredients yet. Add at least one (the ${size} tab).`);
        this.editSize.set(size);
        return;
      }

      for (const l of lines) {
        const label = sized ? `${size}: ` : '';

        if (l.inventory_item_id === null) {
          this.error.set(`${label}choose an ingredient for every row.`);
          this.editSize.set(size);
          return;
        }

        const amount = num(l.amount);
        if (amount === null || amount <= 0) {
          this.error.set(`${label}enter an amount greater than 0 for every ingredient.`);
          this.editSize.set(size);
          return;
        }

        if (amounts[size].has(l.inventory_item_id)) {
          this.error.set(`${label}the same ingredient is listed twice.`);
          this.editSize.set(size);
          return;
        }

        amounts[size].set(l.inventory_item_id, amount);
      }
    }

    const ids = new Set<number>([...amounts.Tall.keys(), ...amounts.Grande.keys()]);

    const payload = [...ids].map((id) => ({
      inventory_item_id: id,
      quantity: amounts.Tall.get(id) ?? 0,
      grande_quantity: sized ? (amounts.Grande.get(id) ?? 0) : null,
    }));

    this.recipeSaving.set(true);

    this.api.saveRecipe(p.id, payload).subscribe({
      next: () => {
        this.recipeSaving.set(false);
        this.error.set('');
        this.cancelRecipe();
        this.load();
      },
      error: (err) => {
        this.recipeSaving.set(false);
        const first = err.error?.errors ? (Object.values(err.error.errors)[0] as string[])[0] : null;
        this.error.set(
          first ??
            err.error?.message ??
            `Could not save the recipe${err.status ? ' (HTTP ' + err.status + ')' : ''}.`,
        );
      },
    });
  }

  /* ---------- Ingredient (stock item) CRUD ---------- */

  itemFormOpen = signal(false);
  itemEditingId = signal<number | null>(null);
  form = this.emptyForm();

  private emptyForm() {
    return { name: '', unit: 'g', quantity: 0, low_stock_threshold: 0 };
  }

  startAddItem() {
    this.view.set('ingredients');
    this.form = this.emptyForm();
    this.itemEditingId.set(null);
    this.itemFormOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  startEditItem(i: InventoryItem) {
    this.form = {
      name: i.name,
      unit: i.unit,
      quantity: Number(i.quantity),
      low_stock_threshold: Number(i.low_stock_threshold),
    };
    this.itemEditingId.set(i.id);
    this.itemFormOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  saveItem() {
    if (!this.form.name.trim() || !this.form.unit.trim()) {
      this.error.set('Name and unit are required.');
      return;
    }

    const id = this.itemEditingId() ?? undefined;

    const payload = {
      name: this.form.name.trim(),
      unit: this.form.unit.trim(),
      low_stock_threshold: Number(this.form.low_stock_threshold) || 0,
      // Recipe na ang mo-handle sa auto-deduct, dili na ang product link
      product_id: null as number | null,
      deduct_per_unit: 1,
      ...(id ? {} : { quantity: Number(this.form.quantity) || 0 }),
    };

    this.api.saveInventory(payload, id).subscribe({
      next: () => {
        this.error.set('');
        this.itemFormOpen.set(false);
        this.load();
      },
      error: (err) => this.error.set(err.error?.message ?? 'Could not save the ingredient.'),
    });
  }

  removeItem(i: InventoryItem) {
    const used = this.usedIn(i).length;
    const extra = used > 0 ? ` It will also be removed from ${used} recipe(s).` : '';

    if (!confirm(`Delete "${i.name}" and its stock history?${extra}`)) return;

    this.api.deleteInventory(i.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Could not delete the ingredient.'),
    });
  }

  /* ---------- Adjust stock ---------- */

  adjustingId = signal<number | null>(null);
  adjType: 'in' | 'out' | 'adjustment' = 'in';
  adjQty = 0;
  adjReason = '';

  startAdjust(i: InventoryItem) {
    this.adjType = 'in';
    this.adjQty = 0;
    this.adjReason = '';
    this.adjustingId.set(i.id);
  }

  saveAdjust(i: InventoryItem) {
    if (this.adjQty === null || this.adjQty < 0) {
      this.error.set('Enter a valid quantity.');
      return;
    }

    this.api
      .adjustStock(i.id, { type: this.adjType, quantity: Number(this.adjQty), reason: this.adjReason.trim() || null })
      .subscribe({
        next: () => {
          this.error.set('');
          this.adjustingId.set(null);
          this.load();
        },
        error: (err) => this.error.set(err.error?.message ?? 'Could not update the stock.'),
      });
  }
}