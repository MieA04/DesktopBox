import { ModuleBase, DockState } from './ModuleBase';
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
    // Snap detection
    const state = module.getState();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const threshold = DEFAULT.MODULE.SNAP_THRESHOLD;

    let newPos = { ...state.position };
    let newDock: DockState = 'none';

    // Check distance to edges
    const distLeft = state.position.x;
    const distRight = screenW - (state.position.x + state.size.width);
    const distTop = state.position.y;
    const distBottom = screenH - (state.position.y + state.size.height);

    if (distLeft < threshold && distLeft < distRight && distLeft < distTop && distLeft < distBottom) {
      newDock = 'left';
      newPos = { x: 0, y: DEFAULT.MODULE.DOCK_Y_OFFSET };
    } else if (distRight < threshold && distRight < distLeft && distRight < distTop && distRight < distBottom) {
      newDock = 'right';
      newPos = { x: screenW - state.size.width, y: DEFAULT.MODULE.DOCK_Y_OFFSET };
    } else if (distTop < threshold && distTop < distLeft && distTop < distRight && distTop < distBottom) {
      newDock = 'top';
      newPos = { x: 0, y: 0 };
      module.setSize({ width: screenW, height: state.size.height });
    } else if (distBottom < threshold && distBottom < distLeft && distBottom < distRight && distBottom < distTop) {
      newDock = 'bottom';
      newPos = { x: 0, y: screenH - state.size.height };
      module.setSize({ width: screenW, height: state.size.height });
    }

    if (newDock !== 'none') {
      module.setPosition(newPos);
      module.setDock(newDock);
    }

    // Notify ModuleManager to persist layout
    eventBus.emit('layout:changed');
  }
}

// ── Snap Drag (贴靠模式下的受限拖拽) ──
// [REQ-FRM-003] Double-click titlebar to unlock from dock
// Restricts movement along the docked edge axis only

export class SnapDragStrategy implements DragStrategy {
  private startPos = { x: 0, y: 0 };
  private startMouse = { x: 0, y: 0 };
  private dock: DockState = 'none';

  onStart(e: PointerEvent, module: ModuleBase): void {
    const state = module.getState();
    this.startPos = { ...state.position };
    this.startMouse = { x: e.clientX, y: e.clientY };
    this.dock = state.dock;
    module.container.style.pointerEvents = 'none';
  }

  onMove(e: PointerEvent, module: ModuleBase): void {
    const dx = e.clientX - this.startMouse.x;
    const dy = e.clientY - this.startMouse.y;
    const state = module.getState();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const moduleW = state.size.width;
    const moduleH = state.size.height;

    switch (this.dock) {
      case 'left':
        // Docked left: only vertical movement, x stays at 0
        module.setPosition({
          x: 0,
          y: Math.max(0, Math.min(screenH - moduleH, this.startPos.y + dy)),
        });
        break;
      case 'right':
        // Docked right: only vertical movement, x stays at right edge
        module.setPosition({
          x: screenW - moduleW,
          y: Math.max(0, Math.min(screenH - moduleH, this.startPos.y + dy)),
        });
        break;
      case 'top':
        // Docked top: only horizontal movement, y stays at 0
        module.setPosition({
          x: Math.max(0, Math.min(screenW - moduleW, this.startPos.x + dx)),
          y: 0,
        });
        break;
      case 'bottom':
        // Docked bottom: only horizontal movement, y stays at bottom
        module.setPosition({
          x: Math.max(0, Math.min(screenW - moduleW, this.startPos.x + dx)),
          y: screenH - moduleH,
        });
        break;
      default:
        break;
    }
  }

  onEnd(_e: PointerEvent, module: ModuleBase): void {
    module.container.style.pointerEvents = '';
    // Re-snap to the docked edge after release
    const state = module.getState();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    switch (state.dock) {
      case 'left':
        module.setPosition({ x: 0, y: state.position.y });
        break;
      case 'right':
        module.setPosition({ x: screenW - state.size.width, y: state.position.y });
        break;
      case 'top':
        module.setPosition({ x: state.position.x, y: 0 });
        break;
      case 'bottom':
        module.setPosition({ x: state.position.x, y: screenH - state.size.height });
        break;
    }

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
  /** Reusable strategy instances (R3: avoid GC pressure from per-attach allocations) */
  private freeDragStrategy = new FreeDragStrategy();
  private snapDragStrategy = new SnapDragStrategy();

  setStrategy(strategy: DragStrategy): void {
    this.strategy = strategy;
  }

  attach(module: ModuleBase): void {
    if (this.attachedModules.has(module.id)) return;
    this.attachedModules.add(module.id);
    const titleBar = module.container.querySelector('.module-titlebar');
    if (!titleBar) return;

    const onStart = (e: PointerEvent) => {
      this.activeModule = module;
      titleBar.setPointerCapture(e.pointerId);

      // Choose strategy based on dock state:
      //   docked → SnapDragStrategy (axis-restricted)
      //   free   → FreeDragStrategy (unrestricted)
      // R3: Reuse singleton strategy instances instead of allocating new ones per drag
      const dockState = module.getState().dock;
      this.setStrategy(
        dockState !== 'none'
          ? this.snapDragStrategy
          : this.freeDragStrategy,
      );

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
    titleBar.addEventListener('pointerdown', handler);
  }

  detach(module: ModuleBase): void {
    const handler = this.moduleCallbacks.get(module.id);
    if (handler) {
      const titleBar = module.container.querySelector('.module-titlebar');
      if (titleBar) {
        titleBar.removeEventListener('pointerdown', handler);
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
