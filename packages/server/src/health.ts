import { constants as fsKonstanten } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';

import { antwortetDatenbank, type Datenbank } from './db/datenbank.js';

/** Ergebnis einer einzelnen Pruefung. Mehr sagt die Antwort nie. */
export type Pruefstatus = 'ok' | 'fehler';

export interface ReadyAntwort {
  readonly datenbank: Pruefstatus;
  readonly fotos: Pruefstatus;
}

/**
 * Die beiden Pruefungen von `/health/ready`. Als Parameter uebergeben,
 * damit Tests sie ersetzen koennen, ohne an echten Diensten zu haengen.
 */
export interface Pruefungen {
  /** Antwortet die Datenbank? */
  datenbank(): Promise<boolean>;
  /** Ist die eingebundene Wurzel `/fotos` vorhanden und lesbar? */
  fotos(): Promise<boolean>;
}

function status(ok: boolean): Pruefstatus {
  return ok ? 'ok' : 'fehler';
}

/** Prueft, ob der Pfad ein vorhandenes, lesbares Verzeichnis ist. */
export async function istFotosWurzelLesbar(pfad: string): Promise<boolean> {
  try {
    await access(pfad, fsKonstanten.R_OK);
    return (await stat(pfad)).isDirectory();
  } catch {
    return false;
  }
}

/** Die echten Pruefungen gegen Datenbank und eingebundenen Foto-Baum. */
export function standardPruefungen(db: Kysely<Datenbank>, fotosPfad: string): Pruefungen {
  return {
    datenbank: () => antwortetDatenbank(db),
    fotos: () => istFotosWurzelLesbar(fotosPfad),
  };
}

/**
 * Registriert die Health-Routen.
 *
 * - `GET /health/live` — der Prozess laeuft. Immer `200`, ohne Datenbank.
 * - `GET /health/ready` — Datenbank und `/fotos` geprueft. `200`, wenn
 *   beides ok ist, sonst `503`.
 *
 * Beide Antworten enthalten nur Status-Angaben: keine Pfade, keine
 * Versionen, keine Verbindungsdaten.
 */
export function registriereHealthRouten(app: FastifyInstance, pruefungen: Pruefungen): void {
  app.get('/health/live', async (_anfrage, antwort) => {
    return antwort.header('cache-control', 'no-store').send({ status: 'ok' });
  });

  app.get('/health/ready', async (_anfrage, antwort) => {
    const [datenbank, fotos] = await Promise.all([pruefungen.datenbank(), pruefungen.fotos()]);

    const ergebnis: ReadyAntwort = { datenbank: status(datenbank), fotos: status(fotos) };
    const alleOk = datenbank && fotos;

    if (!alleOk) {
      // Nur die betroffene Pruefung ins Log, nie Pfad oder Verbindungsdaten.
      app.log.warn({ ergebnis }, 'ready: Pruefung fehlgeschlagen');
    }

    return antwort
      .code(alleOk ? 200 : 503)
      .header('cache-control', 'no-store')
      .send(ergebnis);
  });
}
