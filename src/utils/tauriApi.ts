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

// ── API ──

export const api = {
  // Window control [REQ-SYS]
  toggleModulesVisibility: () => invoke<void>('toggle_modules_visibility'),
  getWindowDowngrade: () => invoke<boolean>('get_window_downgrade'),
  setWindowDowngrade: (downgrade: boolean) =>
    invoke<void>('set_window_downgrade', { downgrade }),

  // M2a: Desktop file operations
  getDesktopFiles: () => invoke<FileEntry[]>('get_desktop_files'),
  openFile: (path: string) => invoke<void>('open_file', { path }),
};

// ── Events ──

export const events = {
  // M2a: Listen for real-time desktop file changes from FilePoller
  onDesktopFiles: (cb: (payload: DesktopChangePayload) => void) =>
    listen<DesktopChangePayload>('desktop:files', e => cb(e.payload)),
};
