import Fastify, { type FastifyInstance } from 'fastify';

import type { Konfiguration } from '@knipsa/shared';

import { baueDatenbank } from './db/datenbank.js';
import { registriereHealthRouten, standardPruefungen, type Pruefungen } from './health.js';

export interface AppOptionen {
  readonly konfig: Konfiguration;
  /** Fastify-Logger an/aus; in Tests aus. */
  readonly logger?: boolean;
  /**
   * Pruefungen fuer `/health/ready`. Ohne Angabe wird gegen die echte
   * Datenbank und den eingebundenen Foto-Baum geprueft.
   */
  readonly pruefungen?: Pruefungen;
}

/**
 * Baut die Fastify-Anwendung mit den Health-Routen. Der Viewer wird in der
 * naechsten Etappe als statische Dateien dazugelegt.
 */
export function baueApp({ konfig, logger = false, pruefungen }: AppOptionen): FastifyInstance {
  const app = Fastify({ logger });

  app.decorate('knipsaKonfiguration', konfig);

  if (pruefungen === undefined) {
    const db = baueDatenbank({ databaseUrl: konfig.databaseUrl });
    app.addHook('onClose', async () => {
      await db.destroy();
    });
    registriereHealthRouten(app, standardPruefungen(db, konfig.fotosPfad));
  } else {
    registriereHealthRouten(app, pruefungen);
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    knipsaKonfiguration: Konfiguration;
  }
}
