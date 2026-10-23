import { hostname } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { handlers } from './jobs/handlers';
import { claimNext, complete, retryOrGiveUp } from './jobs/queue';
import { enqueueDue } from './jobs/schedule';
import { errorFields, log } from './log';

/** How long a worker waits before polling again when nothing is due. */
const IDLE_MS = 2_000;

async function main() {
  const worker = `${hostname()}:${process.pid}`;
  log.info('worker started', { worker });
  for (;;) {
    await enqueueDue(new Date());
    const job = await claimNext(worker);
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    log.info('job claimed', { id: job.id, kind: job.kind, attempts: job.attempts });
    const started = Date.now();
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`no handler for ${job.kind}`);
      await handler(job);
      await complete(job);
      log.info('job done', { id: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (err) {
      const gaveUp = await retryOrGiveUp(job, err);
      log.error('job failed', {
        id: job.id,
        kind: job.kind,
        attempts: job.attempts,
        gave_up: gaveUp,
        error: errorFields(err),
      });
    }
  }
}

main().catch((err) => {
  log.error('worker crashed', { error: errorFields(err) });
  process.exit(1);
});
