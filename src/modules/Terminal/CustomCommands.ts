/**
 * CustomCommands — 模块底部横向按钮组
 *
 * 从 Persistence 加载 custom-commands 配置（JSON 列表 [{ label, command }]），
 * 点击按钮调用 write_stdin(command + '\r\n')。
 */
import { api } from '../../utils/tauriApi';
import { persistence, STORAGE_KEYS } from '../../core/Persistence';
import type { TerminalView } from './TerminalView';

interface CustomCommand {
  label: string;
  command: string;
}

export class CustomCommands {
  private el: HTMLElement;
  private buttons: HTMLElement[] = [];
  private terminalView: TerminalView;

  constructor(container: HTMLElement, terminalView: TerminalView) {
    this.terminalView = terminalView;
    this.el = document.createElement('div');
    this.el.className = 'custom-commands-bar';
    container.appendChild(this.el);
    void this.loadCommands();
  }

  /** Reload command list from persistence (for future refresh use) */
  async loadCommands(): Promise<void> {
    this.clearButtons();
    const cmds = await persistence.load<CustomCommand[]>(STORAGE_KEYS.CUSTOM_COMMANDS);
    if (!cmds || cmds.length === 0) return;
    this.renderButtons(cmds);
  }

  destroy(): void {
    this.clearButtons();
    this.el.remove();
  }

  // ── Private ──

  private clearButtons(): void {
    this.buttons.forEach((btn) => btn.remove());
    this.buttons = [];
  }

  private renderButtons(commands: CustomCommand[]): void {
    commands.forEach((cmd) => {
      const btn = document.createElement('button');
      btn.className = 'custom-command-btn';
      btn.textContent = cmd.label;
      btn.title = cmd.command;
      btn.addEventListener('click', () => {
        const sid = this.terminalView.getSessionId();
        if (sid) {
          api.writeStdin(sid, cmd.command + '\r\n').catch((err) => {
            console.warn('[CustomCommands] write_stdin failed:', err);
          });
          this.terminalView.schedulePrompt();
        }
      });
      this.el.appendChild(btn);
      this.buttons.push(btn);
    });
  }
}
