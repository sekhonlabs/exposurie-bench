import type { Job, Prisma } from '@prisma/client';
import { prisma } from '../db/client';

/** A row claimed longer ago than this counts as abandoned by a worker that died, and can be claimed again. */
export const LOCK_MS = 60_000;

/** The fifth failure gives up. */
export const MAX_ATTEMPTS = 5;

export async function enqueue(kind: string, payload: Prisma.InputJsonValue, runAt = new Date()) {
  return prisma.job.create({ data: { kind, payload, runAt } });
}

/**
 * Claim the due job with the earliest run_at. Prisma has no SKIP LOCKED, so a
 * claim is a conditional update on locked_at: when two workers race for the
 * same row, only one update matches it, and the other looks again.
 */
export async function claimNext(worker: string, now = new Date()): Promise<Job | null> {
  const abandoned = new Date(now.getTime() - LOCK_MS);
  for (let i = 0; i < 3; i += 1) {
    const due = await prisma.job.findFirst({
      where: {
        doneAt: null,
        failedAt: null,
        runAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: abandoned } }],
      },
      orderBy: [{ runAt: 'asc' }, { id: 'asc' }],
    });
    if (!due) return null;
    const { count } = await prisma.job.updateMany({
      where: { id: due.id, lockedAt: due.lockedAt },
      data: { lockedAt: now, lockedBy: worker, attempts: { increment: 1 } },
    });
    if (count === 1) return { ...due, lockedAt: now, lockedBy: worker, attempts: due.attempts + 1 };
  }
  return null;
}

export async function complete(job: Job) {
  await prisma.job.update({
    where: { id: job.id },
    data: { doneAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

/**
 * Put a failed job back with a backoff of 1, 2, 4 and 8 minutes, or give up
 * on the fifth failure. Returns whether it gave up.
 */
export async function retryOrGiveUp(job: Job, err: unknown): Promise<boolean> {
  const lastError = err instanceof Error ? err.message : String(err);
  const gaveUp = job.attempts >= MAX_ATTEMPTS;
  const now = Date.now();
  await prisma.job.update({
    where: { id: job.id },
    data: gaveUp
      ? { failedAt: new Date(now), lastError, lockedAt: null, lockedBy: null }
      : { runAt: new Date(now + 2 ** (job.attempts - 1) * 60_000), lastError, lockedAt: null, lockedBy: null },
  });
  return gaveUp;
}
