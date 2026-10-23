import { initialize, type Unleash } from 'unleash-client';
import { config } from './config';
import { log } from './log';

let unleash: Unleash | undefined;

function client(): Unleash {
  unleash ??= initialize({
    url: config.unleashUrl,
    appName: 'tidewell-api',
    customHeaders: { Authorization: config.unleashApiToken },
  });
  return unleash;
}

/**
 * Is the flag on for this organisation? Unleash's strategies see the
 * organisation as the context field `organizationId`.
 */
export function isEnabled(flag: string, organizationId: string): boolean {
  const on = client().isEnabled(flag, { properties: { organizationId } });
  log.debug('flag', { flag, organizationId, on });
  return on;
}
