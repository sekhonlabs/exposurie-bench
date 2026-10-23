import { createApp } from './app';
import { config } from './config';
import { log } from './log';

createApp().listen(config.port, () => {
  log.info('api listening', { port: config.port });
});
