export class MetricCard {
  private el: HTMLElement;
  private labelEl: HTMLElement;
  private valueEl: HTMLElement;
  private unitEl: HTMLElement;

  constructor(container: HTMLElement, label: string, unit: string) {
    this.el = document.createElement('div');
    this.el.className = 'metric-card';

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'metric-label';
    this.labelEl.textContent = label;

    const valueRow = document.createElement('div');
    valueRow.className = 'metric-value-row';

    this.valueEl = document.createElement('span');
    this.valueEl.className = 'metric-value';
    this.valueEl.textContent = '--';

    this.unitEl = document.createElement('span');
    this.unitEl.className = 'metric-unit';
    this.unitEl.textContent = unit;

    valueRow.appendChild(this.valueEl);
    valueRow.appendChild(this.unitEl);
    this.el.appendChild(this.labelEl);
    this.el.appendChild(valueRow);
    container.appendChild(this.el);
  }

  setValue(value: string): void {
    this.valueEl.textContent = value;
  }
}
