export interface KeyedSerialTaskQueue<Key> {
  enqueue(key: Key, task: () => Promise<void>): Promise<void>;
  isPending(key: Key): boolean;
}

/**
 * Runs tasks for the same key in strict submission order while allowing
 * unrelated keys to progress independently.
 */
export function createKeyedSerialTaskQueue<Key>(): KeyedSerialTaskQueue<Key> {
  const tails = new Map<Key, Promise<void>>();

  return {
    enqueue(key, task) {
      const previous = tails.get(key) ?? Promise.resolve();
      const current = previous
        .catch(() => {
          // A failed task must not permanently poison this key's queue.
        })
        .then(task);
      tails.set(key, current);
      return current.finally(() => {
        if (tails.get(key) === current) {
          tails.delete(key);
        }
      });
    },
    isPending(key) {
      return tails.has(key);
    }
  };
}
