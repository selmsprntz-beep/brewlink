
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toDataURL } from 'qrcode';
import { CafeTable } from '../models';
import { ApiService } from '../services/api';

interface TableQr {
  table: CafeTable;
  url: string;
  image: string;
}

@Component({
  selector: 'app-staff-tables',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './staff-tables.html',
})
export class StaffTables implements OnInit {
  private api = inject(ApiService);

  qrs = signal<TableQr[]>([]);
  error = signal('');

  newName = '';
  origin = window.location.origin;

  // Confirmation modals
  showAddConfirmation = signal(false);
  deletingTable = signal<CafeTable | null>(null);

  ngOnInit() {
    this.load();
  }

  async load() {
    this.api.tables().subscribe({
      next: async (tables) => {
        const items: TableQr[] = [];

        for (const table of tables) {
          const url = `${this.origin}/menu?table=${table.qr_token}`;
          let image = '';

          try {
            image = await toDataURL(url, { width: 360, margin: 1 });
          } catch {
            image = '';
          }

          items.push({ table, url, image });
        }

        this.qrs.set(items);
      },
      error: () => this.error.set('Could not load tables.'),
    });
  }

  // Open Add Table confirmation
  add() {
    if (!this.newName.trim()) {
      this.error.set('Please enter a table name.');
      return;
    }

    this.error.set('');
    this.showAddConfirmation.set(true);
  }

  // Confirm adding table
  confirmAdd() {
    const name = this.newName.trim();

    if (!name) {
      this.showAddConfirmation.set(false);
      return;
    }

    this.api.createTable(name).subscribe({
      next: () => {
        this.newName = '';
        this.error.set('');
        this.showAddConfirmation.set(false);
        this.load();
      },
      error: (err) => {
        this.showAddConfirmation.set(false);
        this.error.set(
          err.error?.errors?.name?.[0] ?? 'Could not add the table.'
        );
      },
    });
  }

  // Cancel adding table
  cancelAdd() {
    this.showAddConfirmation.set(false);
  }

  // Open Delete Table confirmation
  remove(table: CafeTable) {
    this.deletingTable.set(table);
  }

  // Confirm deleting table
  confirmDelete() {
    const table = this.deletingTable();

    if (!table) return;

    this.api.deleteTable(table.id).subscribe({
      next: () => {
        this.deletingTable.set(null);
        this.error.set('');
        this.load();
      },
      error: () => {
        this.deletingTable.set(null);
        this.error.set('Could not delete the table.');
      },
    });
  }

  // Cancel deleting table
  cancelDelete() {
    this.deletingTable.set(null);
  }

  print() {
    window.print();
  }
}
