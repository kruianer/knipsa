/**
 * Gesehen-Liste: jede je importierte Datei mit ihrer Import-Pruefsumme
 * und ihrem Schluessel, dazu je Schluessel die Bild-Pruefsumme vom
 * ersten Einlesen.
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

/**
 * Die Bild-Pruefsumme eines Schluessels, beim ersten Einlesen vermerkt
 * und nie geaendert (req-007). Sie steht in derselben Liste wie die
 * importierten Dateien, weil auch sie sich aus dem Baum nicht wieder
 * herstellen laesst, sobald ein Original veraendert wurde.
 */
export interface BildEintrag {
  readonly schluessel: string;
  readonly bildPruefsumme: string;
  /** Zeitpunkt des ersten Einlesens, ISO-8601. */
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

function istBildEintrag(wert: unknown): wert is BildEintrag {
  if (typeof wert !== 'object' || wert === null) {
    return false;
  }

  const satz = wert as Record<string, unknown>;
  return typeof satz.schluessel === 'string' && typeof satz.bildPruefsumme === 'string';
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

  /** Schluessel -> Import-Pruefsummen seiner Dateien. */
  readonly #summenJeSchluessel = new Map<string, Set<string>>();

  /** Schluessel -> Bild-Pruefsumme beim ersten Einlesen. */
  readonly #bildSummen = new Map<string, string>();

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
      } else if (istBildEintrag(gelesen)) {
        liste.#uebernehmeBild(gelesen);
      }
    }

    return liste;
  }

  #uebernehme(eintrag: GesehenEintrag): void {
    if (!this.#nachPruefsumme.has(eintrag.pruefsumme)) {
      this.#nachPruefsumme.set(eintrag.pruefsumme, eintrag);
    }

    const summen = this.#summenJeSchluessel.get(eintrag.schluessel) ?? new Set<string>();
    summen.add(eintrag.pruefsumme);
    this.#summenJeSchluessel.set(eintrag.schluessel, summen);

    this.belegeSchluessel(eintrag.schluessel);
  }

  #uebernehmeBild(eintrag: BildEintrag): void {
    // Die erste vermerkte Bild-Pruefsumme gilt; spaetere Zeilen zum
    // selben Schluessel aendern sie nicht.
    if (!this.#bildSummen.has(eintrag.schluessel)) {
      this.#bildSummen.set(eintrag.schluessel, eintrag.bildPruefsumme);
    }
    this.belegeSchluessel(eintrag.schluessel);
  }

  /** Der Eintrag zu dieser Pruefsumme, falls die Datei schon bekannt ist. */
  kennt(pruefsumme: string): GesehenEintrag | undefined {
    return this.#nachPruefsumme.get(pruefsumme);
  }

  /**
   * Jeder Schluessel, der je vergeben wurde — auch wenn die Datei dazu
   * inzwischen fehlt. Daraus weiss der Abgleich, welche Fotos vermisst
   * werden (req-007).
   */
  alleSchluessel(): string[] {
    const schluessel: string[] = [];
    for (const eintrag of this.#nachPruefsumme.values()) {
      schluessel.push(eintrag.schluessel);
    }

    return [...new Set(schluessel)].sort();
  }

  /**
   * Die Import-Pruefsummen aller Dateien, die je unter diesem Schluessel
   * importiert wurden. Daran erkennt der Abgleich eine veraenderte NEF.
   */
  importPruefsummenZu(schluessel: string): ReadonlySet<string> {
    return this.#summenJeSchluessel.get(schluessel) ?? new Set<string>();
  }

  /** Die vermerkte Bild-Pruefsumme eines Schluessels, falls es eine gibt. */
  bildPruefsumme(schluessel: string): string | undefined {
    return this.#bildSummen.get(schluessel);
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

    await this.#haengeAn(eintraege);

    for (const eintrag of eintraege) {
      this.#uebernehme(eintrag);
    }
  }

  /**
   * Vermerkt die Bild-Pruefsumme eines Schluessels. Steht schon eine da,
   * bleibt sie — sie ist die Referenz und wird nie geaendert (req-007).
   */
  async merkeBildPruefsumme(
    schluessel: string,
    bildPruefsumme: string,
    zeitpunkt: string,
  ): Promise<void> {
    if (this.#bildSummen.has(schluessel)) {
      return;
    }

    const eintrag: BildEintrag = { schluessel, bildPruefsumme, zeitpunkt };
    await this.#haengeAn([eintrag]);
    this.#uebernehmeBild(eintrag);
  }

  /**
   * Haengt Zeilen an die Liste an und sichert sie auf die Platte. Die
   * Liste wird nur ergaenzt, nie neu geschrieben.
   */
  async #haengeAn(eintraege: readonly (GesehenEintrag | BildEintrag)[]): Promise<void> {
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
  }
}
