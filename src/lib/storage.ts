/**
 * storage.ts — Scoped async storage using IndexedDB via localforage.
 *
 * Use this for LARGE data (CSV leads, templates).
 * localStorage is limited to ~5MB per browser origin. IndexedDB supports 100MB+.
 * All keys are automatically scoped to the logged-in user to maintain data privacy.
 */

import localforage from 'localforage';

// Configure a dedicated IndexedDB store for OutreachPro
const store = localforage.createInstance({
  name: 'OutreachPro',
  storeName: 'user_data',
  description: 'Per-user campaign data, leads, and templates',
});

/**
 * Save a value to IndexedDB under a user-scoped key.
 */
export async function saveUserData<T>(userKey: string, key: string, value: T): Promise<void> {
  await store.setItem(`${key}_${userKey}`, value);
}

/**
 * Load a value from IndexedDB. Returns null if not found.
 */
export async function loadUserData<T>(userKey: string, key: string): Promise<T | null> {
  return store.getItem<T>(`${key}_${userKey}`);
}

/**
 * Remove a value from IndexedDB.
 */
export async function removeUserData(userKey: string, key: string): Promise<void> {
  await store.removeItem(`${key}_${userKey}`);
}
