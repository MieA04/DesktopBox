import { ModuleDescriptor } from '../../core/ModuleManager';
import { TerminalView } from './TerminalView';

export const TerminalDescriptor: ModuleDescriptor = {
  id: 'terminal',
  title: '终端',
  defaultState: {
    position: { x: 100, y: 400 },
    size: { width: 640, height: 400 },
  },
  create: () => new TerminalView(),
};
