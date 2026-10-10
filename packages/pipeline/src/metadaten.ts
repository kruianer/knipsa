/**
 * Metadaten aus der Datei lesen, ueber `exiftool`.
 *
 * Gelesen wird genau das, was in der Datei steht: keine Zeitzone, keine
 * Umrechnung, keine Schaetzung aus Dateidatum oder Dateinamen. Fehlt die
 * Aufnahmezeit oder ist die Datei beschaedigt, ist das ein Problemfall —
 * geraten wird nie (siehe `delivery/vision.md`).
 *
 * Der Import (req-005) braucht nur die Aufnahmezeit, der Index (req-007)
 * dazu Bewertung, Farbmarkierung, Stichwoerter, Titel, Beschreibung und
 * GPS. Beides liest derselbe `exiftool`-Prozess.
 */

import { ExifTool } from 'exiftool-vendored';

import type { Aufnahmezeit } from '@knipsa/shared';

/** Was `exiftool` ueber die Aufnahmezeit einer Datei sagt. */
export type AufnahmeErgebnis =
  | {
      readonly art: 'gelesen';
      readonly zeit: Aufnahmezeit;
      /** Sekundenbruchteil als Zahl kleiner 1, fuer die Reihenfolge. */
      readonly bruchteil: number | undefined;
    }
  | { readonly art: 'keineZeit' }
  | { readonly art: 'beschaedigt'; readonly grund: string };

export interface MetadatenLeser {
  leseAufnahmezeit(pfad: string): Promise<AufnahmeErgebnis>;
  /** Beendet den `exiftool`-Prozess. */
  schliesse(): Promise<void>;
}

/** Angaben eines Fotos, wie sie in seiner Datei stehen (req-007). */
export interface GeleseneAngaben {
  /** 1 bis 5 Sterne; `undefined`, wenn nicht bewertet. */
  readonly bewertung: number | undefined;
  readonly farbmarkierung: string | undefined;
  readonly stichwoerter: readonly string[];
  readonly titel: string | undefined;
  readonly beschreibung: string | undefined;
  /** Breite in Grad, Sueden negativ. */
  readonly gpsBreite: number | undefined;
  /** Laenge in Grad, Westen negativ. */
  readonly gpsLaenge: number | undefined;
}

/** Keine Angaben in der Datei — und nichts dazuerfunden. */
export const KEINE_ANGABEN: GeleseneAngaben = {
  bewertung: undefined,
  farbmarkierung: undefined,
  stichwoerter: [],
  titel: undefined,
  beschreibung: undefined,
  gpsBreite: undefined,
  gpsLaenge: undefined,
};

/** Liest die Angaben eines Fotos; fuer den Index (req-007). */
export interface AngabenLeser {
  leseAngaben(pfad: string): Promise<GeleseneAngaben>;
  /** Beendet den `exiftool`-Prozess. */
  schliesse(): Promise<void>;
}

/** Tags, die gelesen werden — mehr braucht req-005 nicht. */
const TAGS = [
  '-DateTimeOriginal',
  '-SubSecTimeOriginal',
  '-CreateDate',
  '-Warning',
  '-Error',
  '-s',
];

/**
 * Tags fuer die Angaben eines Fotos. `-n` liefert Zahlen statt
 * aufbereiteter Texte — damit kommt GPS als Gradzahl und nicht als
 * `47 deg 12' 34"`.
 */
const ANGABEN_TAGS = [
  '-Rating',
  '-Label',
  '-Subject',
  '-Keywords',
  '-Title',
  '-ObjectName',
  '-Description',
  '-Caption-Abstract',
  '-ImageDescription',
  '-GPSLatitude',
  '-GPSLatitudeRef',
  '-GPSLongitude',
  '-GPSLongitudeRef',
  '-n',
  '-s',
];

const ZEIT = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/;

function text(wert: unknown): string | undefined {
  if (typeof wert === 'string') {
    return wert;
  }
  if (typeof wert === 'number') {
    return String(wert);
  }
  return undefined;
}

function textliste(wert: unknown): string[] {
  if (Array.isArray(wert)) {
    return wert.map(text).filter((eintrag): eintrag is string => eintrag !== undefined);
  }
  const einzeln = text(wert);
  return einzeln === undefined ? [] : [einzeln];
}

/**
 * Ein Hinweis mit `[minor]` ist harmlos (zum Beispiel ein unbekanntes
 * Feld); alles andere gilt als beschaedigt.
 */
function schwererHinweis(hinweise: string[]): string | undefined {
  return hinweise.find((hinweis) => !hinweis.startsWith('[minor]'));
}

function bruchteilAusZiffern(ziffern: string | undefined): number | undefined {
  if (ziffern === undefined || ziffern === '') {
    return undefined;
  }

  const wert = Number(`0.${ziffern}`);
  return Number.isFinite(wert) ? wert : undefined;
}

/** Zerlegt `2019:06:14 10:15:00.120` in Aufnahmezeit und Bruchteil. */
export function zerlegeZeitangabe(
  angabe: string,
  subsec?: string,
): { zeit: Aufnahmezeit; bruchteil: number | undefined } | undefined {
  const treffer = ZEIT.exec(angabe.trim());
  if (treffer === null) {
    return undefined;
  }

  const zahl = (stelle: number): number => Number(treffer[stelle] as string);
  const zeit: Aufnahmezeit = {
    jahr: zahl(1),
    monat: zahl(2),
    tag: zahl(3),
    stunde: zahl(4),
    minute: zahl(5),
    sekunde: zahl(6),
  };

  if (zeit.monat < 1 || zeit.monat > 12 || zeit.tag < 1 || zeit.tag > 31) {
    return undefined;
  }

  // Der Bruchteil steht entweder als eigenes Feld in der Datei oder
  // haengt schon an der Zeitangabe.
  return { zeit, bruchteil: bruchteilAusZiffern(subsec ?? treffer[7]) };
}

