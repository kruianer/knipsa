/**
 * Protokoll eines Laufs als Datei im Foto-Baum.
 *
 * Die Seite zeigt die letzten Laeufe; das Protokoll bleibt daneben
 * dauerhaft bei den Fotos liegen — auch dann, wenn der Lauf aus der
 * Liste der letzten zehn herausgefallen ist.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ErgebnisEintrag, LaufErgebnis } from './importlauf.js';

function zeileZu(eintrag: ErgebnisEintrag): string {
  switch (eintrag.art) {
    case 'neu':
      return `neu           ${eintrag.quellPfad} -> ${eintrag.ablage ?? ''}`;
    case 'bekannt':
      return `schon bekannt ${eintrag.quellPfad} -> ${eintrag.schluessel ?? ''}`;
    case 'problem':
      return `problem       ${eintrag.quellPfad} -> ${eintrag.grund ?? ''}`;
  }
}

/** Baut den Text des Protokolls. */
export function protokollText(ergebnis: LaufErgebnis): string {
  const kopf = [
    `Quelle:        ${ergebnis.quelle}`,
    `Begonnen:      ${ergebnis.begonnen}`,
    `Beendet:       ${ergebnis.beendet}`,
    `Dateien:       ${ergebnis.gesamt}`,
    `Neu:           ${ergebnis.neu}`,
    `Schon bekannt: ${ergebnis.bekannt}`,
    `Problem:       ${ergebnis.problem}`,
    '',
  ];

  return [...kopf, ...ergebnis.dateien.map(zeileZu), ''].join('\n');
}

/** Schreibt das Protokoll an die im Ergebnis vermerkte Stelle. */
export async function schreibeProtokoll(wurzel: string, ergebnis: LaufErgebnis): Promise<void> {
  const pfad = join(wurzel, ergebnis.protokoll);
  await mkdir(dirname(pfad), { recursive: true });
  await writeFile(pfad, protokollText(ergebnis), 'utf8');
}
