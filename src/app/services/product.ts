import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../config';
import { Category, Product } from '../models';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  // Public
  categories() {
    return this.http.get<Category[]>(`${API_URL}/categories`);
  }

  products() {
    return this.http.get<Product[]>(`${API_URL}/products`);
  }

  // Staff
  saveCategory(data: Partial<Category>, id?: number) {
    return id
      ? this.http.put<Category>(`${API_URL}/staff/categories/${id}`, data)
      : this.http.post<Category>(`${API_URL}/staff/categories`, data);
  }

  deleteCategory(id: number) {
    return this.http.delete<void>(`${API_URL}/staff/categories/${id}`);
  }

  saveProduct(data: Partial<Product>, id?: number) {
    return id
      ? this.http.put<Product>(`${API_URL}/staff/products/${id}`, data)
      : this.http.post<Product>(`${API_URL}/staff/products`, data);
  }

  deleteProduct(id: number) {
    return this.http.delete<void>(`${API_URL}/staff/products/${id}`);
  }
}
