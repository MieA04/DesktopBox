import { ModuleBase } from '../../core/ModuleBase';
import { dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { persistence, STORAGE_KEYS } from '../../core/Persistence';
import { api, events, FileEntry, DesktopChangePayload } from '../../utils/tauriApi';
import './styles.css';

/** Module-level constants for IconBox (C2: 消除魔法数值) */
const ICON_BOX = {
  GRID_GAP: 4,
  GRID_PADDING: 16,
  CELL_WIDTH: 80,
  DRAG_THRESHOLD: 5,
  MIRROR_Z_INDEX: '9999',
  MIRROR_OPACITY: '0.7',
  PLACEHOLDER_OPACITY: '0.3',
} as const;

/** Active drag-reorder session state */
interface DragReorderState {
  source: HTMLElement;
  mirror: HTMLElement | null;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  isDragging: boolean;
  targetBefore: HTMLElement | null;
  onMove: (ev: PointerEvent) => void;
  onUp: () => void;
}

export class IconBox extends ModuleBase {
  private iconCache: Map<string, HTMLElement> = new Map();
  /** M4.5: 缓存已加载的真实图标 data URL [REQ-ICON-008] */
  private iconDataUrlCache: Map<string, string> = new Map();
  /** M5: 图标提取分辨率（提取为固定大尺寸，CSS缩放至显示尺寸） */
  private iconSize = 48;
  /** M4.5: 显隐动画进行中标志 [REQ-FRM-010] */
  private isAnimating = false;
  /** M4.5: 动画时长（ms） */
  private readonly ANIM_DURATION = 250;
  /** [FIX #4] 追踪当前动画 setTimeout ID，防止新旧动画交叉覆盖 */
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private grid: HTMLElement | null = null;
  private unlistenDesktopFiles: (() => void) | null = null;
  /** 存储 listen() 返回的 Promise，防止 destroy() 与 Promise resolve 竞态（R5） */
  private unlistenDesktopFilesPromise: Promise<() => void> | null = null;

  // M2b-#1: Auto-arrange via ResizeObserver
  private resizeObserver: ResizeObserver | null = null;

  // M2b-#2: Drag-reorder session state
  private dragReorder: DragReorderState | null = null;

  constructor() {
    super('icon-box', '图标收纳盒', {
      size: { width: 640, height: 400 },
      opacity: 0.6,
      blurStrength: 20,
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

    // M2b-#1: Set up ResizeObserver for auto-arrange
    if (this.grid) {
      this.resizeObserver = new ResizeObserver(() => {
        this.recalculateGridColumns();
      });
      this.resizeObserver.observe(this.grid);
    }

    // M2b-#1: Calculate initial grid columns
    this.recalculateGridColumns();

    // Listen for real-time desktop file changes
    this.listenDesktopFiles();

    // Request initial full file list
    this.loadInitialFiles();
  }

  destroy(): void {
    // Cancel any active drag before tearing down
    this.cancelDrag();

    // M2b-#1: Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up all registered event listeners via base class
    this.cleanupHandlers();

    // 清空 grid 以移除 icon-item 上的事件监听器（R4: DOM 节点移除时监听器自动 GC）
    if (this.grid) {
      this.grid.innerHTML = '';
    }
    this.iconCache.clear();
    this.iconDataUrlCache.clear();

    // Unlisten desktop files event 及竞态处理（R5）
    if (this.unlistenDesktopFiles) {
      this.unlistenDesktopFiles();
      this.unlistenDesktopFiles = null;
    } else if (this.unlistenDesktopFilesPromise) {
      this.unlistenDesktopFilesPromise.then(fn => fn()).catch(() => {});
    }
  }

  // ── M4.5: 显隐动画 [REQ-FRM-010] (Task 2: 使用 marginTop 而非 transform, 避免覆盖 position) ──

  show(): void {
    if (this.isAnimating) {
      // [FIX #4] Cancel stale animation timer before shortcutting
      if (this.animationTimer !== null) {
        clearTimeout(this.animationTimer);
        this.animationTimer = null;
      }
      this.isAnimating = false;
      super.show();
      return;
    }
    this.isAnimating = true;
    this.state = { ...this.state, visible: true };
    this.container.style.display = 'flex';
    // 从底部弹入：使用 marginTop 而非 transform，避免与 position 的 translate 冲突
    this.container.style.transition = 'none';
    this.container.style.marginTop = '300px';
    this.container.style.opacity = '0';
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.container.offsetHeight; // 强制回流

    this.container.style.transition = `margin-top ${this.ANIM_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${this.ANIM_DURATION}ms ease-out`;
    this.container.style.marginTop = '';
    this.container.style.opacity = '';

    this.animationTimer = setTimeout(() => {
      this.container.style.transition = '';
      this.isAnimating = false;
      this.animationTimer = null;
    }, this.ANIM_DURATION);
  }

  hide(): void {
    if (this.isAnimating) {
      // [FIX #4] Cancel stale animation timer before shortcutting
      if (this.animationTimer !== null) {
        clearTimeout(this.animationTimer);
        this.animationTimer = null;
      }
      this.isAnimating = false;
      super.hide();
      return;
    }
    this.isAnimating = true;
    this.container.style.transition = `margin-top ${this.ANIM_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${this.ANIM_DURATION}ms ease-out`;
    this.container.style.marginTop = '300px';
    this.container.style.opacity = '0';

    this.animationTimer = setTimeout(() => {
      this.state = { ...this.state, visible: false };
      this.container.style.display = 'none';
      this.container.style.marginTop = '';
      this.container.style.opacity = '';
      this.container.style.transition = '';
      this.isAnimating = false;
      this.animationTimer = null;
    }, this.ANIM_DURATION);
  }

  protected renderContent(): void {
    this.grid = document.createElement('div');
    this.grid.className = 'icon-grid';
    this.grid.style.setProperty('--grid-columns', '10');
    this.grid.style.setProperty('--icon-display-size', `${this.iconSize}px`);
    this.contentArea.appendChild(this.grid);
  }

  // ── Private ──

  // ── M2b-#1: Auto-arrange [REQ-ICON-003] ──
  // Recalculate --grid-columns based on available width

  private recalculateGridColumns(): void {
    if (!this.grid) return;
    const gridWidth = this.grid.clientWidth;
    if (gridWidth <= 0) return; // Not laid out yet; ResizeObserver will re-fire

    const gap = ICON_BOX.GRID_GAP;
    const padding = ICON_BOX.GRID_PADDING;
    const targetCellWidth = ICON_BOX.CELL_WIDTH;

    // Available content width after subtracting padding
    const availableWidth = gridWidth - padding;
    // How many whole cells fit? (last gap is unused)
    let columns = Math.floor((availableWidth + gap) / (targetCellWidth + gap));
    columns = Math.max(6, Math.min(10, columns));

    this.grid.style.setProperty('--grid-columns', String(columns));

    // 自适应图标显示尺寸：根据实际列宽计算，上限不超过提取分辨率
    const totalGapWidth = (columns - 1) * gap;
    const cellWidth = (availableWidth - totalGapWidth) / columns;
    const rawIconSize = Math.floor(cellWidth * 0.65);
    const displaySize = Math.floor(Math.max(32, Math.min(this.iconSize, rawIconSize)));
    this.grid.style.setProperty('--icon-display-size', `${displaySize}px`);
  }

  // ── M2b-#2: Drag Reorder [REQ-ICON-006] ──

  private onIconPointerDown(e: PointerEvent, item: HTMLElement): void {
    if (e.button !== 0) return;
    e.preventDefault();

    const rect = item.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      if (!this.dragReorder) return;
      if (!this.dragReorder.isDragging) {
        const dx = ev.clientX - this.dragReorder.startX;
        const dy = ev.clientY - this.dragReorder.startY;
        if (Math.abs(dx) > ICON_BOX.DRAG_THRESHOLD || Math.abs(dy) > ICON_BOX.DRAG_THRESHOLD) {
          // Exceeded movement threshold — start drag
          this.dragReorder.isDragging = true;
          this.startIconDrag(ev);
        }
        return;
      }
      this.moveIconDrag(ev);
    };

    const onUp = () => {
      this.endIconDrag();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    this.dragReorder = {
      source: item,
      mirror: null,
      startX: e.clientX,
      startY: e.clientY,
      offsetX,
      offsetY,
      isDragging: false,
      targetBefore: null,
      onMove,
      onUp,
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  private startIconDrag(e: PointerEvent): void {
    if (!this.dragReorder) return;

    // 添加 dragging class 排除悬浮效果
    this.dragReorder.source.classList.add('dragging');

    // Create drag mirror — a semi-transparent clone that follows the cursor
    const mirror = this.dragReorder.source.cloneNode(true) as HTMLElement;
    mirror.style.position = 'fixed';
    mirror.style.zIndex = ICON_BOX.MIRROR_Z_INDEX;
    mirror.style.pointerEvents = 'none';
    mirror.style.opacity = ICON_BOX.MIRROR_OPACITY;
    mirror.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    mirror.style.width = `${this.dragReorder.source.offsetWidth}px`;
    mirror.style.left = `${e.clientX - this.dragReorder.offsetX}px`;
    mirror.style.top = `${e.clientY - this.dragReorder.offsetY}px`;

    // Remove dblclick listeners from mirror (avoids accidental opens)
    (mirror as HTMLElement).style.pointerEvents = 'none';

    document.body.appendChild(mirror);
    this.dragReorder.mirror = mirror;

    // Source item becomes a faded placeholder
    this.dragReorder.source.style.opacity = ICON_BOX.PLACEHOLDER_OPACITY;
  }

  private moveIconDrag(e: PointerEvent): void {
    if (!this.dragReorder || !this.dragReorder.mirror) return;

    // Update mirror position to follow cursor
    this.dragReorder.mirror.style.left = `${e.clientX - this.dragReorder.offsetX}px`;
    this.dragReorder.mirror.style.top = `${e.clientY - this.dragReorder.offsetY}px`;

    // Detect target icon under cursor
    const target = this.getIconItemAtPoint(e.clientX, e.clientY);
    this.updateDragIndicator(target);
  }

  /** Find the closest .icon-item under a viewport point, excluding the source */
  private getIconItemAtPoint(x: number, y: number): HTMLElement | null {
    if (!this.grid || !this.dragReorder) return null;

    // Temporarily hide mirror so elementFromPoint sees the underlying element
    if (this.dragReorder.mirror) {
      this.dragReorder.mirror.style.display = 'none';
    }

    const el = document.elementFromPoint(x, y);

    if (this.dragReorder.mirror) {
      this.dragReorder.mirror.style.display = '';
    }

    if (!el) return null;

    // Walk up ancestors to find an .icon-item
    let target = el as HTMLElement;
    while (target && target !== this.grid) {
      if (target.classList.contains('icon-item')) {
        // Don't target the source item itself
        return target === this.dragReorder.source ? null : target;
      }
      target = target.parentElement as HTMLElement;
    }
    return null;
  }

  /** Show/hide insertion indicator (highlighted outline) on target */
  private updateDragIndicator(target: HTMLElement | null): void {
    if (!this.dragReorder) return;

    // Clear previous indicator
    if (this.dragReorder.targetBefore) {
      this.dragReorder.targetBefore.classList.remove('drag-target');
      this.dragReorder.targetBefore = null;
    }

    if (target) {
      target.classList.add('drag-target');
      this.dragReorder.targetBefore = target;
    }
  }

  private endIconDrag(): void {
    if (!this.dragReorder) return;

    // Remove drag mirror from DOM
    if (this.dragReorder.mirror) {
      this.dragReorder.mirror.remove();
      this.dragReorder.mirror = null;
    }

    // Restore source item opacity
    this.dragReorder.source.style.opacity = '';
    // 移除 dragging class 恢复悬浮效果
    this.dragReorder.source.classList.remove('dragging');

    // Clear insertion indicator
    if (this.dragReorder.targetBefore) {
      this.dragReorder.targetBefore.classList.remove('drag-target');
    }

    // Execute DOM reorder if drag was active and a target was found
    if (this.dragReorder.isDragging && this.dragReorder.targetBefore && this.grid) {
      // Ensure source is still a child of grid (may have been cleared by a full refresh)
      if (this.grid.contains(this.dragReorder.source)) {
        this.grid.insertBefore(this.dragReorder.source, this.dragReorder.targetBefore);
        // M2b-#4: Persist the new icon order
        void this.saveIconOrder();
      }
    }

    this.dragReorder = null;
  }

  /** Cancel drag without reordering (used during destroy) */
  private cancelDrag(): void {
    if (!this.dragReorder) return;

    // Detach document-level listeners
    document.removeEventListener('pointermove', this.dragReorder.onMove);
    document.removeEventListener('pointerup', this.dragReorder.onUp);

    if (this.dragReorder.isDragging) {
      if (this.dragReorder.mirror) {
        this.dragReorder.mirror.remove();
      }
      this.dragReorder.source.style.opacity = '';
      this.dragReorder.source.classList.remove('dragging');
      if (this.dragReorder.targetBefore) {
        this.dragReorder.targetBefore.classList.remove('drag-target');
      }
    }

    this.dragReorder = null;
  }

  // ── M2b-#4: Icon Order Persistence ──

  /** Save current DOM icon order to persistent store */
  private async saveIconOrder(): Promise<void> {
    if (!this.grid) return;
    const paths: string[] = [];
    for (let i = 0; i < this.grid.children.length; i++) {
      const child = this.grid.children[i] as HTMLElement;
      const path = child.dataset.path;
      if (path) paths.push(path);
    }
    await persistence.save(STORAGE_KEYS.ICON_ORDER, paths);
  }

  /** Restore saved icon order from persistent store (applied after full list render) */
  private async loadIconOrder(): Promise<void> {
    if (!this.grid) return;
    // Do not reorder while a drag is in progress
    if (this.dragReorder) return;

    const savedOrder = await persistence.load<string[]>(STORAGE_KEYS.ICON_ORDER);
    if (!savedOrder || savedOrder.length === 0) return;

    const children = Array.from(this.grid.children) as HTMLElement[];

    // Build path → saved-index map
    const orderMap = new Map<string, number>();
    savedOrder.forEach((path, index) => {
      orderMap.set(path, index);
    });

    // Sort: items in saved order first (preserving that order), then unknown items
    // at the end in their original relative order
    children.sort((a, b) => {
      const aPath = a.dataset.path || '';
      const bPath = b.dataset.path || '';
      const aIdx = orderMap.has(aPath) ? orderMap.get(aPath)! : savedOrder.length;
      const bIdx = orderMap.has(bPath) ? orderMap.get(bPath)! : savedOrder.length;
      return aIdx - bIdx;
    });

    // Re-append in sorted order (appendChild moves existing nodes)
    for (let i = 0; i < children.length; i++) {
      this.grid.appendChild(children[i]);
    }
  }

  // ── Existing methods (with M2b modifications) ──

  private listenDesktopFiles(): void {
    const unlisten = events.onDesktopFiles((payload: DesktopChangePayload) => {
      if (payload.is_full) {
        console.log(`[IconBox] Full sync: ${payload.added.length} files from FilePoller`);
        if (payload.added.length > 0) {
          console.log(`[IconBox]   first file: ${payload.added[0].name} @ ${payload.added[0].path}`);
        }
        this.renderFullList(payload.added);
        void this.loadIconOrder();
      } else {
        if (payload.added.length > 0) {
          console.log(`[IconBox] Diff: +${payload.added.length}`, payload.added.map(f => f.name));
        }
        if (payload.removed.length > 0) {
          console.log(`[IconBox] Diff: -${payload.removed.length}`, payload.removed.map(f => f.name));
        }
        this.applyDiff(payload);
      }
    });
    // Store unlisten function with Promise race protection (R5)
    if (unlisten && typeof unlisten.then === 'function') {
      this.unlistenDesktopFilesPromise = unlisten;
      unlisten.then(fn => { this.unlistenDesktopFiles = fn; })
      .catch(err => {
        console.warn('[IconBox] Failed to listen for desktop:files:', err);
      });
    }
  }

  private async loadInitialFiles(): Promise<void> {
    try {
      const files = await api.getDesktopFiles();
      console.log(`[IconBox] Initial load: ${files.length} files via get_desktop_files`);
      if (files.length > 0) {
        console.log(`[IconBox]   first: ${files[0].name} @ ${files[0].path}`);
      }
      this.renderFullList(files);
      // M2b-#4: Apply saved icon order after initial load
      await this.loadIconOrder();
    } catch (err) {
      console.warn('[IconBox] Failed to load initial desktop files:', err);
    }
  }

  private renderFullList(files: FileEntry[]): void {
    if (!this.grid) return;

    // Clear existing
    this.grid.innerHTML = '';
    this.iconCache.clear();
    this.iconDataUrlCache.clear();

    files.forEach(file => {
      const item = this.createIconItem(file);
      this.grid!.appendChild(item);
      this.iconCache.set(file.path, item);
    });

    // M4.5: 异步加载真实图标（不阻塞首次渲染）
    void this.loadIcons(files);
  }

  private applyDiff(payload: DesktopChangePayload): void {
    if (!this.grid) return;

    // Remove deleted items
    payload.removed.forEach(file => {
      const existing = this.iconCache.get(file.path);
      if (existing) {
        existing.remove();
        this.iconCache.delete(file.path);
        // [FIX #6] 同时清理 base64 Data URL 缓存，避免增量更新时残留
        this.iconDataUrlCache.delete(file.path);
      }
    });

    // Add new items
    payload.added.forEach(file => {
      // Avoid duplicates
      if (this.iconCache.has(file.path)) return;
      const item = this.createIconItem(file);
      this.grid!.appendChild(item);
      this.iconCache.set(file.path, item);
    });

    // Update modified items (re-render)
    payload.modified.forEach(file => {
      const existing = this.iconCache.get(file.path);
      if (existing) {
        const newItem = this.createIconItem(file);
        existing.replaceWith(newItem);
        this.iconCache.set(file.path, newItem);
      }
    });

    // R7: 增量更新后重新应用保存的图标排序
    if (payload.added.length > 0 || payload.removed.length > 0) {
      void this.loadIconOrder();
    }
  }

  private createIconItem(file: FileEntry): HTMLElement {
    const item = document.createElement('div');
    item.className = 'icon-item';
    item.dataset.path = file.path;

    // Icon image with data-path for batch icon loading updates
    const img = document.createElement('img');
    img.className = 'icon-img';
    img.src = this.getIconSrc(file);
    img.alt = file.name;
    img.draggable = false;

    // File name label — strip extension for display (desktop-style, hide .lnk/.url etc.)
    const label = document.createElement('span');
    label.className = 'icon-name';
    label.textContent = file.extension
      ? file.name.slice(0, -(file.extension.length + 1))
      : file.name;

    item.appendChild(img);
    item.appendChild(label);

    // Double-click to open
    item.addEventListener('dblclick', () => {
      api.openFile(file.path).catch(err => {
        console.warn(`[IconBox] Failed to open file: ${file.path}`, err);
      });
    });

    // M2b-#2: Pointer down to initiate drag-reorder
    item.addEventListener('pointerdown', (e: PointerEvent) => {
      this.onIconPointerDown(e, item);
    });

    return item;
  }

  private getPlaceholderIcon(file: FileEntry): string {
    const s = this.iconSize;
    if (file.is_dir) {
      return 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32"><rect x="4" y="8" width="24" height="18" rx="2" fill="#FFD54F"/><path d="M4 10 L4 8 L12 8 L14 12 L28 12 L28 28 L4 28 Z" fill="#FFB300"/></svg>`
      );
    }
    // Generic file icon
    return 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32"><path d="M6 4 L20 4 L26 10 L26 28 L6 28 Z" fill="#90CAF9"/><path d="M20 4 L20 10 L26 10 Z" fill="#64B5F6"/></svg>`
    );
  }

  // ── M4.5: Real Icon Loading [REQ-ICON-008] ──

  /** 返回缓存的 data URL 或占位符 */
  private getIconSrc(file: FileEntry): string {
    return this.iconDataUrlCache.get(file.path) ?? this.getPlaceholderIcon(file);
  }

  /** 批量加载真实图标（batch size = 8 控制并发） */
  private async loadIcons(files: FileEntry[]): Promise<void> {
    const batchSize = 8;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(f => this.loadSingleIcon(f)));
    }
  }

  /** 加载单个文件图标并更新 DOM */
  private async loadSingleIcon(file: FileEntry): Promise<void> {
    if (this.iconDataUrlCache.has(file.path)) return;
    try {
      const dataUrl = await api.extractIcon(file.path, this.iconSize);
      this.iconDataUrlCache.set(file.path, dataUrl);
      // 更新已渲染的 DOM
      const imgEl = this.container.querySelector(
        `.icon-item[data-path="${CSS.escape(file.path)}"] .icon-img`
      ) as HTMLImageElement | null;
      if (imgEl) imgEl.src = dataUrl;
    } catch (err) {
      // 保留占位符，静默失败
      console.warn(`[IconBox] Failed to load icon for ${file.name}:`, err);
    }
  }
}
