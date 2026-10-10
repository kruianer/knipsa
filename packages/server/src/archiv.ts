/**
 * Routen des Bereichs "Archiv".
 *
 * - `GET  /api/archiv` — Zahlen, letzter Abgleich, laufendes Vorhaben.
 * - `GET  /api/archiv/liste` — die Liste hinter einer Zahl.
 * - `GET  /api/archiv/foto` — die Angaben eines Schluessels als Text.
 * - `POST /api/archiv/abgleich` — "Abgleich jetzt".
 * - `POST /api/archiv/neu-aufbauen` — Index verwerfen und neu einlesen.
 *
 * Die Antworten enthalten Schluessel und Pfade ab `original`, aber nie
 * ein Bild und nie den Pfad der Foto-Wurzel (siehe
 * `delivery/security.md`).
 */

import type { FastifyInstance, FastifyReply } from 'fastify';

import { istListenArt, LISTEN_GRENZE, VorhabenLaeuft, type ArchivDienst } from '@knipsa/pipeline';

interface ListenAnfrage {
  readonly art?: unknown;
}

interface FotoAnfrage {
  readonly schluessel?: unknown;
}

/** Nimmt nur Text an; alles andere gilt als nicht angegeben. */
function text(wert: unknown): string {
  return typeof wert === 'string' ? wert : '';
}

/** Registriert die Archiv-Routen. */
export function registriereArchivRouten(app: FastifyInstance, dienst: ArchivDienst): void {
  app.get('/api/archiv', async (_anfrage, antwort) => {
    return antwort.header('cache-control', 'no-store').send(await dienst.zustand());
  });

  app.get('/api/archiv/liste', async (anfrage, antwort) => {
    const frage = (anfrage.query ?? {}) as ListenAnfrage;
    const art = text(frage.art);

    if (!istListenArt(art)) {
      return antwort
        .code(404)
        .header('cache-control', 'no-store')
        .send({ fehler: 'Liste nicht bekannt' });
    }

    return antwort.header('cache-control', 'no-store').send({
      art,
      grenze: LISTEN_GRENZE,
      zeilen: await dienst.liste(art),
    });
  });

  app.get('/api/archiv/foto', async (anfrage, antwort) => {
    const frage = (anfrage.query ?? {}) as FotoAnfrage;
    const schluessel = text(frage.schluessel).trim();
    const gefunden = await dienst.nachschlagen(schluessel);

    if (gefunden === undefined) {
      return antwort
        .code(404)
        .header('cache-control', 'no-store')
        .send({ fehler: 'Schlüssel im Index nicht gefunden' });
    }

    return antwort.header('cache-control', 'no-store').send({ schluessel, text: gefunden });
  });

  app.post('/api/archiv/abgleich', async (_anfrage, antwort) => {
    return starte(dienst, antwort, () => {
      dienst.gleicheAb();
    });
  });

  app.post('/api/archiv/neu-aufbauen', async (_anfrage, antwort) => {
    return starte(dienst, antwort, () => {
      dienst.baueNeuAuf();
    });
  });
}

/**
 * Startet ein Vorhaben und antwortet mit dem Zustand. `409`, wenn schon
 * ein Import, Abgleich oder Neuaufbau laeuft — die Seite zeigt dann
 * dessen Meldung im Klartext.
 */
async function starte(
  dienst: ArchivDienst,
  antwort: FastifyReply,
  tun: () => void,
): Promise<FastifyReply> {
  try {
    tun();
  } catch (fehler) {
    if (!(fehler instanceof VorhabenLaeuft)) {
      throw fehler;
    }

    return antwort
      .code(409)
      .header('cache-control', 'no-store')
      .send({ fehler: fehler.message, ...(await dienst.zustand()) });
  }

  return antwort
    .code(202)
    .header('cache-control', 'no-store')
    .send(await dienst.zustand());
}
