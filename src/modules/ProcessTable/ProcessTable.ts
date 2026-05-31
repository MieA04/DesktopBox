import { ModuleBase } from '../../core/ModuleBase';
import { dragEngine } from '../../core/DragEngine';
import { moduleManager } from '../../core/ModuleManager';
import { appState } from '../../core/StateManager';
import { events, ProcessInfo } from '../../utils/tauriApi';
import { SettingsPanel } from '../../components/SettingsPanel';
import { ProcessFilter } from './ProcessFilter';
import './styles.css';

/** Format bytes to human-readable memory string */
function formatMemory(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Column definitions for the process table */
interface ColumnDef {
  key: string;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'pid', label: 'PID' },
  { key: 'cpu', label: 'CPU%' },
  { key: 'memory', label: 'Memory' },
];

export class ProcessTable extends ModuleBase {
  private filter: ProcessFilter | null = null;
  private tbody: HTMLElement | null = null;
  private headerRow: HTMLElement | null = null;
  private settingsPanel: SettingsPanel | null = null;

  // Signal subscription for reactive row rendering
  private unsubFilteredProcesses: (() => void) | null = null;
  // Event listener lifecycle (follows IconBox pattern for Promise-based listen)
  private unlistenProcesses: (() => void) | null = null;
  private unlistenProcessesPromise: Promise<() => void> | null = null;

  constructor() {
    super('process', '进程列表', {
      position: { x: 500, y: 100 },
      size: { width: 420, height: 360 },
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

    // Subscribe to filteredProcesses computed signal for reactive row updates
    this.unsubFilteredProcesses = appState.filteredProcesses.subscribe((list) => {
      this.renderRows(list);
    });

    // Listen for system:processes events from Tauri backend
    this.listenSystemProcesses();
  }

  protected onSettingsClick(): void {
    if (!this.settingsPanel) {
      this.settingsPanel = new SettingsPanel(this.container, this, () => {
        this.settingsPanel = null;
      });
    } else {
      this.settingsPanel.close();
      this.settingsPanel = null;
    }
  }

  destroy(): void {
    // Close settings panel if open
    this.settingsPanel?.close();
    this.settingsPanel = null;

    // Clean up ProcessFilter
    this.filter?.destroy();

    // Clean up signal subscription
    if (this.unsubFilteredProcesses) {
      this.unsubFilteredProcesses();
      this.unsubFilteredProcesses = null;
    }

    // Unlisten system:processes event (with race protection)
    if (this.unlistenProcesses) {
      this.unlistenProcesses();
      this.unlistenProcesses = null;
    } else if (this.unlistenProcessesPromise) {
      this.unlistenProcessesPromise.then(fn => fn()).catch(() => {});
    }

    // Clean up all registered DOM event listeners
    this.cleanupHandlers();
  }

  protected renderContent(): void {
    // Process filter (search input)
    this.filter = new ProcessFilter(this.contentArea);

    // Table wrapper for scrollable content
    const wrapper = document.createElement('div');
    wrapper.className = 'process-table-wrapper';

    const table = document.createElement('table');
    table.className = 'process-table';

    // Table header
    const thead = document.createElement('thead');
    this.headerRow = document.createElement('tr');
    this.headerRow.className = 'process-header';

    COLUMNS.forEach(col => {
      const th = document.createElement('th');
      th.dataset.col = col.key;
      th.textContent = col.label;
      th.addEventListener('click', () => this.handleSort(col.key));
      this.headerRow!.appendChild(th);
    });

    thead.appendChild(this.headerRow);
    table.appendChild(thead);

    // Table body
    this.tbody = document.createElement('tbody');
    table.appendChild(this.tbody);

    wrapper.appendChild(table);
    this.contentArea.appendChild(wrapper);
  }

  // ── Private ──

  private listenSystemProcesses(): void {
    const unlisten = events.onProcessList((processes) => {
      appState.processList.value = processes;
    });
    if (unlisten && typeof unlisten.then === 'function') {
      this.unlistenProcessesPromise = unlisten;
      unlisten.then(fn => { this.unlistenProcesses = fn; })
        .catch(err => {
          console.warn('[ProcessTable] Failed to listen system:processes:', err);
        });
    }
  }

  private handleSort(column: string): void {
    if (appState.sortColumn.value === column) {
      // Toggle sort direction
      appState.sortDirection.value = appState.sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
      appState.sortColumn.value = column;
      appState.sortDirection.value = 'asc';
    }
    this.updateHeaderIndicators();
  }

  private updateHeaderIndicators(): void {
    if (!this.headerRow) return;
    const headers = this.headerRow.querySelectorAll<HTMLElement>('th');
    headers.forEach(th => {
      const col = th.dataset.col;
      th.classList.remove('sorted-asc', 'sorted-desc');
      th.removeAttribute('data-arrow');
      if (col && col === appState.sortColumn.value) {
        const dir = appState.sortDirection.value;
        th.classList.add(`sorted-${dir}`);
        th.dataset.arrow = dir === 'asc' ? '▲' : '▼';
      }
    });
  }

  private renderRows(processes: ProcessInfo[]): void {
    if (!this.tbody) return;
    this.tbody.innerHTML = '';

    processes.forEach(proc => {
      const row = document.createElement('tr');
      row.className = 'process-row';

      const nameCell = document.createElement('td');
      nameCell.textContent = proc.name;

      const pidCell = document.createElement('td');
      pidCell.textContent = String(proc.pid);

      const cpuCell = document.createElement('td');
      cpuCell.textContent = proc.cpu_usage.toFixed(1) + '%';

      const memCell = document.createElement('td');
      memCell.textContent = formatMemory(proc.memory_usage);

      row.appendChild(nameCell);
      row.appendChild(pidCell);
      row.appendChild(cpuCell);
      row.appendChild(memCell);

      this.tbody!.appendChild(row);
    });
  }
}
