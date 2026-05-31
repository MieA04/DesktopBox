import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import { ModuleBase } from '../../core/ModuleBase';
import { dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { api, events } from '../../utils/tauriApi';
import { Slider } from '../../components/Slider';
import { SettingsPanel } from '../../components/SettingsPanel';
import { CustomCommands } from './CustomCommands';
import './styles.css';

/** Available theme presets for the terminal */
export type TerminalTheme = 'dark' | 'light';

/** Terminal module settings */
export interface TerminalSettings {
  fontSize: number;
  theme: TerminalTheme;
}

/** Default terminal settings */
const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 14,
  theme: 'dark',
};

/**
 * Light theme xterm.js theme overrides (based on default xterm dark theme)
 */
const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#000000',
  selectionBackground: '#c0c0c0',
  black: '#000000',
  red: '#a80000',
  green: '#00a800',
  yellow: '#a8a800',
  blue: '#0000a8',
  magenta: '#a800a8',
  cyan: '#00a8a8',
  white: '#c0c0c0',
  brightBlack: '#808080',
  brightRed: '#ff0000',
  brightGreen: '#00ff00',
  brightYellow: '#ffff00',
  brightBlue: '#0000ff',
  brightMagenta: '#ff00ff',
  brightCyan: '#00ffff',
  brightWhite: '#ffffff',
};

export class TerminalView extends ModuleBase {
  // xterm.js instances
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private terminalContainer: HTMLElement | null = null;

  // Shell session
  private sessionId: string | null = null;

  // Custom commands bar
  private customCommands: CustomCommands | null = null;

  // Settings
  private settings: TerminalSettings = { ...DEFAULT_TERMINAL_SETTINGS };

  // Event listener lifecycle (Promise race protection pattern)
  private unlistenOutput: (() => void) | null = null;
  private unlistenOutputPromise: Promise<() => void> | null = null;
  private unlistenExit: (() => void) | null = null;
  private unlistenExitPromise: Promise<() => void> | null = null;

  // Resize observer for fit addon
  private resizeObserver: ResizeObserver | null = null;

  // Settings panel (shared component + terminal extras)
  private settingsPanel: SettingsPanel | null = null;

  constructor() {
    super('terminal', '终端', {
      position: { x: 100, y: 400 },
      size: { width: 640, height: 400 },
    });
  }

  init(): void {
    this.createTitleBar();
    this.renderContent();
    this.createResizeHandle();

    // Attach drag
    dragEngine.attach(this);

    // Click to bring to front
    const bringToFront = (() => {
      moduleManager.setActiveModule(this.id);
    }) as EventListener;
    this.container.addEventListener('pointerdown', bringToFront);
    this.boundHandlers.push({ el: this.container, type: 'pointerdown', handler: bringToFront });

    // Double-click titlebar to un-dock
    const onDblClick = (() => {
      if (this.getState().dock !== 'none') {
        this.setDock('none');
      }
    }) as EventListener;
    this.titleBar?.addEventListener('dblclick', onDblClick);
    if (this.titleBar) {
      this.boundHandlers.push({ el: this.titleBar, type: 'dblclick', handler: onDblClick });
    }

    // Kick off async initialization
    this.initTerminal();
    this.initShell();
    this.listenShellEvents();
  }

  destroy(): void {
    // Close settings panel
    this.closeSettingsPanel();

    // Kill shell session
    this.killSession();

    // Unlisten shell:output (with race protection)
    if (this.unlistenOutput) {
      this.unlistenOutput();
      this.unlistenOutput = null;
    } else if (this.unlistenOutputPromise) {
      this.unlistenOutputPromise.then((fn) => fn()).catch(() => {});
    }

    // Unlisten shell:exit (with race protection)
    if (this.unlistenExit) {
      this.unlistenExit();
      this.unlistenExit = null;
    } else if (this.unlistenExitPromise) {
      this.unlistenExitPromise.then((fn) => fn()).catch(() => {});
    }

    // Disconnect resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Dispose xterm
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
    this.fitAddon = null;

    // Clean up custom commands
    this.customCommands?.destroy();
    this.customCommands = null;

    // Clean up all registered DOM event listeners
    this.cleanupHandlers();
  }

  protected renderContent(): void {
    // Terminal output area (takes remaining flex space)
    this.terminalContainer = document.createElement('div');
    this.terminalContainer.className = 'terminal-container';
    this.contentArea.appendChild(this.terminalContainer);

    // Custom commands bar (bottom of module)
    this.customCommands = new CustomCommands(this.contentArea, this);
  }

  // ── Settings API (used by Task 7) ──

  /** Update terminal font size and apply immediately */
  setTerminalFontSize(size: number): void {
    this.settings.fontSize = size;
    if (this.terminal) {
      this.terminal.options.fontSize = size;
      this.fitAddon?.fit();
    }
  }

