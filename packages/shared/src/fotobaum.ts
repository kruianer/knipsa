/**
 * Pfade im Foto-Baum. Die Wurzel kommt immer aus der Konfiguration
 * (`FOTOS_PFAD`, im Container `/fotos`) und steht nie im Code.
 *
 * Aufbau, soweit req-005 ihn braucht:
 *
 *   original/_wartend/JJJJ-MM/<Schluessel>.<Endung>   importierte Fotos
 *   eingang/problem/                                  Problemfaelle samt Grund
 *   gesehen/gesehen.jsonl                             Gesehen-Liste
 *   protokoll/import/                                 Protokoll je Lauf
 *   zustand/import-laeufe.json                        die letzten Laeufe
 *   .import-teil/                                     halbe Kopien waehrend des Laufs
 */

import { join } from 'node:path';

import { monatsOrdner, zerlegeSchluessel } from './schluessel.js';

/** `original` — der Baum mit den Originalen. */
export function originalVerzeichnis(wurzel: string): string {
  return join(wurzel, 'original');
}

/** `original/_wartend` — importiert und gesichert, Anlass noch offen. */
export function wartendVerzeichnis(wurzel: string): string {
  return join(originalVerzeichnis(wurzel), '_wartend');
}

/** `original/_wartend/JJJJ-MM` zum Schluessel. */
export function wartendMonatVerzeichnis(wurzel: string, schluessel: string): string {
  const zerlegt = zerlegeSchluessel(schluessel);
  if (zerlegt === undefined) {
    throw new Error(`Schluessel ${schluessel} hat nicht die erwartete Form`);
  }

  return join(wartendVerzeichnis(wurzel), monatsOrdner(zerlegt.sekundenTeil));
}

/**
 * Ablage einer importierten Datei:
 * `original/_wartend/JJJJ-MM/<Schluessel><Endung>`. Die Endung kommt
 * unveraendert aus der Quelle, inklusive Punkt.
 */
export function wartendPfad(wurzel: string, schluessel: string, endung: string): string {
  return join(wartendMonatVerzeichnis(wurzel, schluessel), `${schluessel}${endung}`);
}

/** Pfad ab `original`, wie er im Ergebnis angezeigt wird. */
export function wartendAnzeige(schluessel: string, endung: string): string {
  const zerlegt = zerlegeSchluessel(schluessel);
  if (zerlegt === undefined) {
    throw new Error(`Schluessel ${schluessel} hat nicht die erwartete Form`);
  }

  return `_wartend/${monatsOrdner(zerlegt.sekundenTeil)}/${schluessel}${endung}`;
}

/** `eingang/problem` — Problemfaelle als Kopie, mit Begruendung. */
export function problemVerzeichnis(wurzel: string): string {
  return join(wurzel, 'eingang', 'problem');
}

/** `gesehen/gesehen.jsonl` — die Gesehen-Liste. */
export function gesehenDatei(wurzel: string): string {
  return join(wurzel, 'gesehen', 'gesehen.jsonl');
}

/** `protokoll/import` — ein Protokoll je Lauf. */
export function protokollVerzeichnis(wurzel: string): string {
  return join(wurzel, 'protokoll', 'import');
}

/** `zustand/import-laeufe.json` — die letzten Laeufe fuer die Seite. */
export function laeufeDatei(wurzel: string): string {
  return join(wurzel, 'zustand', 'import-laeufe.json');
}

/**
 * `.import-teil` — hier entsteht jede Kopie, bevor sie geprueft und
 * umbenannt wird. Im Wartebereich liegt dadurch nie eine halbe Datei.
 */
export function teilVerzeichnis(wurzel: string): string {
  return join(wurzel, '.import-teil');
}
