/**
 * Zentrale Schicht fuer alle Dateioperationen im Foto-Baum.
 *
 * Nur ueber dieses Modul wird in `original` geschrieben, und zwar immer
 * nach demselben Muster: Kopieren nach `.import-teil`, Pruefsumme
 * pruefen, erst dann in den Baum uebernehmen. Eine Operation, die etwas
 * in `original` loescht oder ueberschreibt, gibt es hier bewusst nicht —
 * Knipsa bewahrt und meldet, statt aufzuraeumen. Verworfen werden darf
 * nur eine halbe Kopie in `.import-teil`, also nichts, was je im Archiv
 * angekommen ist.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { teilVerzeichnis } from './fotobaum.js';

/** Die Kopie weicht von der Quelle ab — sie wird nie uebernommen. */
export class KopieFehler extends Error {
  constructor(readonly quelle: string) {
    super('Kopie weicht von der Quelle ab');
    this.name = 'KopieFehler';
  }
}

/**
 * Import-Pruefsumme: SHA-256 der ganzen Datei, hexadezimal. Sie wird beim
 * Eingang einmal gebildet und danach nie aktualisiert.
 */
export async function pruefsumme(pfad: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(pfad), hash);
  return hash.digest('hex');
}

async function sichereAufPlatte(pfad: string): Promise<void> {
  const datei = await open(pfad, 'r+');
  try {
    await datei.sync();
  } finally {
    await datei.close();
  }
}

/**
 * Kopiert eine Quelldatei nach `.import-teil` und prueft die Kopie gegen
 * die erwartete Pruefsumme. Stimmt sie nicht, wird die halbe Kopie
 * verworfen und `KopieFehler` geworfen — in den Baum kommt sie nie.
 */
export async function kopiereGeprueft(
  quelle: string,
  teilPfad: string,
  erwartet: string,
): Promise<void> {
  await mkdir(dirname(teilPfad), { recursive: true });
  await copyFile(quelle, teilPfad);
  await sichereAufPlatte(teilPfad);

  if ((await pruefsumme(teilPfad)) !== erwartet) {
    await unlink(teilPfad);
    throw new KopieFehler(quelle);
  }
}

/**
 * Uebernimmt eine geprueften Kopie in den Baum. Das Umbenennen innerhalb
 * desselben Dateisystems ist unteilbar: die Datei ist entweder ganz da
 * oder gar nicht.
 */
export async function uebernehmeTeil(teilPfad: string, zielPfad: string): Promise<void> {
  await mkdir(dirname(zielPfad), { recursive: true });
  await rename(teilPfad, zielPfad);
}

/** `true`, wenn der Pfad innerhalb des Verzeichnisses liegt. */
function liegtIn(verzeichnis: string, pfad: string): boolean {
  const abstand = relative(resolve(verzeichnis), resolve(pfad));
  return abstand !== '' && !abstand.startsWith('..') && !abstand.startsWith(sep);
}

/**
 * Verwirft eine liegengebliebene halbe Kopie. Erlaubt ist das nur
 * innerhalb von `.import-teil`; jeder andere Pfad ist ein Fehler im
 * Aufruf und wird abgewiesen, damit nie etwas aus `original` verschwindet.
 */
export async function verwerfeTeildatei(wurzel: string, pfad: string): Promise<void> {
  if (!liegtIn(teilVerzeichnis(wurzel), pfad)) {
    throw new Error('Verworfen wird nur innerhalb von .import-teil');
  }

  await unlink(pfad);
}

/** `true`, wenn es den Pfad gibt. */
export async function existiert(pfad: string): Promise<boolean> {
  try {
    await stat(pfad);
    return true;
  } catch {
    return false;
  }
}
