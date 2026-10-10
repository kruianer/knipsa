/**
 * Routen der Seite "Import".
 *
 * - `GET  /api/import` — Quellen, laufender Import, letzte Laeufe.
 * - `GET  /api/import/ordner` — die Ordner einer Quelle, Ebene fuer Ebene.
 * - `POST /api/import/start` — startet einen Lauf fuer eine Quelle,
 *   wahlweise begrenzt auf einen Ordner darin.
 * - `POST /api/import/abbrechen` — beendet den laufenden Import nach der
 *   gerade bearbeiteten Datei.
 *
 * Die Antworten enthalten Pfade innerhalb der Quelle und Schluessel,
 * aber nie Bilder und nie den Pfad der Foto-Wurzel.
 */

import type { FastifyInstance } from 'fastify';

import {
  ImportLaeuftBereits,
  KeinImportLaeuft,
  QuelleNichtVerfuegbar,
  UnbekannteQuelle,
  UnbekannterOrdner,
  type ImportDienst,
} from '@knipsa/pipeline';

interface StartAnfrage {
  readonly quelle?: unknown;
  readonly ordner?: unknown;
}

interface OrdnerAnfrage {
  readonly quelle?: unknown;
  readonly ordner?: unknown;
}

/** Nimmt nur Text an; alles andere gilt als nicht angegeben. */
function text(wert: unknown): string {
  return typeof wert === 'string' ? wert : '';
}

/** Registriert die Import-Routen. */
export function registriereImportRouten(app: FastifyInstance, dienst: ImportDienst): void {
  app.get('/api/import', async (_anfrage, antwort) => {
    return antwort.header('cache-control', 'no-store').send(await dienst.zustand());
  });

  app.get('/api/import/ordner', async (anfrage, antwort) => {
    const frage = (anfrage.query ?? {}) as OrdnerAnfrage;
    const quelle = text(frage.quelle);

    try {
      const ansicht = await dienst.ordner(quelle, text(frage.ordner));
      return antwort.header('cache-control', 'no-store').send({ quelle, ...ansicht });
    } catch (fehler) {
      return antwort
        .code(statusZu(fehler))
        .header('cache-control', 'no-store')
        .send({ fehler: (fehler as Error).message });
    }
  });

  app.post('/api/import/start', async (anfrage, antwort) => {
    const koerper = (anfrage.body ?? {}) as StartAnfrage;

    try {
      await dienst.starte(text(koerper.quelle), { ordner: text(koerper.ordner) });
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

  app.post('/api/import/abbrechen', async (_anfrage, antwort) => {
    try {
      dienst.brecheAb();
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
 * `409` wenn schon ein Lauf laeuft, keiner laeuft oder die Quelle nicht
 * erreichbar ist, `404` fuer eine unbekannte Quelle oder einen
 * unbekannten Ordner — alles Faelle, die die Seite dem Nutzer im
 * Klartext zeigt.
 */
function statusZu(fehler: unknown): number {
  if (
    fehler instanceof ImportLaeuftBereits ||
    fehler instanceof QuelleNichtVerfuegbar ||
    fehler instanceof KeinImportLaeuft
  ) {
    return 409;
  }
  if (fehler instanceof UnbekannteQuelle || fehler instanceof UnbekannterOrdner) {
    return 404;
  }

  throw fehler;
}
