import { appState } from '../../core/StateManager';

/**
 * Search/filter input for the process list.
 * Updates appState.searchQuery reactively on each input event.
 */
export class ProcessFilter {
  private el: HTMLElement;
  private inputEl: HTMLInputElement;
  private handleInput: () => void;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'process-filter';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = '搜索进程...';
    this.inputEl.className = 'process-search-input';

    this.handleInput = () => {
      appState.searchQuery.value = this.inputEl.value;
    };
    this.inputEl.addEventListener('input', this.handleInput);

    this.el.appendChild(this.inputEl);
    container.appendChild(this.el);
  }

  destroy(): void {
    this.inputEl.removeEventListener('input', this.handleInput);
    this.el.remove();
  }
}
