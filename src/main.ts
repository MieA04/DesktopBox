import './styles.css';
import { listen } from '@tauri-apps/api/event';
import { moduleManager } from './core/ModuleManager';
import { IconBoxDescriptor } from './modules/IconBox';
import { MonitorPanelDescriptor } from './modules/MonitorPanel';
import { ProcessTableDescriptor } from './modules/ProcessTable';
import { TerminalDescriptor } from './modules/Terminal';
import { DEFAULT } from './utils/constants';

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
      Shortcut: Ctrl+Shift+D (hide/show app) | Mode: DEV
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

// ── M4.5: 默认快捷键绑定 — 在 Rust lib.rs 中注册 ──
// 前端不再调用 register_shortcuts invoke，避免与 Rust 层注册冲突。
// 快捷键注册的统一入口在 src-tauri/src/lib.rs setup() 中。

/**
 * 禁用 WebView2 内置浏览器功能（Ctrl+F/F12等）。
 * 桌面应用不需要浏览器快捷键，这些快捷键会干扰用户体验。
 * F12 同时通过 tauri.conf.json 'devtools: false' 禁用。
 */
function disableBrowserFeatures(): void {
  // 禁用右键上下文菜单
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // 拦截并阻止浏览器级别的键盘快捷键
  document.addEventListener('keydown', (e) => {
    // 允许终端模块处理键盘输入（xterm.js 接管了终端容器的键盘事件）
    // 只拦截文档层级的浏览器快捷键
    const key = e.key.toLowerCase();

    // 浏览器功能快捷键列表——这些快捷键在桌面应用中无意义
    const isBrowserShortcut =
      // F12 / Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C → 开发者工具
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
      // Ctrl+F → 页内查找
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'f') ||
      // Ctrl+H → 历史记录
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'h') ||
      // Ctrl+J → 下载
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'j') ||
      // Ctrl+U → 查看源代码
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'u') ||
      // Ctrl+S → 保存页面
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 's') ||
      // Ctrl+P → 打印
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'p') ||
      // Ctrl+N → 新建窗口
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'n') ||
      // Ctrl+W → 关闭标签（避免误关应用）
      (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'w') ||
      // F5 / Ctrl+R / Ctrl+Shift+R → 刷新
      e.key === 'F5' ||
      (e.ctrlKey && !e.altKey && key === 'r');

    if (isBrowserShortcut) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

async function main() {
  // Step 0: 禁用浏览器功能
  disableBrowserFeatures();

  // Step 1: Register modules
  moduleManager.register(IconBoxDescriptor);
  moduleManager.register(MonitorPanelDescriptor);
  moduleManager.register(ProcessTableDescriptor);
  moduleManager.register(TerminalDescriptor);

  // Step 2: Initialize all modules
  try {
    await moduleManager.initAll();
    console.log('[DesktopBox] All modules initialized');
  } catch (err) {
    console.error('Failed to initialize modules:', err);
  }

  // Step 2b: 快捷键注册 — 在 Rust lib.rs::setup() 中完成
  // 前端不再调用 register_shortcuts，避免与 Rust 层注册冲突导致快捷键不生效

  // Listen for Ctrl+Shift+F → toggle only icon-box visibility [REQ-SYS-007]
  await listen<void>('app:toggle-icon-box', () => {
    console.log('[main] Received app:toggle-icon-box event (Ctrl+Shift+F)');
    moduleManager.toggleModules(['icon-box']);
  });

  // M4.6: Listen for Ctrl+Shift+H → toggle all modules except icon-box [REQ-SYS-009]
  await listen<void>('app:toggle-others', () => {
    console.log('[main] Received app:toggle-others event (Ctrl+Shift+H)');
    moduleManager.toggleModulesExcept(['icon-box']);
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
