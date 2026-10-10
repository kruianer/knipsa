/**
 * Gesehen-Liste: jede je importierte Datei mit ihrer Import-Pruefsumme
 * und ihrem Schluessel.
 *
 * Die Liste ist der einzige Ort, der sich NICHT aus dem Foto-Baum neu
 * aufbauen laesst — deshalb wird sie nur ergaenzt, nie neu geschrieben
 * und nie aufgeraeumt. Sie liegt als JSON-Zeilen im Foto-Baum und wird
 * mit ihm gesichert (siehe `delivery/security.md`).
 */

import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { gesehenDatei, zerlegeSchluessel, type SekundenTeil } from '@knipsa/shared';

/** Ein Eintrag der Gesehen-Liste. */
export interface GesehenEintrag {
  /** Import-Pruefsumme der ganzen Datei; wird nie aktualisiert. */
  readonly pruefsumme: string;
  /** Schluessel, unter dem die Datei im Baum liegt. */
  readonly schluessel: string;
  /** Name der Quelle, aus der sie kam. */
  readonly quelle: string;
  /** Ordner in der Quelle, relativ zur Quellwurzel (`''` fuer die Wurzel). */
  readonly ordner: string;
  /** Urspruenglicher Dateiname. */
  readonly dateiname: string;
  /** Zeitpunkt des Imports, ISO-8601. */
  readonly zeitpunkt: string;
}

function istEintrag(wert: unknown): wert is GesehenEintrag {
  if (typeof wert !== 'object' || wert === null) {
    return false;
  }

  const satz = wert as Record<string, unknown>;
  return (
    typeof satz.pruefsumme === 'string' &&
    typeof satz.schluessel === 'string' &&
    typeof satz.quelle === 'string' &&
    typeof satz.ordner === 'string' &&
    typeof satz.dateiname === 'string' &&
    typeof satz.zeitpunkt === 'string'
  );
}

/**
 * Die geladene Gesehen-Liste. Sie beantwortet zwei Fragen: "kenne ich
 * diese Datei schon?" und "welcher Buchstabe ist in dieser Sekunde der
 * naechste freie?".
 */
export class GesehenListe {
  /** Pruefsumme -> erster Eintrag mit dieser Pruefsumme. */
  readonly #nachPruefsumme = new Map<string, GesehenEintrag>();

  /** Sekundenteil -> schon vergebene Plaetze. */
  readonly #plaetze = new Map<SekundenTeil, Set<number>>();

  private constructor(readonly wurzel: string) {}

  /**
   * Liest die Liste aus dem Foto-Baum. Fehlt die Datei, ist die Liste
   * leer. Eine unvollstaendige letzte Zeile (Absturz mitten im Schreiben)
   * wird uebergangen.
   */
  static async lade(wurzel: string): Promise<GesehenListe> {
    const liste = new GesehenListe(wurzel);

    let inhalt: string;
    try {
      inhalt = await readFile(gesehenDatei(wurzel), 'utf8');
    } catch {
      return liste;
    }

    for (const zeile of inhalt.split('\n')) {
      if (zeile.trim() === '') {
        continue;
      }

      let gelesen: unknown;
      try {
        gelesen = JSON.parse(zeile);
      } catch {
        continue;
      }

      if (istEintrag(gelesen)) {
        liste.#uebernehme(gelesen);
      }
    }

    return liste;
  }

  #uebernehme(eintrag: GesehenEintrag): void {
    if (!this.#nachPruefsumme.has(eintrag.pruefsumme)) {
      this.#nachPruefsumme.set(eintrag.pruefsumme, eintrag);
    }
    this.belegeSchluessel(eintrag.schluessel);
  }

  /** Der Eintrag zu dieser Pruefsumme, falls die Datei schon bekannt ist. */
  kennt(pruefsumme: string): GesehenEintrag | undefined {
    return this.#nachPruefsumme.get(pruefsumme);
  }

  /**
   * Merkt einen Schluessel als vergeben, ohne ihn in die Liste zu
   * schreiben. Waehrend eines Laufs sind Schluessel damit schon belegt,
   * bevor die Datei fertig kopiert ist — vergeben wird keiner zweimal.
   */
  belegeSchluessel(schluessel: string): void {
    const zerlegt = zerlegeSchluessel(schluessel);
    if (zerlegt === undefined) {
      return;
    }

    const plaetze = this.#plaetze.get(zerlegt.sekundenTeil) ?? new Set<number>();
    plaetze.add(zerlegt.platz);
    this.#plaetze.set(zerlegt.sekundenTeil, plaetze);
  }

  /** `true`, wenn dieser Schluessel im Archiv schon vergeben ist. */
  istSchluesselVergeben(schluessel: string): boolean {
    const zerlegt = zerlegeSchluessel(schluessel);
    return (
      zerlegt !== undefined &&
      (this.#plaetze.get(zerlegt.sekundenTeil)?.has(zerlegt.platz) ?? false)
    );
  }

  /**
   * Naechster freier Platz in dieser Sekunde. Vergebene Plaetze werden
   * nie wiederverwendet, auch wenn die Datei spaeter verschwindet.
   */
  naechsterPlatz(teil: SekundenTeil): number {
    const vergeben = this.#plaetze.get(teil);
    let platz = 0;
    while (vergeben?.has(platz) === true) {
      platz += 1;
    }
    return platz;
  }

  /**
   * Haengt Eintraege an die Liste an und sichert sie auf die Platte.
   * Erst danach gilt eine Datei als importiert.
   */
  async ergaenze(eintraege: readonly GesehenEintrag[]): Promise<void> {
    if (eintraege.length === 0) {
      return;
    }

    const pfad = gesehenDatei(this.wurzel);
    await mkdir(dirname(pfad), { recursive: true });

    const zeilen = eintraege.map((eintrag) => `${JSON.stringify(eintrag)}\n`).join('');
    const datei = await open(pfad, 'a');
    try {
      await datei.write(zeilen);
      await datei.sync();
    } finally {
      await datei.close();
    }

    for (const eintrag of eintraege) {
      this.#uebernehme(eintrag);
    }
  }
}
