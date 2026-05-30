// DesktopView Component
// Displays desktop icons within the main content area

export class DesktopView {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    if (!this.container) return;
    console.log("[DesktopView] Initialized");
  }

  /** Update the list of icons displayed */
  updateIcons(icons: Array<{ name: string; path: string }>): void {
    // Placeholder for icon rendering
    console.log(`[DesktopView] Received ${icons.length} icons`);
  }
}
