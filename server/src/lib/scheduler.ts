/**
 * Minimal in-process scheduler. Jobs are registered in src/jobs/*.ts and started from src/index.ts
 * (never in tests). Each job runs on an interval, never overlaps itself, and a failing run is logged
 * without stopping the others. Jobs must be idempotent (see ReminderLog) because the API can restart.
 */
export interface Job {
  name: string;
  /** interval between runs, in milliseconds */
  everyMs: number;
  /** delay before the first run (default 60 s, so a deploy settles first) */
  firstRunAfterMs?: number;
  run: () => Promise<void>;
}

const jobs: Job[] = [];

export const registerJob = (job: Job) => {
  jobs.push(job);
};

export const startScheduler = () => {
  const timers: NodeJS.Timeout[] = [];
  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        console.error(`[job:${job.name}] failed`, err);
      } finally {
        running = false;
      }
    };
    const first = setTimeout(() => {
      void tick();
      const t = setInterval(() => void tick(), job.everyMs);
      t.unref();
      timers.push(t);
    }, job.firstRunAfterMs ?? 60_000);
    first.unref();
    timers.push(first);
  }
  return () => timers.forEach((t) => clearTimeout(t));
};

export const registeredJobs = () => jobs.map((j) => j.name);
