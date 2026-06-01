import { LazyStore } from '@tauri-apps/plugin-store';

export const STORAGE_KEYS = {
  MODULE_LAYOUTS: 'module-layouts',
  APP_SETTINGS: 'app-settings',
  ICON_ORDER: 'icon-order',
  CUSTOM_COMMANDS: 'custom-commands',
  SHORTCUTS: 'shortcuts',
} as const;

export class Persistence {
  private store: LazyStore;

  constructor() {
    this.store = new LazyStore('settings.json');
  }

  async save<T>(key: string, data: T): Promise<void> {
    try {
      await this.store.set(key, data);
      // Flush immediately to ensure data is persisted
      await this.store.save();
    } catch (e) {
      console.warn(`[Persistence] save failed for key="${key}":`, e);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    try {
      const val = await this.store.get<T>(key);
      return val ?? null;
    } catch (e) {
      console.warn(`[Persistence] load failed for key="${key}":`, e);
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.store.delete(key);
      await this.store.save();
    } catch (e) {
      console.warn(`[Persistence] remove failed for key="${key}":`, e);
    }
  }
}

export const persistence = new Persistence();
