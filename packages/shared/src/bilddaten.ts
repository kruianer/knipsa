/**
 * Bild-Pruefsumme: die Pruefsumme nur der Bilddaten einer Datei.
 *
 * Sie ist die dauerhafte Identitaet eines Fotos. Neue Metadaten — eine
 * Bewertung, ein Stichwort, eine Beschreibung — aendern sie nicht; ein
 * veraendertes Bild (zugeschnitten, neu gerechnet) schon. Genau daran
 * erkennt der Abgleich, ob ein Original angetastet wurde (req-007).
 *
 * Je Format:
 *
 * - JPEG: alle Abschnitte ausser den Metadaten-Abschnitten (`APPn`,
 *   `COM`) samt der komprimierten Bilddaten.
 * - HEIC: die Bytes des Hauptbildes, wie `iloc` sie beschreibt; der
 *   `Exif`-Teil liegt in einem eigenen Element und bleibt aussen vor.
 * - Alles andere (NEF, Sidecar): die ganze Datei. In eine NEF schreibt
 *   niemand — ihre Aenderungen stehen im Sidecar daneben.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { pruefsumme } from './archiv.js';
import { istFoto, type DateiArt } from './dateiarten.js';

function summeVon(daten: Buffer): string {
  return createHash('sha256').update(daten).digest('hex');
}

/** Abschnitte, die nur Metadaten tragen: `APP0`-`APP15` und `COM`. */
function istMetadatenAbschnitt(marker: number): boolean {
  return (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
}

/**
 * Die Bilddaten eines JPEG: alles ausser den Metadaten-Abschnitten.
 * `undefined`, wenn die Datei kein lesbares JPEG ist.
 */
export function jpegBilddaten(inhalt: Buffer): Buffer | undefined {
  if (inhalt.length < 4 || inhalt[0] !== 0xff || inhalt[1] !== 0xd8) {
    return undefined;
  }

  const teile: Buffer[] = [];
  let stelle = 2;

  while (stelle + 1 < inhalt.length) {
    if (inhalt[stelle] !== 0xff) {
      return undefined;
    }

    const marker = inhalt[stelle + 1] as number;

    // Fuellbytes zwischen Abschnitten sind erlaubt und bedeutungslos.
    if (marker === 0xff) {
      stelle += 1;
      continue;
    }
    if (marker === 0xd9) {
      break;
    }

    const laenge = inhalt.readUInt16BE(stelle + 2);
    if (laenge < 2 || stelle + 2 + laenge > inhalt.length) {
      return undefined;
    }

    if (!istMetadatenAbschnitt(marker)) {
      teile.push(inhalt.subarray(stelle, stelle + 2 + laenge));
    }

    stelle += 2 + laenge;

    // Hinter `SOS` folgen die komprimierten Bilddaten bis zum Ende.
    if (marker === 0xda) {
      teile.push(inhalt.subarray(stelle));
      break;
    }
  }

  return teile.length === 0 ? undefined : Buffer.concat(teile);
}

/** Ein Kasten (Box) einer ISO-Datei. */
interface Kasten {
  readonly typ: string;
  /** Beginn des Inhalts. */
  readonly start: number;
  /** Erstes Byte dahinter. */
  readonly ende: number;
}

/** Die Kaesten eines Bereichs, ohne hineinzusteigen. */
function kaesten(inhalt: Buffer, von: number, bis: number): Kasten[] {
  const gefunden: Kasten[] = [];
  let stelle = von;

  while (stelle + 8 <= bis) {
    const groesse = inhalt.readUInt32BE(stelle);
    const typ = inhalt.toString('ascii', stelle + 4, stelle + 8);
    // `0` heisst "bis zum Ende", `1` eine 64-Bit-Groesse dahinter.
    const ende = groesse === 0 ? bis : groesse === 1 ? bis : stelle + groesse;
    if (groesse === 1 || ende <= stelle || ende > bis) {
      return gefunden;
    }

    gefunden.push({ typ, start: stelle + 8, ende });
    stelle = ende;
  }

  return gefunden;
}

function kastenMit(liste: readonly Kasten[], typ: string): Kasten | undefined {
  return liste.find((kasten) => kasten.typ === typ);
}

/** Lage und Laenge eines Abschnitts der Datei. */
interface Abschnitt {
  readonly offset: number;
  readonly laenge: number;
}

/** Liest `laenge` Bytes als Zahl; nur 0, 4 und 8 Bytes kommen vor. */
function zahl(inhalt: Buffer, stelle: number, laenge: number): number | undefined {
  if (laenge === 0) {
    return 0;
  }
  if (laenge === 4) {
    return inhalt.readUInt32BE(stelle);
  }
  if (laenge === 8) {
    return Number(inhalt.readBigUInt64BE(stelle));
  }
  return undefined;
}

/** Die Nummer des Hauptbildes aus `pitm`. */
function hauptbild(inhalt: Buffer, pitm: Kasten): number | undefined {
  const version = inhalt[pitm.start];
  const stelle = pitm.start + 4;

  if (version === 0) {
    return stelle + 2 <= pitm.ende ? inhalt.readUInt16BE(stelle) : undefined;
  }
  return stelle + 4 <= pitm.ende ? inhalt.readUInt32BE(stelle) : undefined;
}

/** Die Abschnitte eines Elements aus `iloc`. */
function abschnitteAus(inhalt: Buffer, iloc: Kasten, element: number): Abschnitt[] | undefined {
  const version = inhalt[iloc.start] as number;
  let stelle = iloc.start + 4;

  const groessen = inhalt[stelle] as number;
  const offsetGroesse = groessen >> 4;
  const laengeGroesse = groessen & 0x0f;
  const basis = inhalt[stelle + 1] as number;
  const basisGroesse = basis >> 4;
  const indexGroesse = version === 1 || version === 2 ? basis & 0x0f : 0;
  stelle += 2;

  let anzahl: number;
  if (version < 2) {
    anzahl = inhalt.readUInt16BE(stelle);
    stelle += 2;
  } else {
    anzahl = inhalt.readUInt32BE(stelle);
    stelle += 4;
  }

  for (let nummer = 0; nummer < anzahl; nummer += 1) {
    const kennung = version < 2 ? inhalt.readUInt16BE(stelle) : inhalt.readUInt32BE(stelle);
    stelle += version < 2 ? 2 : 4;

    if (version === 1 || version === 2) {
      stelle += 2; // construction_method
    }
    stelle += 2; // data_reference_index

    const basisOffset = zahl(inhalt, stelle, basisGroesse);
    if (basisOffset === undefined) {
      return undefined;
    }
    stelle += basisGroesse;

    const teile = inhalt.readUInt16BE(stelle);
    stelle += 2;

    const abschnitte: Abschnitt[] = [];
    for (let teil = 0; teil < teile; teil += 1) {
      stelle += indexGroesse;
      const offset = zahl(inhalt, stelle, offsetGroesse);
      stelle += offsetGroesse;
      const laenge = zahl(inhalt, stelle, laengeGroesse);
      stelle += laengeGroesse;

      if (offset === undefined || laenge === undefined) {
        return undefined;
      }
      abschnitte.push({ offset: basisOffset + offset, laenge });
    }

    if (kennung === element) {
      return abschnitte;
    }
  }

  return undefined;
}

/**
 * Die Bilddaten eines HEIC: die Bytes des Hauptbildes. `undefined`, wenn
 * die Datei nicht wie erwartet aufgebaut ist.
 */
export function heicBilddaten(inhalt: Buffer): Buffer | undefined {
  const oben = kaesten(inhalt, 0, inhalt.length);
  const meta = kastenMit(oben, 'meta');
  if (meta === undefined) {
    return undefined;
  }

  // `meta` ist eine Vollbox: vier Bytes Version und Flags, dann Kaesten.
  const innen = kaesten(inhalt, meta.start + 4, meta.ende);
  const pitm = kastenMit(innen, 'pitm');
  const iloc = kastenMit(innen, 'iloc');
  if (pitm === undefined || iloc === undefined) {
    return undefined;
  }

  const element = hauptbild(inhalt, pitm);
  if (element === undefined) {
    return undefined;
  }

  const abschnitte = abschnitteAus(inhalt, iloc, element);
  if (abschnitte === undefined || abschnitte.length === 0) {
    return undefined;
  }

  const teile: Buffer[] = [];
  for (const { offset, laenge } of abschnitte) {
    if (offset < 0 || offset + laenge > inhalt.length) {
      return undefined;
    }
    teile.push(inhalt.subarray(offset, offset + laenge));
  }

  return Buffer.concat(teile);
}

/**
 * Bild-Pruefsumme einer Datei. Laesst sich das Format nicht zerlegen,
 * gilt die ganze Datei als Bilddaten: dann meldet Knipsa im Zweifel eine
 * Aenderung zu viel statt eine zu wenig (siehe `delivery/vision.md`,
 * "bewahren vor aufräumen").
 */
export async function bildPruefsumme(pfad: string, art: DateiArt): Promise<string> {
  if (!istFoto(art) || art === 'raw') {
    return pruefsumme(pfad);
  }

  const inhalt = await readFile(pfad);
  const daten = art === 'jpeg' ? jpegBilddaten(inhalt) : heicBilddaten(inhalt);

  return daten === undefined ? summeVon(inhalt) : summeVon(daten);
}
