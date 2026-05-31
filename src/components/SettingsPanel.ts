/**
 * SettingsPanel — 模块设置浮动面板
 *
 * 包含两个 Slider：
 *   - 模糊强度 (0-50, step=1)
 *   - 底色透明度 (0.0-1.0, step=0.05)
 *
 * 拖动滑块时实时调用 module.setBlurStrength() / module.setBgOpacity()，
 * 松开时 emit 'settings:changed' 事件。
 * 面板外部点击自动关闭。
 */

import { Slider } from './Slider';
import { eventBus } from '../core/EventBus';
import { ModuleBase } from '../core/ModuleBase';

export class SettingsPanel {
  private el: HTMLElement;
  private module: ModuleBase;
  private blurSlider: Slider;
  private opacitySlider: Slider;
  private onClose: () => void;

  /** 外部 pointerdown 监听，用于自动关闭 */
  private handleExternalPointerDown: (e: PointerEvent) => void;

  constructor(container: HTMLElement, module: ModuleBase, onClose: () => void) {
    this.module = module;
    this.onClose = onClose;

    this.el = document.createElement('div');
    this.el.className = 'settings-panel';

    const state = this.module.getState();

    this.blurSlider = new Slider(this.el, {
      min: 0,
      max: 50,
      step: 1,
      value: state.blurStrength,
      label: '模糊强度',
      onInput: (v) => this.module.setBlurStrength(v),
      onChange: (v) => eventBus.emit('settings:changed', { key: 'blurStrength', value: v }),
    });

    this.opacitySlider = new Slider(this.el, {
      min: 0,
      max: 1.0,
      step: 0.05,
      value: state.opacity,
      label: '透明度',
      onInput: (v) => this.module.setBgOpacity(v),
      onChange: (v) => eventBus.emit('settings:changed', { key: 'opacity', value: v }),
    });

    container.appendChild(this.el);

    // 外部点击自动关闭（使用 setTimeout 避免当前点击立即关闭）
    this.handleExternalPointerDown = (e: PointerEvent) => {
      if (!this.el.contains(e.target as Node)) {
        this.close();
      }
    };
    setTimeout(() => {
      document.addEventListener('pointerdown', this.handleExternalPointerDown);
    }, 0);
  }

  /** 主动关闭面板（如齿轮再次点击） */
  close(): void {
    document.removeEventListener('pointerdown', this.handleExternalPointerDown);
    this.blurSlider.destroy();
    this.opacitySlider.destroy();
    this.el.remove();
    this.onClose();
  }
}
