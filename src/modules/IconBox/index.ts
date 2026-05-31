import { ModuleDescriptor } from '../../core/ModuleManager';
import { IconBox } from './IconBox';

export const IconBoxDescriptor: ModuleDescriptor = {
  id: 'icon-box',
  title: '图标收纳盒',
  defaultState: {
    position: { x: window.innerWidth - 520, y: 60 },
    size: { width: 480, height: 400 },
    opacity: 0.6,
    blurStrength: 20,
  },
  create: () => new IconBox(),
};
