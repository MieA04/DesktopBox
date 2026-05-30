// DesktopBox - Frontend Entry Point
// Initializes the app, wires up titlebar controls

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ─── DOM References ────────────────────────────────────────

const $ = (sel: string) => document.querySelector(sel);
const $$ = (sel: string) => document.querySelectorAll(sel);

// ─── Titlebar Controls ─────────────────────────────────────

function setupTitlebar() {
  const appWindow = getCurrentWindow();

  $("#btn-minimize")?.addEventListener("click", () => {
    appWindow.minimize();
  });

  $("#btn-close")?.addEventListener("click", async () => {
    // Restore system icons and taskbar before exit
    await invoke("show_desktop_icons");
    await invoke("show_taskbar");
    appWindow.close();
  });
}

// ─── Partition Navigation ──────────────────────────────────

function setupPartitions() {
  const items = $$(".partition-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

// ─── Tauri API Wrapper ─────────────────────────────────────

async function hideSystemIcons() {
  try {
    await invoke("hide_desktop_icons");
    await invoke("hide_taskbar");
    console.log("[DesktopBox] System icons and taskbar hidden");
  } catch (e) {
    console.error("[DesktopBox] Failed to hide system UI:", e);
  }
}

// ─── App Initialization ────────────────────────────────────

async function init() {
  console.log("[DesktopBox] Starting...");

  // Setup UI controls
  setupTitlebar();
  setupPartitions();

  // Hide system desktop icons and taskbar on launch
  await hideSystemIcons();

  console.log("[DesktopBox] Ready");
}

// ─── DOM Ready ──────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
