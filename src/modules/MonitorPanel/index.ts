import { ModuleDescriptor } from '../../core/ModuleManager';
import { MonitorPanel } from './MonitorPanel';

export const MonitorPanelDescriptor: ModuleDescriptor = {
  id: 'monitor',
  title: '资源监控',
  defaultState: {
    position: { x: 100, y: 100 },
    size: { width: 340, height: 260 },
  },
  create: () => new MonitorPanel(),
};
