/**
 * Die Ordner einer Quelle ansehen, Ebene fuer Ebene.
 *
 * Dient der Auswahl "Ordner wählen …" auf der Seite "Import": je Ordner
 * sein Name und die Anzahl Dateien darin — samt Unterordnern, denn genau
 * die wuerde "Diesen Ordner importieren" uebernehmen.
 *
 * Die Quelle ist eine Fremdquelle und wird ausschliesslich gelesen. Der
 * gewuenschte Ordner kommt von aussen, deshalb wird er geprueft: er muss
 * innerhalb der Quelle liegen, auch nicht ueber einen Umweg.
 */

import type { Dirent } from 'node:fs';
import { readdir, realpath } from 'node:fs/promises';
import { join, posix, relative, resolve, sep } from 'node:path';

/** Ein Ordner in der Quelle. */
export interface OrdnerEintrag {
  /** Name des Ordners. */
  readonly name: string;
  /** Pfad relativ zur Quellwurzel, mit `/` als Trenner. */
  readonly pfad: string;
  /** Anzahl Dateien im Ordner samt Unterordnern. */
  readonly dateien: number;
  /** `true`, wenn darunter weitere Ordner liegen. */
  readonly weiter: boolean;
}

/** Eine Ebene der Ordner-Auswahl. */
export interface OrdnerAnsicht {
  /** Angesehener Ordner, relativ zur Quellwurzel; `''` ist die Wurzel. */
  readonly ordner: string;
  /** Anzahl Dateien in diesem Ordner samt Unterordnern. */
  readonly dateien: number;
  readonly unterordner: readonly OrdnerEintrag[];
}

/** Diesen Ordner gibt es in der Quelle nicht. */
export class UnbekannterOrdner extends Error {
  constructor(readonly ordner: string) {
    super('Ordner nicht bekannt');
    this.name = 'UnbekannterOrdner';
  }
}

/**
 * Bringt einen von aussen gewuenschten Ordner auf die Form, in der er
 * hier verwendet wird: relativ, mit `/` als Trenner, ohne `.` und `..`.
 * Alles andere ist kein Ordner innerhalb der Quelle.
 */
export function pruefeOrdner(ordner: string): string {
  const teile = ordner
    .replaceAll('\\', '/')
    .split('/')
    .map((teil) => teil.trim())
    .filter((teil) => teil !== '' && teil !== '.');

  if (ordner.startsWith('/') || teile.includes('..')) {
    throw new UnbekannterOrdner(ordner);
  }

  return teile.join(posix.sep);
}

/**
 * Pfad des Ordners in der Quelle. Geprueft wird gegen den aufgeloesten
 * Pfad: ein Verweis, der aus der Quelle hinausfuehrt, wird abgewiesen.
 */
export async function ordnerPfad(wurzel: string, ordner: string): Promise<string> {
  const geprueft = pruefeOrdner(ordner);
  const pfad = geprueft === '' ? wurzel : join(wurzel, geprueft);

  let aufgeloest: string;
  let wurzelAufgeloest: string;
  try {
    aufgeloest = await realpath(pfad);
    wurzelAufgeloest = await realpath(wurzel);
  } catch {
    throw new UnbekannterOrdner(ordner);
  }

  if (aufgeloest !== wurzelAufgeloest) {
    const abstand = relative(resolve(wurzelAufgeloest), resolve(aufgeloest));
    if (abstand === '' || abstand.startsWith('..') || abstand.startsWith(sep)) {
      throw new UnbekannterOrdner(ordner);
    }
  }

  return pfad;
}

/** Zaehlt die Dateien im Ordner samt Unterordnern. */
async function zaehleDateien(pfad: string): Promise<number> {
  let eintraege: Dirent[];
  try {
    eintraege = await readdir(pfad, { withFileTypes: true });
  } catch {
    return 0;
  }

  let anzahl = 0;
  for (const eintrag of eintraege) {
    if (eintrag.isFile()) {
      anzahl += 1;
    } else if (eintrag.isDirectory()) {
      anzahl += await zaehleDateien(join(pfad, eintrag.name));
    }
  }

  return anzahl;
}

/** `true`, wenn im Ordner noch ein Ordner liegt. */
async function hatUnterordner(pfad: string): Promise<boolean> {
  try {
    return (await readdir(pfad, { withFileTypes: true })).some((eintrag) => eintrag.isDirectory());
  } catch {
    return false;
  }
}

/**
 * Eine Ebene der Ordner-Auswahl: die Ordner unmittelbar in `ordner`, je
 * mit Name und Anzahl Dateien. Gelesen wird dabei nur.
 */
export async function zeigeOrdner(wurzel: string, ordner = ''): Promise<OrdnerAnsicht> {
  const pfad = await ordnerPfad(wurzel, ordner);
  const geprueft = pruefeOrdner(ordner);

  let eintraege: Dirent[];
  try {
    eintraege = await readdir(pfad, { withFileTypes: true });
  } catch {
    throw new UnbekannterOrdner(ordner);
  }

  const namen = eintraege
    .filter((eintrag) => eintrag.isDirectory())
    .map((eintrag) => eintrag.name)
    .sort((a, b) => (a < b ? -1 : 1));

  const unterordner: OrdnerEintrag[] = [];
  let dateien = eintraege.filter((eintrag) => eintrag.isFile()).length;

  for (const name of namen) {
    const unten = join(pfad, name);
    const anzahl = await zaehleDateien(unten);
    dateien += anzahl;
    unterordner.push({
      name,
      pfad: posix.join(geprueft, name),
      dateien: anzahl,
      weiter: await hatUnterordner(unten),
    });
  }

  return { ordner: geprueft, dateien, unterordner };
}
