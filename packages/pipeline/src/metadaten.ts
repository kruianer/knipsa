/**
 * Aufnahmezeit aus der Datei lesen, ueber `exiftool`.
 *
 * Gelesen wird genau das, was in der Datei steht: keine Zeitzone, keine
 * Umrechnung, keine Schaetzung aus Dateidatum oder Dateinamen. Fehlt die
 * Aufnahmezeit oder ist die Datei beschaedigt, ist das ein Problemfall —
 * geraten wird nie (siehe `delivery/vision.md`).
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

/** Tags, die gelesen werden — mehr braucht req-005 nicht. */
const TAGS = [
  '-DateTimeOriginal',
  '-SubSecTimeOriginal',
  '-CreateDate',
  '-Warning',
  '-Error',
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

/**
 * Leser auf Basis von `exiftool`. Haelt einen `exiftool`-Prozess offen,
 * solange gelesen wird — das ist bei vielen Dateien um Groessenordnungen
 * schneller als ein Prozess je Datei.
 */
export function exiftoolLeser(): MetadatenLeser {
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

    async schliesse(): Promise<void> {
      await exiftool.end();
    },
  };
}
