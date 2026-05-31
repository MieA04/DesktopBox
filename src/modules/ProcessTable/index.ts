import { ModuleDescriptor } from '../../core/ModuleManager';
import { ProcessTable } from './ProcessTable';

export const ProcessTableDescriptor: ModuleDescriptor = {
  id: 'process',
  title: '进程列表',
  defaultState: {
    position: { x: 500, y: 100 },
    size: { width: 420, height: 360 },
  },
  create: () => new ProcessTable(),
};
