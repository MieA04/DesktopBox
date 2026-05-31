import { ModuleDescriptor } from '../../core/ModuleManager';
import { DemoModule } from './DemoModule';
import { DEFAULT } from '../../utils/constants';

export const DemoModuleDescriptor: ModuleDescriptor = {
  id: 'demo',
  title: 'Demo Module',
  defaultState: {
    position: { x: (window.innerWidth - DEFAULT.MODULE.WIDTH) / 2, y: (window.innerHeight - DEFAULT.MODULE.HEIGHT) / 2 },
    size: { width: DEFAULT.MODULE.WIDTH, height: DEFAULT.MODULE.HEIGHT },
  },
  create: () => new DemoModule(),
};
