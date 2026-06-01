import { ModuleBase } from '../../core/ModuleBase';
import { dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { DEFAULT } from '../../utils/constants';
import './styles.css';

export class DemoModule extends ModuleBase {
  constructor() {
    super('demo', 'Demo Module', {
      position: { x: (window.innerWidth - DEFAULT.MODULE.WIDTH) / 2, y: (window.innerHeight - DEFAULT.MODULE.HEIGHT) / 2 },
      size: { width: DEFAULT.MODULE.WIDTH, height: DEFAULT.MODULE.HEIGHT },
    });
  }

  init(): void {
    this.createDragHandle();
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
  }

  destroy(): void {
    this.cleanupHandlers();
  }

  protected renderContent(): void {
    this.contentArea.innerHTML = '<div class="demo-content">拖拽手柄移动 · 右下角缩放手柄调整大小</div>';
  }
}
