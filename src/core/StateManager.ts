import { signal, computed, ReadonlySignal } from '@preact/signals';
import { Position, Size, DockState } from './ModuleBase';
import { SystemStats, ProcessInfo } from '../utils/tauriApi';

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

  // M3: System monitoring state
  systemStats = signal<SystemStats | null>(null);
  processList = signal<ProcessInfo[]>([]);
  searchQuery = signal<string>('');
  sortColumn = signal<string | null>(null);
  sortDirection = signal<'asc' | 'desc'>('asc');

  activeModule: ReadonlySignal<ModuleState | undefined> = computed(() =>
    this.modules.value.find(m => m.id === this.activeModuleId.value),
  );

  // M3: Filtered and sorted process list (reactive)
  filteredProcesses: ReadonlySignal<ProcessInfo[]> = computed(() => {
    let list = this.processList.value;
    // Search filter
    const q = this.searchQuery.value.toLowerCase();
    if (q) {
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    // Sort
    const col = this.sortColumn.value;
    const dir = this.sortDirection.value;
    if (col) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        switch (col) {
          case 'name': cmp = a.name.localeCompare(b.name); break;
          case 'pid': cmp = a.pid - b.pid; break;
          case 'cpu': cmp = a.cpu_usage - b.cpu_usage; break;
          case 'memory': cmp = a.memory_usage - b.memory_usage; break;
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  });

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
