'use strict';

/**
 * Runs `worker(task)` with `size` workers, each pulling the next task from `next()`
 * (null or undefined: nothing left) until none is left, `shouldStop()` is true or a
 * worker threw. Tasks start in the order next() hands them out. Waits for the tasks
 * already running, then rethrows the first error.
 */
async function runPool({ size, next, worker, shouldStop = () => false }) {
  let failure = null;
  const loop = async () => {
    for (;;) {
      if (failure || shouldStop()) return;
      const task = next();
      if (task === null || task === undefined) return;
      try {
        await worker(task);
      } catch (error) {
        if (!failure) failure = error;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.floor(size) || 1) }, loop));
  if (failure) throw failure;
}

/** next() over a list */
function fromList(list) {
  let index = 0;
  return () => (index < list.length ? list[index++] : null);
}

module.exports = { runPool, fromList };
