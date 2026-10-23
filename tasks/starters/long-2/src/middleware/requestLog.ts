import type { RequestHandler } from 'express';
import { log } from '../log';

/** One line per request, once it has finished. */
export const requestLog: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const apiKey = res.locals.apiKey as { organizationId: string; prefix: string } | undefined;
    log.info('request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      org: apiKey?.organizationId ?? null,
      key: apiKey?.prefix ?? null,
      ua: req.get('user-agent') ?? null,
      ip: req.ip,
    });
  });
  next();
};
