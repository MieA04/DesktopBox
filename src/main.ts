import './styles.css';
import { listen } from '@tauri-apps/api/event';
import { moduleManager } from './core/ModuleManager';
import { DemoModuleDescriptor } from './modules/DemoModule';
import { IconBoxDescriptor } from './modules/IconBox';
import { MonitorPanelDescriptor } from './modules/MonitorPanel';
import { ProcessTableDescriptor } from './modules/ProcessTable';
import { DEFAULT } from './utils/constants';

/**
 * Toggle counter for debugging shortcut event delivery
 */
let toggleCount = 0;
let overlayInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Create debug overlay (only in dev mode)
 * Shows module visibility state and shortcut registration.
 * [REQ-DEV-001] 开发调试覆盖层
 */
function createDevOverlay(): void {
  const overlay = document.createElement('div');
  overlay.id = 'dev-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    padding: 8px 14px;
    background: rgba(0, 0, 0, 0.55);
    color: #0f0;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.6;
    z-index: 999;
    pointer-events: none;
    user-select: none;
    border-radius: 0 0 8px 0;
    text-shadow: 0 0 4px rgba(0, 255, 0, 0.3);
  `;

  const updateOverlay = () => {
    const container = document.getElementById('modules-container');
    const moduleCount = container ? container.children.length : 0;

    // Build module visibility list
    const moduleStates = Array.from(container?.children ?? [])
      .map(el => {
        const id = (el as HTMLElement).dataset?.moduleId ?? '?';
        const visible = el instanceof HTMLElement
          ? el.style.display !== 'none'
          : true;
        return `${id}:${visible ? 'visible' : 'hidden'}`;
      })
      .join(', ');

    overlay.innerHTML = `
      [DesktopBox Dev Overlay]
      Modules: ${moduleCount} | ${moduleStates || 'none'}
      Shortcut: Ctrl+Shift+D (event-driven) | Triggered: ${toggleCount}x
      Mode: DEV
    `;
  };

  document.body.appendChild(overlay);
  updateOverlay();
  overlayInterval = setInterval(updateOverlay, DEFAULT.DEV_OVERLAY_INTERVAL);
}

/** @internal Exported for M2 teardown integration */
export function destroyDevOverlay(): void {
  if (overlayInterval !== null) {
    clearInterval(overlayInterval);
    overlayInterval = null;
  }
  const overlay = document.getElementById('dev-overlay');
  if (overlay) overlay.remove();
}

async function main() {
  // Step 1: Register modules
  moduleManager.register(DemoModuleDescriptor);
  moduleManager.register(IconBoxDescriptor);
  moduleManager.register(MonitorPanelDescriptor);
  moduleManager.register(ProcessTableDescriptor);

  // Step 2: Initialize all modules
  try {
    await moduleManager.initAll();
    console.log('[DesktopBox] All modules initialized');
  } catch (err) {
    console.error('Failed to initialize modules:', err);
  }

  // Step 3: Listen for Ctrl+Shift+D → toggle module visibility [REQ-SYS-003]
  await listen<void>('app:toggle-modules', () => {
    toggleCount++;
    console.log(`[DesktopBox] Toggle modules visibility (event #${toggleCount})`);
    moduleManager.toggleModules();
  });

  // Step 4: Create debug overlay in dev mode [REQ-DEV-001]
  if (import.meta.env.DEV) {
    createDevOverlay();
  }

  // Show ready indicator
  const appEl = document.getElementById('app');
  if (appEl) {
    const indicator = document.createElement('div');
    indicator.textContent = 'DesktopBox 已就绪 Ctrl+Shift+D 切换显隐';
    indicator.className = 'status-indicator';
    appEl.appendChild(indicator);
  }
}

main().catch(console.error);