  /** Update terminal theme and apply immediately */
  setTerminalTheme(theme: TerminalTheme): void {
    this.settings.theme = theme;
    if (this.terminal) {
      if (theme === 'light') {
        this.terminal.options.theme = LIGHT_THEME;
      } else {
        this.terminal.options.theme = undefined; // revert to default dark
      }
    }
  }

  /** Get current terminal settings */
  getTerminalSettings(): TerminalSettings {
    return { ...this.settings };
  }

  /** Get the session ID (used by CustomCommands to write stdin) */
  getSessionId(): string | null {
    return this.sessionId;
  }

  // ── Settings Panel (Task 7) ──

  protected onSettingsClick(): void {
    if (!this.settingsPanel) {
      this.createSettingsPanel();
    } else {
      this.closeSettingsPanel();
    }
  }

  /** Close and destroy the settings panel */
  closeSettingsPanel(): void {
    if (this.settingsPanel) {
      this.settingsPanel.close();
      this.settingsPanel = null;
    }
  }

  // ── Private ──

  private initTerminal(): void {
    if (!this.terminalContainer) return;

    this.terminal = new Terminal({
      fontSize: this.settings.fontSize,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      cols: 80,
      rows: 24,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    // Open terminal in container
    this.terminal.open(this.terminalContainer);
    this.fitAddon.fit();

    // Observe container resizes to re-fit
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAddon?.fit();
    });
    this.resizeObserver.observe(this.terminalContainer);

    // Handle user input -> send to shell
    this.terminal.onData((data: string) => {
      if (!this.sessionId) return;
      api.writeStdin(this.sessionId, data).catch((err) => {
        console.warn('[Terminal] write_stdin failed:', err);
      });
    });
  }

  private initShell(): void {
    api
      .initShell()
      .then((sid) => {
        this.sessionId = sid;
      })
      .catch((err) => {
        console.warn('[Terminal] init_shell failed:', err);
        if (this.terminal) {
          this.terminal.writeln('\r\n\x1b[31mFailed to initialize shell.\x1b[0m');
        }
      });
  }

  private createSettingsPanel(): void {
    // Build terminal-specific extra widgets
    // Font size slider (10-24)
    const extraWidgets: HTMLElement[] = [];

    const fontContainer = document.createElement('div');
    const fontSlider = new Slider(fontContainer, {
      min: 10,
      max: 24,
      step: 1,
      value: this.settings.fontSize,
      label: '字体大小',
      onInput: (v) => this.setTerminalFontSize(v),
      onChange: () => {},
    });
    extraWidgets.push(fontContainer);

    // Theme toggle button
    const themeBtn = document.createElement('button');
    themeBtn.className = 'terminal-theme-btn';
    themeBtn.textContent = this.settings.theme === 'dark' ? '切换到浅色' : '切换到暗色';
    themeBtn.addEventListener('click', () => {
      const newTheme: TerminalTheme = this.settings.theme === 'dark' ? 'light' : 'dark';
      this.setTerminalTheme(newTheme);
      themeBtn.textContent = newTheme === 'dark' ? '切换到浅色' : '切换到暗色';
    });
    extraWidgets.push(themeBtn);

    // Create shared SettingsPanel with blur + opacity sliders + extra widgets
    this.settingsPanel = new SettingsPanel(this.container, this, () => {
      this.settingsPanel = null;
      fontSlider.destroy();
    }, extraWidgets);
  }

  private listenShellEvents(): void {
    // Listen for shell:output
    const outputPromise = events.onShellOutput((payload) => {
      if (payload.session_id !== this.sessionId) return;
      if (this.terminal) {
        this.terminal.write(payload.data);
      }
    });
    if (outputPromise && typeof outputPromise.then === 'function') {
      this.unlistenOutputPromise = outputPromise;
      outputPromise
        .then((fn) => {
          this.unlistenOutput = fn;
        })
        .catch((err) => {
          console.warn('[Terminal] Failed to listen shell:output:', err);
        });
    }

    // Listen for shell:exit
    const exitPromise = events.onShellExit((payload) => {
      if (payload.session_id !== this.sessionId) return;
      this.onProcessExit(payload.exit_code);
    });
    if (exitPromise && typeof exitPromise.then === 'function') {
      this.unlistenExitPromise = exitPromise;
      exitPromise
        .then((fn) => {
          this.unlistenExit = fn;
        })
        .catch((err) => {
          console.warn('[Terminal] Failed to listen shell:exit:', err);
        });
    }
  }

  private onProcessExit(exitCode: number): void {
    this.sessionId = null;
    if (this.terminal) {
      this.terminal.writeln(
        `\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m`,
      );
    }
  }

  private killSession(): void {
    if (!this.sessionId) return;
    const sid = this.sessionId;
    this.sessionId = null;
    api.killShell(sid).catch((err) => {
      console.warn('[Terminal] kill_shell failed:', err);
    });
  }
}
