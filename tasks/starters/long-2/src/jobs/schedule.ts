import { prisma } from '../db/client';

/** The nightly jobs, each with its time of day in UTC. */
export const NIGHTLY: { kind: string; at: string }[] = [{ kind: 'purge_expired_invites', at: '02:30' }];

/** Enqueue today's row for every nightly job that is due and doesn't have one yet. */
export async function enqueueDue(now: Date) {
  for (const { kind, at } of NIGHTLY) {
    const [hours, minutes] = at.split(':').map(Number);
    const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes));
    if (now < due) continue;
    const dedupeKey = `${kind}:${due.toISOString().slice(0, 10)}`;
    await prisma.job.upsert({
      where: { dedupeKey },
      create: { kind, runAt: due, dedupeKey },
      update: {},
    });
  }
}
