interface EventMap {
  'layout:changed': [];
  'modules:initialized': [];
  'module:focus': [payload: { id: string }];
  'module:blur': [payload: { id: string }];
  'module:drag-start': [payload: { id: string }];
  'module:drag-end': [payload: { id: string }];
  // M3 预留
  'system:stats-update': [payload: unknown];
  'settings:changed': [payload: { key: string; value: unknown }];
  'app:before-quit': [];
}

class EventBus {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  on<E extends keyof EventMap>(event: E, handler: (...args: EventMap[E]) => void): void {
    if (!this.listeners.has(event as string)) {
      this.listeners.set(event as string, new Set());
    }
    this.listeners.get(event as string)!.add(handler as (...args: any[]) => void);
  }

  off<E extends keyof EventMap>(event: E, handler: (...args: EventMap[E]) => void): void {
    this.listeners.get(event as string)?.delete(handler as (...args: any[]) => void);
  }

  emit<E extends keyof EventMap>(event: E, ...payload: EventMap[E]): void {
    this.listeners.get(event as string)?.forEach(handler => {
      handler(...payload);
    });
  }

  once<E extends keyof EventMap>(event: E, handler: (...args: EventMap[E]) => void): void {
    const wrapper = (...args: EventMap[E]) => {
      handler(...args);
      this.off(event, wrapper as any);
    };
    this.on(event, wrapper as any);
  }
}

export const eventBus = new EventBus();
