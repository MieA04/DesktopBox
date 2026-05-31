import { ModuleBase } from '../../core/ModuleBase';
import { ResizeStrategy, dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { DEFAULT } from '../../utils/constants';
import './styles.css';

interface BoundHandler {
  el: EventTarget;
  type: string;
  handler: EventListener;
}

export class DemoModule extends ModuleBase {
  private boundHandlers: BoundHandler[] = [];

  constructor() {
    super('demo', 'Demo Module', {
      position: { x: (window.innerWidth - DEFAULT.MODULE.WIDTH) / 2, y: (window.innerHeight - DEFAULT.MODULE.HEIGHT) / 2 },
      size: { width: DEFAULT.MODULE.WIDTH, height: DEFAULT.MODULE.HEIGHT },
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
    const onDblClick = ((() => {
      if (this.getState().dock !== 'none') {
        this.setDock('none');
      }
    }) as EventListener);
    this.titleBar?.addEventListener('dblclick', onDblClick);
    if (this.titleBar) {
      this.boundHandlers.push({ el: this.titleBar, type: 'dblclick', handler: onDblClick });
    }
  }

  destroy(): void {
    // Clean up all registered event listeners
    this.boundHandlers.forEach(({ el, type, handler }) => {
      el.removeEventListener(type, handler);
    });
    this.boundHandlers = [];
  }

  protected renderContent(): void {
    this.contentArea.innerHTML = '<div class="demo-content">拖拽标题栏移动 · 右下角缩放手柄调整大小</div>';
  }

  private createTitleBar(): void {
    this.titleBar = document.createElement('div');
    this.titleBar.className = 'module-titlebar';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'module-title';
    titleSpan.textContent = this.title;

    this.titleBar.appendChild(titleSpan);
    this.container.insertBefore(this.titleBar, this.contentArea);
  }

  private createResizeHandle(): void {
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'resize-handle';
    this.container.appendChild(this.resizeHandle);

    // Attach resize strategy
    const onResizeStart = (e: PointerEvent) => {
      e.stopPropagation();
      const engine = dragEngine;
      const prevStrategy = engine.getCurrentStrategy();
      const resizeStrategy = new ResizeStrategy();
      engine.setStrategy(resizeStrategy);
      resizeStrategy.onStart(e, this);
      engine.setActiveModule(this);

      const onMove = (ev: PointerEvent) => resizeStrategy.onMove(ev, this);
      const onUp = (ev: PointerEvent) => {
        resizeStrategy.onEnd(ev, this);
        engine.setActiveModule(null);
        engine.setStrategy(prevStrategy);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    };

    this.resizeHandle.addEventListener('pointerdown', onResizeStart);
    this.boundHandlers.push({ el: this.resizeHandle, type: 'pointerdown', handler: onResizeStart as EventListener });
  }
}
