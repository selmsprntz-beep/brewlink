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

  add() {
    const name = this.newName.trim();
    if (!name) return;
    this.api.createTable(name).subscribe({
      next: () => {
        this.newName = '';
        this.error.set('');
        this.load();
      },
      error: (err) => this.error.set(err.error?.errors?.name?.[0] ?? 'Could not add the table.'),
    });
  }

  remove(table: CafeTable) {
    if (!confirm(`Delete ${table.name}? Its printed QR code will stop working.`)) return;
    this.api.deleteTable(table.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Could not delete the table.'),
    });
  }

  print() {
    window.print();
  }
}