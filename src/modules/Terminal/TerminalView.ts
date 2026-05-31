import { ModuleBase } from '../../core/ModuleBase';
import { dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { CustomCommands } from './CustomCommands';
import './styles.css';

export class TerminalView extends ModuleBase {
  private customCommands: CustomCommands | null = null;

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
  }

  destroy(): void {
    this.cleanupHandlers();
  }

  protected renderContent(): void {
    this.contentArea.innerHTML = '<div class="terminal-placeholder">终端模块</div>';
  }
}
