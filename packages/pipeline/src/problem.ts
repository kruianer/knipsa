/**
 * Problemfaelle nach `eingang/problem`.
 *
 * Beschaedigte Dateien, Dateien ohne Aufnahmezeit und Sidecars ohne Foto
 * bekommen keinen Schluessel — geraten wird nichts. Sie kommen als Kopie
 * mit Begruendung in den Problemordner; die Quelle bleibt unberuehrt.
 * Eine Datei, die dort inhaltlich schon liegt, wird nicht ein zweites
 * Mal abgelegt.
 */

import { readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  endung,
  grundname,
  kopiereGeprueft,
  problemVerzeichnis,
  pruefsumme,
  teilVerzeichnis,
  uebernehmeTeil,
} from '@knipsa/shared';

/** Endung der Datei, die neben der Kopie die Begruendung traegt. */
const GRUND_ENDUNG = '.grund.txt';

export interface ProblemAblageOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  /** Vollstaendiger Pfad der Quelldatei. */
  readonly pfad: string;
  readonly dateiname: string;
  /** Import-Pruefsumme der Quelldatei. */
  readonly summe: string;
  readonly grund: string;
  readonly quelle: string;
  /** Pfad in der Quelle, relativ zur Quellwurzel. */
  readonly quellPfad: string;
  readonly zeitpunkt: string;
}

export interface ProblemAblage {
  /** Name der Kopie im Problemordner. */
  readonly name: string;
  /** `false`, wenn dieselbe Datei dort schon lag. */
  readonly kopiert: boolean;
}

/**
 * Pruefsummen der Dateien, die im Problemordner liegen. Der Ordner ist
 * klein — er wird bei jedem Problemfall frisch gelesen, damit kein
 * weiterer Zustand mitgefuehrt werden muss.
 */
async function vorhandeneSummen(ordner: string): Promise<Map<string, string>> {
  let namen: string[];
  try {
    namen = await readdir(ordner);
  } catch {
    return new Map();
  }

  const summen = new Map<string, string>();
  for (const name of namen) {
    if (name.endsWith(GRUND_ENDUNG)) {
      continue;
    }

    const pfad = join(ordner, name);
    if (!(await stat(pfad)).isFile()) {
      continue;
    }

    summen.set(await pruefsumme(pfad), name);
  }

  return summen;
}

/** Erster freier Name im Problemordner, ausgehend vom urspruenglichen. */
function freierName(dateiname: string, belegt: ReadonlySet<string>): string {
  if (!belegt.has(dateiname)) {
    return dateiname;
  }

  const basis = grundname(dateiname);
  const ende = endung(dateiname);
  for (let zaehler = 2; ; zaehler += 1) {
    const kandidat = `${basis}-${zaehler}${ende}`;
    if (!belegt.has(kandidat)) {
      return kandidat;
    }
  }
}

function grundText(optionen: ProblemAblageOptionen): string {
  return [
    `Grund:     ${optionen.grund}`,
    `Quelle:    ${optionen.quelle}`,
    `Ursprung:  ${optionen.quellPfad}`,
    `Zeitpunkt: ${optionen.zeitpunkt}`,
    '',
  ].join('\n');
}

/** Legt eine Problemdatei samt Begruendung ab. */
export async function legeProblemAb(optionen: ProblemAblageOptionen): Promise<ProblemAblage> {
  const ordner = problemVerzeichnis(optionen.wurzel);
  const summen = await vorhandeneSummen(ordner);

  const schonDa = summen.get(optionen.summe);
  if (schonDa !== undefined) {
    return { name: schonDa, kopiert: false };
  }

  const name = freierName(optionen.dateiname, new Set(summen.values()));
  const teilPfad = join(teilVerzeichnis(optionen.wurzel), `problem-${name}`);
  await kopiereGeprueft(optionen.pfad, teilPfad, optionen.summe);
  // Legt den Problemordner mit an, falls es ihn noch nicht gab.
  await uebernehmeTeil(teilPfad, join(ordner, name));
  await writeFile(join(ordner, `${name}${GRUND_ENDUNG}`), grundText(optionen), 'utf8');

  return { name, kopiert: true };
}
