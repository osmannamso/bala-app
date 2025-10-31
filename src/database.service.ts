/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Injectable } from '@angular/core';

export interface Category {
  id?: number;
  name: string;
  picture: Blob;
}

export interface Item {
  id?: number;
  categoryId: number;
  name: string;
  picture: Blob;
  sound: Blob;
}

const DB_NAME = 'KidsSoundboardDB';
const DB_VERSION = 1;
const CATEGORIES_STORE = 'categories';
const ITEMS_STORE = 'items';

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject('IndexedDB not supported');
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
          db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(ITEMS_STORE)) {
          const itemStore = db.createObjectStore(ITEMS_STORE, { keyPath: 'id', autoIncrement: true });
          itemStore.createIndex('categoryId', 'categoryId', { unique: false });
        }
      };
    });
  }

  private async getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async getCategories(): Promise<Category[]> {
    const store = await this.getStore(CATEGORIES_STORE, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async addCategory(category: Category): Promise<number> {
    const store = await this.getStore(CATEGORIES_STORE, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.add(category);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as number);
    });
  }

  async getItems(categoryId: number): Promise<Item[]> {
    const store = await this.getStore(ITEMS_STORE, 'readonly');
    const index = store.index('categoryId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(categoryId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async addItem(item: Item): Promise<number> {
    const store = await this.getStore(ITEMS_STORE, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as number);
    });
  }
}
