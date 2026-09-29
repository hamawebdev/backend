import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Server-Timing header on API responses: total time in the API ("app") plus
 * any phases a handler records (e.g. the database reads of a session). It shows
 * from outside whether a slow response is the database, the API or the network.
 */
interface RequestTimings {
  start: bigint;
  marks: Array<[string, number]>;
}

const storage = new AsyncLocalStorage<RequestTimings>();

/** Records a named phase of the current request (no-op outside a request) */
export function addServerTiming(name: string, durationMs: number): void {
  storage.getStore()?.marks.push([name, durationMs]);
}

/** Runs `work` and records how long it took under `name` */
export async function timed<T>(name: string, work: Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await work;
  } finally {
    addServerTiming(name, performance.now() - start);
  }
}

export function serverTiming(_req: Request, res: Response, next: NextFunction): void {
  const timings: RequestTimings = { start: process.hrtime.bigint(), marks: [] };
  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: any[]) {
    if (!res.headersSent) {
      const appMs = Number(process.hrtime.bigint() - timings.start) / 1e6;
      const parts = [`app;dur=${appMs.toFixed(1)}`, ...timings.marks.map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)];
      res.setHeader("Server-Timing", parts.join(", "));
    }
    return (writeHead as any).apply(this, args);
  } as any;
  storage.run(timings, next);
}
