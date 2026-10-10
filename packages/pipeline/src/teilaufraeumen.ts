/**
 * Aufraeumen von `.import-teil` nach einem Abbruch.
 *
 * Eine Kopie entsteht in `.import-teil`, wird geprueft, dann in der
 * Gesehen-Liste vermerkt und erst zuletzt in den Wartebereich umbenannt.
 * Bricht der Lauf dazwischen ab, bleibt genau eine dieser beiden Lagen
 * zurueck:
 *
 * - Die Kopie steht schon in der Gesehen-Liste: dann gehoert sie ins
 *   Archiv, und das Umbenennen wird nachgeholt.
 * - Sie steht noch nicht darin: dann ist sie keine fertige Datei und
 *   wird verworfen. Im Wartebereich landet sie nie.
 *
 * Verglichen wird dabei immer die Pruefsumme, nicht nur der Name.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  endung,
  existiert,
  grundname,
  pruefsumme,
  teilVerzeichnis,
  uebernehmeTeil,
  verwerfeTeildatei,
  wartendPfad,
  zerlegeSchluessel,
} from '@knipsa/shared';

import { GesehenListe } from './gesehen.js';

export interface TeilAufraeumung {
  /** Dateien, deren Umbenennen in den Wartebereich nachgeholt wurde. */
  readonly uebernommen: readonly string[];
  /** Verworfene halbe Kopien. */
  readonly verworfen: readonly string[];
}

/**
 * Raeumt `.import-teil` auf. `gesehen` muss den Stand von der Platte
 * haben — Schluessel, die erst im laufenden Lauf vergeben wurden, duerfen
 * hier nicht als vermerkt gelten.
 */
export async function raeumeTeileAuf(
  wurzel: string,
  gesehen: GesehenListe,
): Promise<TeilAufraeumung> {
  const ordner = teilVerzeichnis(wurzel);

  let namen: string[];
  try {
    namen = await readdir(ordner);
  } catch {
    return { uebernommen: [], verworfen: [] };
  }

  const uebernommen: string[] = [];
  const verworfen: string[] = [];

  for (const name of [...namen].sort()) {
    const pfad = join(ordner, name);
    const schluessel = grundname(name);
    const gehoertInsArchiv =
      zerlegeSchluessel(schluessel) !== undefined &&
      gesehen.kennt(await pruefsumme(pfad))?.schluessel === schluessel;

    if (!gehoertInsArchiv) {
      await verwerfeTeildatei(wurzel, pfad);
      verworfen.push(name);
      continue;
    }

    const ziel = wartendPfad(wurzel, schluessel, endung(name));
    if (await existiert(ziel)) {
      // Das Umbenennen war schon durch; die Kopie ist nur uebrig.
      await verwerfeTeildatei(wurzel, pfad);
      verworfen.push(name);
      continue;
    }

    await uebernehmeTeil(pfad, ziel);
    uebernommen.push(name);
  }

  return { uebernommen, verworfen };
}

/**
 * Raeumt `.import-teil` auf und liest die Gesehen-Liste dafuer selbst
 * ein. So laeuft das Aufraeumen auch beim Start des Servers, bevor
 * irgendwer einen Import anstoesst.
 */
export async function raeumeImportTeileAuf(wurzel: string): Promise<TeilAufraeumung> {
  return raeumeTeileAuf(wurzel, await GesehenListe.lade(wurzel));
}
