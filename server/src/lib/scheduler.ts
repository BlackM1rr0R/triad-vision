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

/** Gap between jobs that share the same nominal first-run delay. */
export const FIRST_RUN_SPACING_MS = 7_000;
const DEFAULT_FIRST_RUN_MS = 60_000;

/**
 * Pure: the actual first-run delay of each job. Jobs asking for the same delay (most use the 60 s default, several
 * 3 / 4 / 5 min) are spread FIRST_RUN_SPACING_MS apart in registration order, so a deploy on the small server does not
 * start a dozen scans in the same second. Later runs keep their interval from that first run, so they stay spread too.
 */
export const firstRunDelays = (list: Pick<Job, 'firstRunAfterMs'>[], spacingMs = FIRST_RUN_SPACING_MS): number[] => {
  const seen = new Map<number, number>();
  return list.map((job) => {
    const base = job.firstRunAfterMs ?? DEFAULT_FIRST_RUN_MS;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return base + n * spacingMs;
  });
};

export const startScheduler = () => {
  const timers: NodeJS.Timeout[] = [];
  const delays = firstRunDelays(jobs);
  for (const [index, job] of jobs.entries()) {
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
    }, delays[index]);
    first.unref();
    timers.push(first);
  }
  return () => timers.forEach((t) => clearTimeout(t));
};

export const registeredJobs = () => jobs.map((j) => j.name);