/** Wertet die Antwort von `exiftool` zu einer Datei aus. */
export function deuteTags(tags: Readonly<Record<string, unknown>>): AufnahmeErgebnis {
  const hinweise = [...textliste(tags.Error), ...textliste(tags.Warning)];
  const schwer = schwererHinweis(hinweise);
  if (schwer !== undefined) {
    return { art: 'beschaedigt', grund: schwer };
  }

  const angabe = text(tags.DateTimeOriginal) ?? text(tags.CreateDate);
  if (angabe === undefined) {
    return { art: 'keineZeit' };
  }

  const zerlegt = zerlegeZeitangabe(angabe, text(tags.SubSecTimeOriginal));
  if (zerlegt === undefined) {
    return { art: 'keineZeit' };
  }

  return { art: 'gelesen', zeit: zerlegt.zeit, bruchteil: zerlegt.bruchteil };
}

function zahl(wert: unknown): number | undefined {
  if (typeof wert === 'number') {
    return Number.isFinite(wert) ? wert : undefined;
  }

  // Ein leeres Feld ist keine Null: `Number('')` waere 0 und wuerde eine
  // Koordinate auf den Nullmeridian setzen.
  const geschrieben = text(wert)?.trim();
  if (geschrieben === undefined || geschrieben === '') {
    return undefined;
  }

  const gelesen = Number(geschrieben);
  return Number.isFinite(gelesen) ? gelesen : undefined;
}

/** Erster nicht leerer Text aus mehreren Feldern; `undefined`, wenn keines steht. */
function erster(...werte: unknown[]): string | undefined {
  for (const wert of werte) {
    const gelesen = text(wert)?.trim();
    if (gelesen !== undefined && gelesen !== '') {
      return gelesen;
    }
  }
  return undefined;
}

/**
 * Vorzeichen aus der Himmelsrichtung: Sueden und Westen sind negativ.
 * Steht die Richtung schon im Wert (so liefert es ein XMP-Sidecar),
 * bleibt der Wert, wie er ist.
 */
function mitRichtung(wert: number | undefined, richtung: string | undefined): number | undefined {
  if (wert === undefined) {
    return undefined;
  }

  const negativ = richtung === 'S' || richtung === 'W';
  return negativ && wert > 0 ? -wert : wert;
}

/** Stichwoerter aus `dc:subject` und den IPTC-Keywords, ohne Doppelte. */
function stichwoerter(tags: Readonly<Record<string, unknown>>): string[] {
  const gelesen = [...textliste(tags.Subject), ...textliste(tags.Keywords)]
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag !== '');

  return [...new Set(gelesen)];
}

/**
 * Wertet die Angaben-Antwort von `exiftool` aus. Eine Bewertung von 0
 * bedeutet "nicht bewertet" und wird deshalb nicht uebernommen.
 */
export function deuteAngaben(tags: Readonly<Record<string, unknown>>): GeleseneAngaben {
  const bewertung = zahl(tags.Rating);

  return {
    bewertung: bewertung === undefined || bewertung <= 0 ? undefined : bewertung,
    farbmarkierung: erster(tags.Label),
    stichwoerter: stichwoerter(tags),
    titel: erster(tags.Title, tags.ObjectName),
    beschreibung: erster(tags.Description, tags['Caption-Abstract'], tags.ImageDescription),
    gpsBreite: mitRichtung(zahl(tags.GPSLatitude), erster(tags.GPSLatitudeRef)),
    gpsLaenge: mitRichtung(zahl(tags.GPSLongitude), erster(tags.GPSLongitudeRef)),
  };
}

/**
 * Leser auf Basis von `exiftool`. Haelt einen `exiftool`-Prozess offen,
 * solange gelesen wird — das ist bei vielen Dateien um Groessenordnungen
 * schneller als ein Prozess je Datei.
 */
export function exiftoolLeser(): MetadatenLeser & AngabenLeser {
  const exiftool = new ExifTool({ maxProcs: 1 });

  return {
    async leseAufnahmezeit(pfad: string): Promise<AufnahmeErgebnis> {
      let tags: Readonly<Record<string, unknown>>;
      try {
        tags = await exiftool.readRaw(pfad, TAGS);
      } catch (fehler) {
        return { art: 'beschaedigt', grund: (fehler as Error).message };
      }

      return deuteTags(tags);
    },

    async leseAngaben(pfad: string): Promise<GeleseneAngaben> {
      try {
        return deuteAngaben(await exiftool.readRaw(pfad, ANGABEN_TAGS));
      } catch {
        // Eine Datei, die `exiftool` nicht lesen kann, hat fuer den Index
        // eben keine Angaben. Dass sie sich veraendert hat, meldet der
        // Abgleich ueber ihre Pruefsumme, nicht hierueber.
        return KEINE_ANGABEN;
      }
    },

    async schliesse(): Promise<void> {
      await exiftool.end();
    },
  };
}
