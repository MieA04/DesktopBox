/**
 * Slider — 跨模块公用滑块组件
 *
 * 使用说明：
 * ```ts
 * const slider = new Slider(container, {
 *   min: 0, max: 50, step: 1, value: 20,
 *   label: '模糊强度',
 *   onInput: (v) => module.setBlurStrength(v),
 *   onChange: (v) => eventBus.emit('settings:changed', { key: 'blurStrength', value: v }),
 * });
 * ```
 */

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  label: string;
  onInput: (value: number) => void;
  onChange: (value: number) => void;
}

export class Slider {
  private container: HTMLElement;
  private inputEl: HTMLInputElement;
  private valueEl: HTMLElement;
  private options: SliderOptions;
  private wrapperEl: HTMLElement;

  constructor(container: HTMLElement, options: SliderOptions) {
    this.options = options;
    this.container = container;

    // Outer wrapper
    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'slider-container';

    // Label
    const labelEl = document.createElement('label');
    labelEl.className = 'slider-label';
    labelEl.textContent = this.options.label;

    // Controls row
    const controls = document.createElement('div');
    controls.className = 'slider-controls';

    // Range input
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'range';
    this.inputEl.min = String(this.options.min);
    this.inputEl.max = String(this.options.max);
    this.inputEl.step = String(this.options.step);
    this.inputEl.value = String(this.options.value);
    this.inputEl.className = 'slider-input';

    // Value display
    this.valueEl = document.createElement('span');
    this.valueEl.className = 'slider-value';
    this.valueEl.textContent = String(this.options.value);

    // Bind events
    this.inputEl.addEventListener('input', () => {
      const val = parseFloat(this.inputEl.value);
      this.valueEl.textContent = String(val);
      this.options.onInput(val);
    });

    this.inputEl.addEventListener('change', () => {
      const val = parseFloat(this.inputEl.value);
      this.options.onChange(val);
    });

    // Assemble
    controls.appendChild(this.inputEl);
    controls.appendChild(this.valueEl);
    this.wrapperEl.appendChild(labelEl);
    this.wrapperEl.appendChild(controls);
    this.container.appendChild(this.wrapperEl);
  }

  /** Programmatically update the slider value without triggering callbacks */
  setValue(value: number): void {
    this.inputEl.value = String(value);
    this.valueEl.textContent = String(value);
  }

  /** Remove DOM elements and clean up */
  destroy(): void {
    this.wrapperEl.remove();
  }
}
