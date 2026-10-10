/**
 * Die letzten Laeufe, wie die Seite "Import" sie zeigt.
 *
 * Gespeichert im Foto-Baum, nicht in einer Datenbank: die Seite soll die
 * letzten Ergebnisse auch nach einem Neustart zeigen, und eine Datenbank
 * gehoert erst zu req-007.
 */

import { mkdir, rename, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { laeufeDatei } from '@knipsa/shared';

import type { LaufErgebnis } from './importlauf.js';

/** So viele Laeufe zeigt die Seite — die neuesten zuerst. */
export const MAX_LAEUFE = 10;

function istErgebnis(wert: unknown): wert is LaufErgebnis {
  if (typeof wert !== 'object' || wert === null) {
    return false;
  }

  const satz = wert as Record<string, unknown>;
  return (
    typeof satz.quelle === 'string' &&
    typeof satz.begonnen === 'string' &&
    typeof satz.beendet === 'string' &&
    Array.isArray(satz.dateien)
  );
}

/** Liest die gespeicherten Laeufe; ohne Datei eine leere Liste. */
export async function ladeLaeufe(wurzel: string): Promise<LaufErgebnis[]> {
  let inhalt: string;
  try {
    inhalt = await readFile(laeufeDatei(wurzel), 'utf8');
  } catch {
    return [];
  }

  let gelesen: unknown;
  try {
    gelesen = JSON.parse(inhalt);
  } catch {
    return [];
  }

  if (!Array.isArray(gelesen)) {
    return [];
  }

  return gelesen.filter(istErgebnis).slice(0, MAX_LAEUFE);
}

/**
 * Stellt einen Lauf an die Spitze der Liste und schreibt sie zurueck.
 * Aelteres faellt hinten heraus; das Protokoll im Baum bleibt davon
 * unberuehrt.
 */
export async function merkeLauf(wurzel: string, lauf: LaufErgebnis): Promise<LaufErgebnis[]> {
  const liste = [lauf, ...(await ladeLaeufe(wurzel))].slice(0, MAX_LAEUFE);

  const pfad = laeufeDatei(wurzel);
  await mkdir(dirname(pfad), { recursive: true });

  // Erst daneben schreiben, dann umbenennen: ein Absturz hinterlaesst
  // damit nie eine halbe JSON-Datei.
  const neben = `${pfad}.neu`;
  await writeFile(neben, `${JSON.stringify(liste, undefined, 2)}\n`, 'utf8');
  await rename(neben, pfad);

  return liste;
}
