import { ModuleBase } from './ModuleBase';
import { eventBus } from './EventBus';
import { DEFAULT } from '../utils/constants';
import { clamp } from '../utils/helpers';

// ── Strategy Interface ──

export interface DragStrategy {
  onStart(e: PointerEvent, module: ModuleBase): void;
  onMove(e: PointerEvent, module: ModuleBase): void;
  onEnd(e: PointerEvent, module: ModuleBase): void;
}

// ── Free Drag (悬浮拖拽) ──
// [REQ-FRM-001] Uses transform: translate(), no layout thrashing

export class FreeDragStrategy implements DragStrategy {
  private startPos = { x: 0, y: 0 };
  private startMouse = { x: 0, y: 0 };

  onStart(e: PointerEvent, module: ModuleBase): void {
    const state = module.getState();
    this.startPos = { ...state.position };
    this.startMouse = { x: e.clientX, y: e.clientY };
    module.container.style.pointerEvents = 'none';
  }

  onMove(e: PointerEvent, module: ModuleBase): void {
    const dx = e.clientX - this.startMouse.x;
    const dy = e.clientY - this.startMouse.y;
    module.setPosition({
      x: this.startPos.x + dx,
      y: this.startPos.y + dy,
    });
  }

  onEnd(_e: PointerEvent, module: ModuleBase): void {
    module.container.style.pointerEvents = '';
    eventBus.emit('layout:changed');
  }
}

// ── Resize (缩放拖拽) ──
// [REQ-FRM-002] From bottom-right handle

export class ResizeStrategy implements DragStrategy {
  private startSize = { width: 0, height: 0 };
  private startMouse = { x: 0, y: 0 };

  onStart(e: PointerEvent, module: ModuleBase): void {
    const state = module.getState();
    this.startSize = { ...state.size };
    this.startMouse = { x: e.clientX, y: e.clientY };
  }

  onMove(e: PointerEvent, module: ModuleBase): void {
    const dx = e.clientX - this.startMouse.x;
    const dy = e.clientY - this.startMouse.y;
    const newWidth = clamp(
      this.startSize.width + dx,
      DEFAULT.MODULE.MIN_WIDTH,
      window.innerWidth,
    );
    const newHeight = clamp(
      this.startSize.height + dy,
      DEFAULT.MODULE.MIN_HEIGHT,
      window.innerHeight,
    );
    module.setSize({ width: newWidth, height: newHeight });
  }

  onEnd(_e: PointerEvent, _module: ModuleBase): void {
    eventBus.emit('layout:changed');
  }
}

// ── Drag Engine ──

export class DragEngine {
  private strategy: DragStrategy = new FreeDragStrategy();
  private activeModule: ModuleBase | null = null;
  private boundOnMove: ((e: PointerEvent) => void) | null = null;
  private boundOnEnd: ((e: PointerEvent) => void) | null = null;
  private attachedModules: Set<string> = new Set();
  /** Stores per-module pointerdown handler references for proper detach cleanup */
  private moduleCallbacks: Map<string, EventListener> = new Map();
  /** Reusable strategy instance (R3: avoid GC pressure from per-attach allocations) */
  private freeDragStrategy = new FreeDragStrategy();

  setStrategy(strategy: DragStrategy): void {
    this.strategy = strategy;
  }

  attach(module: ModuleBase): void {
    if (this.attachedModules.has(module.id)) return;
    this.attachedModules.add(module.id);
    const dragElement = module.container.querySelector('.module-drag-handle');
    if (!dragElement) return;

    const onStart = (e: PointerEvent) => {
      this.activeModule = module;

      // 始终使用自由拖拽策略（不再支持贴靠）
      this.setStrategy(this.freeDragStrategy);

      this.strategy.onStart(e, module);

      // Attach global move/end listeners
      this.boundOnMove = (ev: PointerEvent) => {
        if (this.activeModule) this.strategy.onMove(ev, this.activeModule);
      };
      this.boundOnEnd = (ev: PointerEvent) => {
        if (this.activeModule) {
          this.strategy.onEnd(ev, this.activeModule);
          this.activeModule = null;
        }
        document.removeEventListener('pointermove', this.boundOnMove!);
        document.removeEventListener('pointerup', this.boundOnEnd!);
        this.boundOnMove = null;
        this.boundOnEnd = null;
      };
      document.addEventListener('pointermove', this.boundOnMove);
      document.addEventListener('pointerup', this.boundOnEnd);
    };

    // Store the callback reference for detach cleanup (R2)
    const handler = (e: Event) => onStart(e as PointerEvent);
    this.moduleCallbacks.set(module.id, handler);
    dragElement.addEventListener('pointerdown', handler);
  }

  detach(module: ModuleBase): void {
    const handler = this.moduleCallbacks.get(module.id);
    if (handler) {
      const dragElement = module.container.querySelector('.module-drag-handle');
      if (dragElement) {
        dragElement.removeEventListener('pointerdown', handler);
      }
      this.moduleCallbacks.delete(module.id);
    }
    this.attachedModules.delete(module.id);
  }

  getCurrentStrategy(): DragStrategy {
    return this.strategy;
  }

  setActiveModule(module: ModuleBase | null): void {
    this.activeModule = module;
  }
}

export const dragEngine = new DragEngine();
