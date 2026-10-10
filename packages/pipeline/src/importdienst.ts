/**
 * Der Import-Dienst: haelt die Quellen-Liste, startet Laeufe und weiss,
 * ob gerade einer laeuft.
 *
 * Es laeuft immer nur ein Import gleichzeitig. Der Fortschritt steht im
 * Dienst, nicht im Browser — ein Neuladen der Seite zeigt ihn deshalb
 * unveraendert weiter.
 */

import { stat } from 'node:fs/promises';

import type { QuellenEinstellung } from '@knipsa/shared';

import { fuehreLaufAus, type Fortschritt, type LaufErgebnis } from './importlauf.js';
import { ladeLaeufe, merkeLauf } from './laeufe.js';
import { exiftoolLeser, type MetadatenLeser } from './metadaten.js';

/** Eine Quelle, wie die Seite sie zeigt. */
export interface QuellenZustand {
  readonly name: string;
  readonly verfuegbar: boolean;
}

/** Der laufende Import. */
export interface LaufenderImport {
  readonly quelle: string;
  readonly begonnen: string;
  readonly erledigt: number;
  readonly gesamt: number;
}

/** Alles, was die Seite "Import" braucht. */
export interface ImportZustand {
  readonly quellen: readonly QuellenZustand[];
  readonly laufend: LaufenderImport | undefined;
  readonly laeufe: readonly LaufErgebnis[];
}

/** Es laeuft schon ein Import — ein zweiter wird nicht gestartet. */
export class ImportLaeuftBereits extends Error {
  constructor() {
    super('Import läuft bereits');
    this.name = 'ImportLaeuftBereits';
  }
}

/** Diese Quelle ist nicht eingestellt. */
export class UnbekannteQuelle extends Error {
  constructor(readonly quelle: string) {
    super('Quelle nicht bekannt');
    this.name = 'UnbekannteQuelle';
  }
}

/** Die Quelle ist eingestellt, aber gerade nicht erreichbar. */
export class QuelleNichtVerfuegbar extends Error {
  constructor(readonly quelle: string) {
    super('Quelle nicht verfügbar');
    this.name = 'QuelleNichtVerfuegbar';
  }
}

/** Ein Lauf, so wie der Dienst ihn ausfuehrt. In Tests ersetzbar. */
export type LaufFunktion = (auftrag: {
  readonly wurzel: string;
  readonly quelle: QuellenEinstellung;
  readonly leser: MetadatenLeser;
  readonly melde: (fortschritt: Fortschritt) => void;
}) => Promise<LaufErgebnis>;

export interface ImportDienstOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  readonly quellen: readonly QuellenEinstellung[];
  /** Ersetzt den echten Lauf; nur fuer Tests. */
  readonly lauf?: LaufFunktion;
  /** Ersetzt den `exiftool`-Leser; nur fuer Tests. */
  readonly leser?: () => MetadatenLeser;
  /**
   * Wird gerufen, wenn ein Lauf abbricht. Der Dienst bleibt danach
   * benutzbar; ohne diesen Melder bliebe der Fehler unbemerkt.
   */
  readonly meldeFehler?: (fehler: Error) => void;
}

/** `true`, wenn der Pfad ein lesbares Verzeichnis ist. */
async function istVerzeichnisLesbar(pfad: string): Promise<boolean> {
  try {
    return (await stat(pfad)).isDirectory();
  } catch {
    return false;
  }
}

export class ImportDienst {
  readonly #wurzel: string;
  readonly #quellen: readonly QuellenEinstellung[];
  readonly #lauf: LaufFunktion;
  readonly #leser: () => MetadatenLeser;
  readonly #meldeFehler: (fehler: Error) => void;

  #laufend: LaufenderImport | undefined;
  #arbeit: Promise<void> | undefined;

  constructor({ wurzel, quellen, lauf, leser, meldeFehler }: ImportDienstOptionen) {
    this.#wurzel = wurzel;
    this.#quellen = quellen;
    this.#lauf = lauf ?? fuehreLaufAus;
    this.#leser = leser ?? exiftoolLeser;
    this.#meldeFehler = meldeFehler ?? ((): void => {});
  }

  /** Zustand der Seite: Quellen, laufender Import, letzte Laeufe. */
  async zustand(): Promise<ImportZustand> {
    const quellen = await Promise.all(
      this.#quellen.map(async (quelle) => ({
        name: quelle.name,
        verfuegbar: await istVerzeichnisLesbar(quelle.pfad),
      })),
    );

    return { quellen, laufend: this.#laufend, laeufe: await ladeLaeufe(this.#wurzel) };
  }

  /**
   * Startet einen Lauf. Kehrt sofort zurueck — der Lauf arbeitet im
   * Hintergrund weiter, die Seite fragt den Fortschritt ab.
   */
  async starte(name: string, jetzt: () => Date = () => new Date()): Promise<void> {
    if (this.#laufend !== undefined) {
      throw new ImportLaeuftBereits();
    }

    const quelle = this.#quellen.find((eintrag) => eintrag.name === name);
    if (quelle === undefined) {
      throw new UnbekannteQuelle(name);
    }
    if (!(await istVerzeichnisLesbar(quelle.pfad))) {
      throw new QuelleNichtVerfuegbar(name);
    }

    this.#laufend = {
      quelle: quelle.name,
      begonnen: jetzt().toISOString(),
      erledigt: 0,
      gesamt: 0,
    };

    this.#arbeit = this.#arbeite(quelle);
  }

  async #arbeite(quelle: QuellenEinstellung): Promise<void> {
    const leser = this.#leser();
    try {
      const ergebnis = await this.#lauf({
        wurzel: this.#wurzel,
        quelle,
        leser,
        melde: (fortschritt) => {
          if (this.#laufend !== undefined) {
            this.#laufend = { ...this.#laufend, ...fortschritt };
          }
        },
      });

      await merkeLauf(this.#wurzel, ergebnis);
    } catch (fehler) {
      // Ein gescheiterter Lauf darf den Server nicht mitnehmen. Was
      // bereits uebernommen wurde, bleibt gueltig: es steht geprueft im
      // Baum und in der Gesehen-Liste.
      this.#meldeFehler(fehler as Error);
    } finally {
      await leser.schliesse();
      this.#laufend = undefined;
    }
  }

  /**
   * Das laufende Vorhaben, damit Tests darauf warten koennen. Im Betrieb
   * fragt die Seite statt zu warten den Fortschritt ab.
   */
  arbeit(): Promise<void> | undefined {
    return this.#arbeit;
  }
}
