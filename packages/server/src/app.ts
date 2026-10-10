import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';

import { ArchivDienst, ImportDienst, Sperre } from '@knipsa/pipeline';
import type { Konfiguration } from '@knipsa/shared';

import { registriereArchivRouten } from './archiv.js';
import { datenbankIndex } from './db/archivindex.js';
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
  /**
   * Archiv-Dienst (Index und Abgleich, req-007). Ohne Angabe wird er aus
   * der Konfiguration gebaut: Index in der Datenbank, Foto-Baum aus
   * `FOTOS_PFAD`.
   */
  readonly archivDienst?: ArchivDienst;
}

/**
 * Baut die Fastify-Anwendung: Health-Routen, die Umgebungs-Auskunft fuer
 * den Viewer, die Bereiche "Import" und "Archiv" und den gebauten Viewer
 * als statische Dateien.
 */
export function baueApp({
  konfig,
  logger = false,
  db,
  pruefungen,
  viewer = viewerVerzeichnis(),
  importDienst,
  archivDienst,
}: AppOptionen): FastifyInstance {
  const app = Fastify({ logger });

  app.decorate('knipsaKonfiguration', konfig);

  const datenbank = datenbankZugang(app, konfig, db);

  // Eine Sperre fuer alle drei: Import, Abgleich und Neuaufbau laufen nie
  // gleichzeitig (req-007).
  const sperre = new Sperre();
  const archiv = archivDienst ?? baueArchivDienst(app, konfig, datenbank, sperre);

  registriereHealthRouten(app, pruefungen ?? standardPruefungen(datenbank(), konfig.fotosPfad));
  registriereImportRouten(app, importDienst ?? baueImportDienst(app, konfig, sperre, archiv));
  registriereArchivRouten(app, archiv);

  // Der Index soll auch ohne Knopfdruck aktuell bleiben: stuendlich und
  // nach jedem Import (req-007).
  archiv.startePlan();
  app.addHook('onClose', () => {
    archiv.stoppePlan();
  });

  // Der Viewer wird fuer dev und prod gleich gebaut; welche Umgebung er
  // anzeigt, erfaehrt er erst hier. Nur die Umgebung, nichts weiter.
  app.get('/api/umgebung', async (_anfrage, antwort) => {
    return antwort.header('cache-control', 'no-store').send({ umgebung: konfig.umgebung });
  });

  registriereViewer(app, viewer);

  return app;
}

function baueImportDienst(
  app: FastifyInstance,
  konfig: Konfiguration,
  sperre: Sperre,
  archiv: ArchivDienst,
): ImportDienst {
  return new ImportDienst({
    wurzel: konfig.fotosPfad,
    quellen: konfig.importQuellen,
    datentraegerPfad: konfig.datentraegerPfad,
    sperre,
    // Nach jedem Import gleicht Knipsa von selbst ab, damit die neuen
    // Fotos ohne Knopfdruck im Index stehen (req-007).
    nachLauf: () => {
      archiv.gleicheAb();
    },
    // Nur Quelle und Meldung ins Log, nie ein Pfad aus dem Foto-Baum.
    meldeFehler: (fehler) => {
      app.log.error({ fehler: fehler.message }, 'Import abgebrochen');
    },
  });
}

function baueArchivDienst(
  app: FastifyInstance,
  konfig: Konfiguration,
  datenbank: () => Kysely<Datenbank>,
  sperre: Sperre,
): ArchivDienst {
  return new ArchivDienst({
    wurzel: konfig.fotosPfad,
    index: datenbankIndex(datenbank()),
    sperre,
    meldeFehler: (fehler) => {
      app.log.error({ fehler: fehler.message }, 'Abgleich abgebrochen');
    },
  });
}

/**
 * Zugang zur Datenbank. Ohne mitgegebenen Zugang baut die App einen
 * eigenen, aber erst, wenn er gebraucht wird — ein Test, der Pruefungen
 * und Dienste selbst mitbringt, oeffnet damit keinen Pool.
 */
function datenbankZugang(
  app: FastifyInstance,
  konfig: Konfiguration,
  db: Kysely<Datenbank> | undefined,
): () => Kysely<Datenbank> {
  let eigene: Kysely<Datenbank> | undefined;

  return () => {
    if (db !== undefined) {
      return db;
    }
    if (eigene === undefined) {
      eigene = baueDatenbank({ databaseUrl: konfig.databaseUrl });
      app.addHook('onClose', async () => {
        await eigene?.destroy();
      });
    }

    return eigene;
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    knipsaKonfiguration: Konfiguration;
  }
}
