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

// M4.5: Shortcut binding
export interface ShortcutBinding {
  id: string;
  keys: string;
  command: string;
  args: string[];
  label?: string;
}

// M4: Shell output / exit payloads
export interface ShellOutputPayload {
  session_id: string;
  data: string;
}

export interface ShellExitPayload {
  session_id: string;
  exit_code: number;
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

  // M4: Shell operations
  initShell: () => invoke<string>('init_shell'),
  writeStdin: (sessionId: string, data: string) => invoke<void>('write_stdin', { sessionId, data }),
  resizeShell: (sessionId: string, cols: number, rows: number) =>
    invoke<void>('resize_shell', { sessionId, cols, rows }),
  killShell: (sessionId: string) => invoke<void>('kill_shell', { sessionId }),

  // M4.5: Icon extraction [REQ-ICON-008]
  extractIcon: (path: string, size?: number) =>
    invoke<string>('extract_icon', { path, size: size ?? 32 }),

  // M4.5: Shortcut binding config [REQ-SYS-008]
  registerShortcuts: (bindings: ShortcutBinding[]) =>
    invoke<void>('register_shortcuts', { bindings }),
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

  // M4: Shell real-time output
  onShellOutput: (cb: (payload: ShellOutputPayload) => void) =>
    listen<ShellOutputPayload>('shell:output', (e) => cb(e.payload)),

  // M4: Shell process exit
  onShellExit: (cb: (payload: ShellExitPayload) => void) =>
    listen<ShellExitPayload>('shell:exit', (e) => cb(e.payload)),
};
