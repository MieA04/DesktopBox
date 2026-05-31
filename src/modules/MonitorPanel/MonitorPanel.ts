import { ModuleBase } from '../../core/ModuleBase';
import { dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { appState } from '../../core/StateManager';
import { events, SystemStats } from '../../utils/tauriApi';
import { MetricCard } from './MetricCard';
import './styles.css';

/** Format memory bytes to human-readable string (GB / MB) */
function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2);
  }
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Format uptime seconds to HH:MM:SS */
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

export class MonitorPanel extends ModuleBase {
  private grid: HTMLElement | null = null;
  private cpuCard: MetricCard | null = null;
  private gpuCard: MetricCard | null = null;
  private memoryCard: MetricCard | null = null;
  private timeCard: MetricCard | null = null;

  // Signal subscription for reactive updates
  private unsubStats: (() => void) | null = null;
  // Event listener lifecycle (follows IconBox pattern for Promise-based listen)
  private unlistenStats: (() => void) | null = null;
  private unlistenStatsPromise: Promise<() => void> | null = null;
  // Independent time interval
  private timeInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super('monitor', '资源监控', {
      position: { x: 100, y: 100 },
      size: { width: 340, height: 260 },
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

    // Subscribe to systemStats signal for reactive card updates
    this.unsubStats = appState.systemStats.subscribe((stats) => {
      if (stats) this.updateCards(stats);
    });

    // Listen for system:stats events from Tauri backend
    this.listenSystemStats();

    // Start independent time interval
    this.timeInterval = setInterval(() => {
      this.updateTimeCard();
    }, 1000);
  }

  destroy(): void {
    // Clean up signal subscription
    if (this.unsubStats) {
      this.unsubStats();
      this.unsubStats = null;
    }

    // Clean up time interval
    if (this.timeInterval !== null) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }

    // Unlisten system:stats event (with race protection)
    if (this.unlistenStats) {
      this.unlistenStats();
      this.unlistenStats = null;
    } else if (this.unlistenStatsPromise) {
      this.unlistenStatsPromise.then(fn => fn()).catch(() => {});
    }

    // Clean up all registered DOM event listeners
    this.cleanupHandlers();
  }

  protected renderContent(): void {
    this.grid = document.createElement('div');
    this.grid.className = 'monitor-grid';
    this.contentArea.appendChild(this.grid);

    this.cpuCard = new MetricCard(this.grid, 'CPU', '%');
    this.gpuCard = new MetricCard(this.grid, 'GPU', '%');
    this.memoryCard = new MetricCard(this.grid, '内存', '');
    this.timeCard = new MetricCard(this.grid, '运行时间', '');
  }

  // ── Private ──

  private listenSystemStats(): void {
    const unlisten = events.onSystemStats((stats) => {
      appState.systemStats.value = stats;
    });
    if (unlisten && typeof unlisten.then === 'function') {
      this.unlistenStatsPromise = unlisten;
      unlisten.then(fn => { this.unlistenStats = fn; })
        .catch(err => {
          console.warn('[MonitorPanel] Failed to listen system:stats:', err);
        });
    }
  }

  private updateCards(stats: SystemStats): void {
    // CPU card
    this.cpuCard?.setValue(stats.cpu_usage.toFixed(1));

    // GPU card
    if (stats.gpu_usage !== null) {
      this.gpuCard?.setValue(stats.gpu_usage.toFixed(1));
    } else {
      this.gpuCard?.setValue('N/A');
    }

    // Memory card
    const used = formatMemory(stats.memory_used);
    const total = formatMemory(stats.memory_total);
    const memUnit = stats.memory_total >= 1024 * 1024 * 1024 ? 'GB' : 'MB';
    this.memoryCard?.setValue(`${used} / ${total} ${memUnit}`);
  }

  private updateTimeCard(): void {
    const now = new Date();
    this.timeCard?.setValue(formatTime(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()));
  }
}
