// MonitorPanel Component
// Real-time system resource monitoring display

export class MonitorPanel {
  private cpuEl: HTMLElement | null;
  private memEl: HTMLElement | null;

  constructor() {
    this.cpuEl = document.getElementById("cpu-usage");
    this.memEl = document.getElementById("mem-usage");
  }

  /** Update the displayed CPU/memory values */
  update(cpuPercent: number, memPercent: number): void {
    if (this.cpuEl) {
      this.cpuEl.textContent = `${Math.round(cpuPercent)}%`;
    }
    if (this.memEl) {
      this.memEl.textContent = `${Math.round(memPercent)}%`;
    }
  }
}
