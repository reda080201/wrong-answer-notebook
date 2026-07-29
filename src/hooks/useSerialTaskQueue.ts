import { useCallback, useState } from "react";

export interface SerialTaskQueue {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  drain(): Promise<void>;
}

export function createSerialTaskQueue(): SerialTaskQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const operation = tail.then(task);
      tail = operation.then(() => undefined, () => undefined);
      return operation;
    },
    drain(): Promise<void> {
      return tail;
    },
  };
}

export function useSerialTaskQueue(): SerialTaskQueue {
  const [queue] = useState(createSerialTaskQueue);
  const enqueue = useCallback(<T,>(task: () => Promise<T>) => queue.enqueue(task), [queue]);
  const drain = useCallback(() => queue.drain(), [queue]);
  return { enqueue, drain };
}
