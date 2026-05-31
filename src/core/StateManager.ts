import { signal, computed, ReadonlySignal } from '@preact/signals';
import { Position, Size, DockState } from './ModuleBase';

export interface ModuleState {
  id: string;
  title: string;
  position: Position;
  size: Size;
  dock: DockState;
  zIndex: number;
  visible: boolean;
  opacity: number;
  blurStrength: number;
}

export interface AppSettings {
  defaultBlurStrength: number;
  defaultBgOpacity: number;
  defaultBgRgb: [number, number, number];
  windowDowngrade: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultBlurStrength: 20,
  defaultBgOpacity: 0.6,
  defaultBgRgb: [255, 255, 255],
  windowDowngrade: false,
};

class AppState {
  modules = signal<ModuleState[]>([]);
  activeModuleId = signal<string | null>(null);
  settings = signal<AppSettings>(DEFAULT_SETTINGS);

  activeModule: ReadonlySignal<ModuleState | undefined> = computed(() =>
    this.modules.value.find(m => m.id === this.activeModuleId.value),
  );

  updateModuleState(id: string, partial: Partial<ModuleState>): void {
    this.modules.value = this.modules.value.map(m =>
      m.id === id ? { ...m, ...partial } : m,
    );
  }

  setActiveModule(id: string | null): void {
    this.activeModuleId.value = id;
  }

  updateSettings(partial: Partial<AppSettings>): void {
    this.settings.value = { ...this.settings.value, ...partial };
  }
}

export const appState = new AppState();
