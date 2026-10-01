// App-wide events: transaction lifecycle and incoming account activity.

export interface TxEvent {
  hash: string;
  type: string;
  message?: string;
}

export interface EventMap {
  txSubmitted: TxEvent;
  txSuccess: TxEvent;
  txFail: TxEvent;
  /** A transaction affecting the open account (from the subscription stream). */
  accountTx: unknown;
}

type Handler<T> = (payload: T) => void;

const handlers: Partial<Record<keyof EventMap, Set<Handler<never>>>> = {};

export function on<K extends keyof EventMap>(name: K, handler: Handler<EventMap[K]>): () => void {
  const set = (handlers[name] ??= new Set()) as Set<Handler<EventMap[K]>>;
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

export function emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
  (handlers[name] as Set<Handler<EventMap[K]>> | undefined)?.forEach(h => {
    try {
      h(payload);
    } catch (e) {
      console.error(`${name} handler failed`, e);
    }
  });
}
