// DesktopBox - Application State
// Lightweight reactive state management using Tauri events

export interface MonitorData {
  cpu: number;
  gpu: number;
  memory: number;
  memoryUsed: number;
  memoryTotal: number;
}

export interface Partition {
  id: string;
  name: string;
  iconCount: number;
}

export interface AppState {
  [key: string]: unknown;
  partitions: Partition[];
  activePartition: string | null;
  monitor: MonitorData | null;
  isWindowVisible: boolean;
}

// Simple observable state
type Listener = () => void;

class Store<T extends Record<string, unknown>> {
  private state: T;
  private listeners = new Map<keyof T, Set<Listener>>();

  constructor(initial: T) {
    this.state = { ...initial };
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.state[key];
  }

  set<K extends keyof T>(key: K, value: T[K]) {
    this.state[key] = value;
    this.notify(key);
  }

  on(key: keyof T, listener: Listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    return () => this.listeners.get(key)?.delete(listener);
  }

  private notify(key: keyof T) {
    this.listeners.get(key)?.forEach((fn) => fn());
  }
}

// Global app state instance
export const appState = new Store<AppState>({
  partitions: [
    { id: "desktop", name: "桌面图标", iconCount: 0 },
    { id: "docs", name: "文档", iconCount: 0 },
    { id: "tools", name: "工具", iconCount: 0 },
  ],
  activePartition: "desktop",
  monitor: null,
  isWindowVisible: true,
});
