import { ModuleBase } from './ModuleBase';
import { eventBus } from './EventBus';
import { dragEngine } from './DragEngine';
import { appState, ModuleState } from './StateManager';
import { persistence, STORAGE_KEYS } from './Persistence';
import { debounce } from '../utils/helpers';

export interface ModuleDescriptor {
  id: string;
  title: string;
  defaultState?: Partial<ModuleState>;
  create(): ModuleBase;
}

export class ModuleManager {
  private descriptors: Map<string, ModuleDescriptor> = new Map();
  private instances: Map<string, ModuleBase> = new Map();
  private container: HTMLElement | null = null;

  // 引用计数方案：hideCounts > 0 表示模块被外部隐藏，baseVisibility 记录基线可见性
  private hideCounts: Map<string, number> = new Map();
  private baseVisibility: Map<string, boolean> = new Map();

  private debouncedSaveLayout = debounce(async () => {
    await this.saveLayout();
  }, 500);

  /* @internal */
  constructor() {
    // Listen for layout changes and auto-save with debounce
    eventBus.on('layout:changed', () => {
      this.debouncedSaveLayout();
    });
  }

  setContainer(container: HTMLElement): void {
    this.container = container;
  }

  register(descriptor: ModuleDescriptor): void {
    this.descriptors.set(descriptor.id, descriptor);
  }

  unregister(id: string): void {
    this.descriptors.delete(id);
    const instance = this.instances.get(id);
    if (instance) {
      instance.destroy();
      this.instances.delete(id);
    }
  }

  getModule(id: string): ModuleBase | undefined {
    return this.instances.get(id);
  }

  getActiveModule(): ModuleBase | null {
    const activeId = appState.activeModuleId.value;
    return activeId ? this.instances.get(activeId) ?? null : null;
  }

  setActiveModule(id: string): void {
    const prev = this.getActiveModule();
    if (prev && prev.id !== id) {
      prev.onDeactivate();
    }
    appState.setActiveModule(id);
    const module = this.instances.get(id);
    if (module) {
      module.onActivate();
      this.bringToFront(id);
    }
  }

  bringToFront(id: string): void {
    const module = this.instances.get(id);
    if (!module || !this.container) return;

    // Find the highest z-index among siblings
    const siblings = Array.from(this.container.children) as HTMLElement[];
    let maxZ = 0;
    siblings.forEach(el => {
      const z = parseInt(el.style.zIndex) || 0;
      if (z > maxZ) maxZ = z;
    });
    module.setZIndex(maxZ + 1);
  }

  async initAll(): Promise<void> {
    if (!this.container) {
      // Create default container if not set — it used in #modules-container
      this.container = document.getElementById('modules-container');
      if (!this.container) {
        throw new Error('modules-container not found in DOM');
      }
    }

    this.descriptors.forEach((desc) => {
      if (this.instances.has(desc.id)) return;
      const instance = desc.create();
      // R8: 应用模块描述符中的默认状态（让 Descriptor.defaultState 生效）
      if (desc.defaultState) {
        if (desc.defaultState.position) {
          instance.setPosition(desc.defaultState.position);
        }
        if (desc.defaultState.size) {
          instance.setSize(desc.defaultState.size);
        }
        if (desc.defaultState.blurStrength !== undefined) {
          instance.setBlurStrength(desc.defaultState.blurStrength);
        }
        if (desc.defaultState.opacity !== undefined) {
          instance.setBgOpacity(desc.defaultState.opacity);
        }
      }
      this.instances.set(desc.id, instance);
      this.container!.appendChild(instance.container);
      instance.init();
    });

    // Restore saved layout positions after initialization
    await this.loadLayout();

    eventBus.emit('modules:initialized');
  }

  destroyAll(): void {
    this.instances.forEach(instance => {
      dragEngine.detach(instance);
      instance.destroy();
      instance.container.remove();
    });
    this.instances.clear();
  }

  // ── Module visibility control [REQ-SYS-003] ──

  /**
   * 根据计数器和基线可见性，将模块的 DOM 可见性与期望状态对齐。
   * 不依赖边界检查，而是绝对状态再同步。
   */
  private syncVisibility(module: ModuleBase): void {
    const id = module.id;
    const count = this.hideCounts.get(id) ?? 0;
    const base = this.baseVisibility.get(id) ?? true;

    if (count === 0) {
      if (base && !module.getState().visible) {
        module.show();
      } else if (!base && module.getState().visible) {
        module.hide();
      }
    } else {
      if (module.getState().visible) {
        module.hide();
      }
    }
  }

  /** Toggle visibility of specified modules (Ctrl+Shift+F: independent, bypasses counter) */
  toggleModules(ids: string[]): void {
    const targetModules = ids.map(id => this.instances.get(id)).filter(Boolean) as ModuleBase[];
    targetModules.forEach(module => {
      if (module.getState().visible) {
        module.hide();
      } else {
        module.show();
      }
    });
  }

  // ── M4.6: Toggle all modules except specified (Ctrl+Shift+H) [REQ-SYS-009] ──

  /** Toggle visibility of all modules except those in excludeIds */
  toggleModulesExcept(excludeIds: string[]): void {
    this.instances.forEach((module, id) => {
      if (excludeIds.includes(id)) return;
      const cur = this.hideCounts.get(id) ?? 0;
      this.hideCounts.set(id, cur > 0 ? 0 : cur + 1);
      this.syncVisibility(module);
    });
  }

  /** Query whether a module is currently visible */
  getModuleVisibility(id: string): boolean {
    return this.instances.get(id)?.getState().visible ?? false;
  }

  // ── Persistence [M2a-#6] ──

  /** Collect all module states and persist as layout snapshot */
  async saveLayout(): Promise<void> {
    const states: ModuleState[] = [];
    this.instances.forEach(instance => {
      states.push(instance.getState());
    });
    await persistence.save(STORAGE_KEYS.MODULE_LAYOUTS, states);
  }

  /** Restore module positions/sizes/visibility from saved layout */
  async loadLayout(): Promise<void> {
    const states = await persistence.load<ModuleState[]>(STORAGE_KEYS.MODULE_LAYOUTS);
    if (!states || states.length === 0) return;

    states.forEach(saved => {
      const instance = this.instances.get(saved.id);
      if (!instance) return;
      instance.setPosition(saved.position);
      instance.setSize(saved.size);
      instance.setZIndex(saved.zIndex);
      instance.setBlurStrength(saved.blurStrength);
      instance.setBgOpacity(saved.opacity);
      if (!saved.visible) instance.hide(); else instance.show();
    });

    // 重新加载布局后重置引用计数器（快捷键触发状态不可跨会话保持）
    this.hideCounts.clear();
    this.baseVisibility.clear();
    this.instances.forEach((module, id) => {
      this.hideCounts.set(id, 0);
      this.baseVisibility.set(id, module.getState().visible);
    });
  }
}

export const moduleManager = new ModuleManager();
