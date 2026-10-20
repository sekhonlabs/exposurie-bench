import express, { type ErrorRequestHandler } from 'express';
import { v2 } from './routes/v2';

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.status(500).json({ error: 'internal_error' });
};

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/v2', v2);
  app.use(onError);
  return app;
}
