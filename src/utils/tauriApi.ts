import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ── Types ──

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  extension: string | null;
}

export interface DesktopChangePayload {
  added: FileEntry[];
  removed: FileEntry[];
  modified: FileEntry[];
  is_full: boolean;
}

export interface SystemStats {
  cpu_usage: number;
  gpu_usage: number | null;
  memory_used: number;
  memory_total: number;
  processes: number;
  uptime: number;
  timestamp: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_usage: number;
}

// ── API ──

export const api = {
  // Window control [REQ-SYS]
  toggleModulesVisibility: () => invoke<void>('toggle_modules_visibility'),
  getWindowDowngrade: () => invoke<boolean>('get_window_downgrade'),
  setWindowDowngrade: (downgrade: boolean) => invoke<void>('set_window_downgrade', { downgrade }),

  // M2a: Desktop file operations
  getDesktopFiles: () => invoke<FileEntry[]>('get_desktop_files'),
  openFile: (path: string) => invoke<void>('open_file', { path }),
};

// ── Events ──

export const events = {
  // M2a: Listen for real-time desktop file changes from FilePoller
  onDesktopFiles: (cb: (payload: DesktopChangePayload) => void) =>
    listen<DesktopChangePayload>('desktop:files', (e) => cb(e.payload)),

  // M3: System resource monitoring
  onSystemStats: (cb: (stats: SystemStats) => void) =>
    listen<SystemStats>('system:stats', (e) => cb(e.payload)),

  // M3: Process list
  onProcessList: (cb: (processes: ProcessInfo[]) => void) =>
    listen<ProcessInfo[]>('system:processes', (e) => cb(e.payload)),
};
