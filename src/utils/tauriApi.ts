// DesktopBox - Tauri API Wrapper
// Type-safe wrappers around Tauri invoke calls

import { invoke } from "@tauri-apps/api/core";

// ─── System UI Control ─────────────────────────────────────

export async function hideDesktopIcons(): Promise<void> {
  await invoke("hide_desktop_icons");
}

export async function showDesktopIcons(): Promise<void> {
  await invoke("show_desktop_icons");
}

export async function hideTaskbar(): Promise<void> {
  await invoke("hide_taskbar");
}

export async function showTaskbar(): Promise<void> {
  await invoke("show_taskbar");
}

export async function toggleWindowVisibility(): Promise<void> {
  await invoke("toggle_window_visibility");
}
