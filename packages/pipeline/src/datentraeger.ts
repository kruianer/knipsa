/**
 * Eingesteckte Datentraeger: SD-Karte, USB-Stick, fremde Platte.
 *
 * Der Host haengt jeden eingesteckten Datentraeger NUR LESEND unter einem
 * eigenen Ordner ein (auf dem Beelink `/media/knipsa/<Bezeichnung>`, im
 * Container `DATENTRAEGER_PFAD`, siehe `deploy/host/automount/`). Hier
 * wird dieser Ordner nur angesehen: jeder tatsaechlich eingehaengte
 * Unterordner ist ein Datentraeger.
 *
 * Nach dem Herausziehen bleibt der leere Ordner manchmal einige Sekunden
 * stehen. Er gilt dann nicht mehr als Datentraeger — darum wird nicht nur
 * nach dem Ordner, sondern nach dem Einhaengepunkt gefragt.
 */

import { stat, statfs, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Ein eingehaengter Datentraeger. */
export interface Datentraeger {
  /** Bezeichnung des Datentraegers, zum Beispiel `NIKON D750`. */
  readonly name: string;
  /** Einhaengepunkt. */
  readonly pfad: string;
  /** Groesse des Datentraegers in Bytes; 0, wenn sie sich nicht lesen laesst. */
  readonly groesse: number;
  /** Beschriftung auf der Seite, zum Beispiel `NIKON D750 (64 GB)`. */
  readonly anzeige: string;
}

/** Hersteller rechnen dezimal: eine 64-GB-Karte hat 64 Milliarden Bytes. */
const GB = 1_000_000_000;
const MB = 1_000_000;
const TB = 1000 * GB;

/** Rundet auf eine Stelle und laesst `,0` weg. */
function eineStelle(wert: number): string {
  return String(Math.round(wert * 10) / 10).replace('.', ',');
}

/**
 * Groesse in der Schreibweise des Herstellers: dezimal und gerundet, wie
 * es auf der Karte steht.
 */
export function groesseText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'unbekannte Größe';
  }
  if (bytes >= TB) {
    return `${eineStelle(bytes / TB)} TB`;
  }
  if (bytes >= GB) {
    return `${Math.round(bytes / GB)} GB`;
  }
  if (bytes >= MB) {
    return `${Math.round(bytes / MB)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

/**
 * `true`, wenn der Ordner selbst ein Einhaengepunkt ist. Ein eingehaengter
 * Ordner liegt auf einem anderen Dateisystem als sein Elternordner; ein
 * leer stehengebliebener Ordner liegt auf demselben.
 */
export async function istEingehaengt(pfad: string): Promise<boolean> {
  try {
    const [eigen, eltern] = await Promise.all([stat(pfad), stat(dirname(pfad))]);
    return eigen.isDirectory() && eigen.dev !== eltern.dev;
  } catch {
    return false;
  }
}

/** Groesse des Dateisystems am Einhaengepunkt. */
async function dateisystemGroesse(pfad: string): Promise<number> {
  try {
    const angaben = await statfs(pfad);
    return angaben.blocks * angaben.bsize;
  } catch {
    return 0;
  }
}

export interface DatentraegerOptionen {
  /** Prueft den Einhaengepunkt; in Tests ersetzbar. */
  readonly eingehaengt?: (pfad: string) => Promise<boolean>;
  /** Liest die Groesse; in Tests ersetzbar. */
  readonly groesse?: (pfad: string) => Promise<number>;
}

/**
 * Alle gerade eingehaengten Datentraeger unter `wurzel`, nach Bezeichnung
 * sortiert. Ohne `wurzel` (nicht eingestellt) gibt es keine.
 */
export async function findeDatentraeger(
  wurzel: string,
  { eingehaengt = istEingehaengt, groesse = dateisystemGroesse }: DatentraegerOptionen = {},
): Promise<Datentraeger[]> {
  if (wurzel.trim() === '') {
    return [];
  }

  let namen: string[];
  try {
    const eintraege = await readdir(wurzel, { withFileTypes: true });
    // Eingehaengt wird immer in einen Ordner; alles andere daneben
    // (zum Beispiel eine Hinweisdatei) ist kein Datentraeger.
    namen = eintraege.filter((eintrag) => eintrag.isDirectory()).map((eintrag) => eintrag.name);
  } catch {
    // Den Ordner gibt es (noch) nicht — dann ist nichts eingesteckt.
    return [];
  }

  const gefunden: Datentraeger[] = [];
  for (const name of [...namen].sort((a, b) => (a < b ? -1 : 1))) {
    const pfad = join(wurzel, name);
    if (!(await eingehaengt(pfad))) {
      continue;
    }

    const bytes = await groesse(pfad);
    gefunden.push({ name, pfad, groesse: bytes, anzeige: `${name} (${groesseText(bytes)})` });
  }

  return gefunden;
}
