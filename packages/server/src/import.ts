/**
 * Routen der Seite "Import".
 *
 * - `GET  /api/import` — Quellen, laufender Import, letzte Laeufe.
 * - `POST /api/import/start` — startet einen Lauf fuer eine Quelle.
 *
 * Die Antworten enthalten Pfade innerhalb der Quelle und Schluessel,
 * aber nie Bilder und nie den Pfad der Foto-Wurzel.
 */

import type { FastifyInstance } from 'fastify';

import {
  ImportLaeuftBereits,
  QuelleNichtVerfuegbar,
  UnbekannteQuelle,
  type ImportDienst,
} from '@knipsa/pipeline';

interface StartAnfrage {
  readonly quelle?: unknown;
}

/** Registriert die Import-Routen. */
export function registriereImportRouten(app: FastifyInstance, dienst: ImportDienst): void {
  app.get('/api/import', async (_anfrage, antwort) => {
    return antwort.header('cache-control', 'no-store').send(await dienst.zustand());
  });

  app.post('/api/import/start', async (anfrage, antwort) => {
    const koerper = (anfrage.body ?? {}) as StartAnfrage;
    const quelle = typeof koerper.quelle === 'string' ? koerper.quelle : '';

    try {
      await dienst.starte(quelle);
    } catch (fehler) {
      return antwort
        .code(statusZu(fehler))
        .header('cache-control', 'no-store')
        .send({ fehler: (fehler as Error).message });
    }

    return antwort
      .code(202)
      .header('cache-control', 'no-store')
      .send(await dienst.zustand());
  });
}

/**
 * `409` wenn schon ein Lauf laeuft, `404` fuer eine unbekannte Quelle,
 * `409` fuer eine nicht erreichbare — alles Faelle, die die Seite dem
 * Nutzer im Klartext zeigt.
 */
function statusZu(fehler: unknown): number {
  if (fehler instanceof ImportLaeuftBereits || fehler instanceof QuelleNichtVerfuegbar) {
    return 409;
  }
  if (fehler instanceof UnbekannteQuelle) {
    return 404;
  }

  throw fehler;
}
