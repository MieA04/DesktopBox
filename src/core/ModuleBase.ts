import { ModuleState } from './StateManager';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type DockState = 'none' | 'left' | 'right' | 'top' | 'bottom';

export abstract class ModuleBase {
  readonly id: string;
  readonly title: string;
  readonly container: HTMLElement;
  protected contentArea: HTMLElement;
  protected state: ModuleState;
  protected titleBar?: HTMLElement;
  protected resizeHandle?: HTMLElement;
  private preSnapSize?: Size;

  constructor(id: string, title: string, defaultState: Partial<Omit<ModuleState, 'id' | 'title'>>) {
    this.id = id;
    this.title = title;

    // Set default state
    this.state = {
      id,
      title,
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      dock: 'none',
      zIndex: 1,
      visible: true,
      opacity: 0.6,
      blurStrength: 20,
      ...defaultState,
    };

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'module';
    this.container.dataset.moduleId = id;
    this.applyState();

    // Create content area
    this.contentArea = document.createElement('div');
    this.contentArea.className = 'module-content';
    this.container.appendChild(this.contentArea);
  }

  // ── Lifecycle ──

  abstract init(): void;
  abstract destroy(): void;
  protected abstract renderContent(): void;

  onActivate(): void {}
  onDeactivate(): void {}
  protected onDockChange(_dock: DockState): void {}

  // ── Position / Size ──

  setPosition(pos: Position): void {
    // C5: 防止模块被完全拖出屏幕——允许最多 50px 被拖出边缘
    const clamped = {
      x: Math.max(-this.state.size.width + 50, Math.min(pos.x, window.innerWidth - 50)),
      y: Math.max(-this.state.size.height + 50, Math.min(pos.y, window.innerHeight - 50)),
    };
    this.state = { ...this.state, position: clamped };
    this.container.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
  }

  setSize(size: Size): void {
    this.state = { ...this.state, size };
    this.container.style.width = `${size.width}px`;
    this.container.style.height = `${size.height}px`;
  }

  setZIndex(z: number): void {
    this.state = { ...this.state, zIndex: z };
    this.container.style.zIndex = String(z);
  }

  setDock(dock: DockState): void {
    // Save pre-snap size when entering snap mode
    if (dock !== 'none' && this.state.dock === 'none') {
      this.preSnapSize = { ...this.state.size };
    } else if (dock === 'none' && this.state.dock !== 'none' && this.preSnapSize) {
      // Restore pre-snap size when leaving snap mode
      this.setSize(this.preSnapSize);
      this.preSnapSize = undefined;
    }
    this.state = { ...this.state, dock };
    this.container.classList.toggle('docked', dock !== 'none');
    this.onDockChange(dock);
  }

  // ── Acrylic ──

  setBlurStrength(px: number): void {
    this.state = { ...this.state, blurStrength: px };
    this.container.style.setProperty('--blur-strength', `${px}px`);
  }

  setBgOpacity(opacity: number): void {
    this.state = { ...this.state, opacity };
    this.container.style.setProperty('--bg-opacity', String(opacity));
  }

  // ── Visibility ──

  show(): void {
    this.state = { ...this.state, visible: true };
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.state = { ...this.state, visible: false };
    this.container.style.display = 'none';
  }

  // ── Getters ──

  getState(): ModuleState { return { ...this.state }; }

  // ── Internal ──

  protected applyState(): void {
    this.setPosition(this.state.position);
    this.setSize(this.state.size);
    this.setZIndex(this.state.zIndex);
    this.setBlurStrength(this.state.blurStrength);
    this.setBgOpacity(this.state.opacity);
    if (this.state.dock !== 'none') {
      this.setDock(this.state.dock);
    }
    if (!this.state.visible) {
      this.hide();
    }
  }
}
