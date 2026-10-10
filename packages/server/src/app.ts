import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';

import { ImportDienst } from '@knipsa/pipeline';
import type { Konfiguration } from '@knipsa/shared';

import { baueDatenbank, type Datenbank } from './db/datenbank.js';
import { registriereHealthRouten, standardPruefungen, type Pruefungen } from './health.js';
import { registriereImportRouten } from './import.js';
import { registriereViewer, viewerVerzeichnis } from './viewer.js';

export interface AppOptionen {
  readonly konfig: Konfiguration;
  /** Fastify-Logger an/aus; in Tests aus. */
  readonly logger?: boolean;
  /**
   * Datenbank-Zugang. Ohne Angabe baut die App einen eigenen auf und
   * schliesst ihn beim Beenden wieder.
   */
  readonly db?: Kysely<Datenbank>;
  /**
   * Pruefungen fuer `/health/ready`. Ohne Angabe wird gegen die echte
   * Datenbank und den eingebundenen Foto-Baum geprueft.
   */
  readonly pruefungen?: Pruefungen;
  /** Verzeichnis mit dem gebauten Viewer. */
  readonly viewer?: string;
  /**
   * Import-Dienst. Ohne Angabe wird er aus der Konfiguration gebaut:
   * Quellen aus `IMPORT_QUELLEN`, Foto-Baum aus `FOTOS_PFAD`.
   */
  readonly importDienst?: ImportDienst;
}

/**
 * Baut die Fastify-Anwendung: Health-Routen, die Umgebungs-Auskunft fuer
 * den Viewer und den gebauten Viewer als statische Dateien.
 */
export function baueApp({
  konfig,
  logger = false,
  db,
  pruefungen,
  viewer = viewerVerzeichnis(),
  importDienst,
}: AppOptionen): FastifyInstance {
  const app = Fastify({ logger });

  app.decorate('knipsaKonfiguration', konfig);

  registriereHealthRouten(app, pruefungen ?? baueStandardPruefungen(app, konfig, db));
  registriereImportRouten(app, importDienst ?? baueImportDienst(app, konfig));

  // Der Viewer wird fuer dev und prod gleich gebaut; welche Umgebung er
  // anzeigt, erfaehrt er erst hier. Nur die Umgebung, nichts weiter.
  app.get('/api/umgebung', async (_anfrage, antwort) => {
    return antwort.header('cache-control', 'no-store').send({ umgebung: konfig.umgebung });
  });

  registriereViewer(app, viewer);

  return app;
}

function baueImportDienst(app: FastifyInstance, konfig: Konfiguration): ImportDienst {
  return new ImportDienst({
    wurzel: konfig.fotosPfad,
    quellen: konfig.importQuellen,
    datentraegerPfad: konfig.datentraegerPfad,
    // Nur Quelle und Meldung ins Log, nie ein Pfad aus dem Foto-Baum.
    meldeFehler: (fehler) => {
      app.log.error({ fehler: fehler.message }, 'Import abgebrochen');
    },
  });
}

function baueStandardPruefungen(
  app: FastifyInstance,
  konfig: Konfiguration,
  db: Kysely<Datenbank> | undefined,
): Pruefungen {
  if (db !== undefined) {
    return standardPruefungen(db, konfig.fotosPfad);
  }

  const eigene = baueDatenbank({ databaseUrl: konfig.databaseUrl });
  app.addHook('onClose', async () => {
    await eigene.destroy();
  });

  return standardPruefungen(eigene, konfig.fotosPfad);
}

declare module 'fastify' {
  interface FastifyInstance {
    knipsaKonfiguration: Konfiguration;
  }
}
