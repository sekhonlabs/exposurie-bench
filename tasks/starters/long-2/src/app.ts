import express, { type ErrorRequestHandler } from 'express';
import { errorFields, log } from './log';
import { requestLog } from './middleware/requestLog';
import { v2 } from './routes/v2';

const onError: ErrorRequestHandler = (err, req, res, _next) => {
  log.error('request failed', {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    error: errorFields(err),
  });
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(500).json({ error: 'internal_error' });
};

export function createApp() {
  const app = express();
  // Behind the load balancer, so req.ip is the client's address from X-Forwarded-For.
  app.set('trust proxy', 1);
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(requestLog);
  app.use(express.json({ limit: '1mb' }));
  app.use('/v2', v2);
  app.use(onError);
  return app;
}
