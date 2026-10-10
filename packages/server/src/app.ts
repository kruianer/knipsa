import Fastify, { type FastifyInstance } from 'fastify';

import type { Konfiguration } from '@knipsa/shared';

export interface AppOptionen {
  readonly konfig: Konfiguration;
  /** Fastify-Logger an/aus; in Tests aus. */
  readonly logger?: boolean;
}

/**
 * Baut die Fastify-Anwendung. Routen kommen in den folgenden Etappen
 * dieses Requirements dazu (Health, Viewer).
 */
export function baueApp({ konfig, logger = false }: AppOptionen): FastifyInstance {
  const app = Fastify({ logger });

  app.decorate('knipsaKonfiguration', konfig);

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    knipsaKonfiguration: Konfiguration;
  }
}
