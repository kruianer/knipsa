/**
 * Der Import-Dienst: haelt die Quellen-Liste, startet Laeufe und weiss,
 * ob gerade einer laeuft.
 *
 * Quellen sind die eingestellten Ordner aus `IMPORT_QUELLEN` (req-005)
 * und die gerade eingesteckten Datentraeger (req-006). Die Datentraeger
 * werden bei jeder Abfrage frisch nachgesehen: ein nach dem Start von
 * Knipsa eingesteckter erscheint damit ohne Neustart der App.
 *
 * Es laeuft immer nur ein Import gleichzeitig. Der Fortschritt steht im
 * Dienst, nicht im Browser — ein Neuladen der Seite zeigt ihn deshalb
 * unveraendert weiter.
 */

import { stat } from 'node:fs/promises';

import type { QuellenEinstellung } from '@knipsa/shared';

import { findeDatentraeger, istEingehaengt, type Datentraeger } from './datentraeger.js';
import {
  fuehreLaufAus,
  type AbbruchGrund,
  type Fortschritt,
  type LaufErgebnis,
  type Quelle,
  type QuellenArt,
} from './importlauf.js';
import { ladeLaeufe, merkeLauf } from './laeufe.js';
import { exiftoolLeser, type MetadatenLeser } from './metadaten.js';
import { ordnerPfad, pruefeOrdner, zeigeOrdner, type OrdnerAnsicht } from './ordnerbaum.js';

/** Eine Quelle, wie die Seite sie zeigt. */
export interface QuellenZustand {
  readonly name: string;
  /** Beschriftung auf der Seite; bei Datentraegern mit Groesse. */
  readonly anzeige: string;
  readonly art: QuellenArt;
  readonly verfuegbar: boolean;
}

/** Der laufende Import. */
export interface LaufenderImport {
  readonly quelle: string;
  /** Ordner, auf den der Lauf begrenzt ist; fehlt bei der ganzen Quelle. */
  readonly ordner?: string;
  readonly begonnen: string;
  readonly erledigt: number;
  readonly gesamt: number;
  /**
   * Gesetzt, sobald abgebrochen wird. Der Lauf arbeitet dann noch die
   * aktuelle Datei fertig.
   */
  readonly abbruch?: AbbruchGrund;
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

/** Es laeuft kein Import — es gibt nichts abzubrechen. */
export class KeinImportLaeuft extends Error {
  constructor() {
    super('Kein Import läuft');
    this.name = 'KeinImportLaeuft';
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
  readonly quelle: Quelle;
  readonly ordner: string;
  readonly leser: MetadatenLeser;
  readonly abbruch: () => Promise<AbbruchGrund | undefined>;
  readonly melde: (fortschritt: Fortschritt) => void;
}) => Promise<LaufErgebnis>;

/** Angaben zum Start eines Laufs. */
export interface StartOptionen {
  /** Ordner in der Quelle samt Unterordnern; ohne Angabe die ganze Quelle. */
  readonly ordner?: string;
  /** Uhr; in Tests festgehalten. */
  readonly jetzt?: () => Date;
}

/** Eine Quelle samt ihrer Beschriftung auf der Seite. */
interface AngeboteneQuelle extends Quelle {
  readonly anzeige: string;
}

export interface ImportDienstOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  readonly quellen: readonly QuellenEinstellung[];
  /**
   * Ordner, unter dem eingesteckte Datentraeger eingehaengt erscheinen
   * (`DATENTRAEGER_PFAD`). Leer oder nicht gesetzt: keine Datentraeger.
   */
  readonly datentraegerPfad?: string;
  /** Ersetzt das Nachsehen der Datentraeger; nur fuer Tests. */
  readonly datentraeger?: () => Promise<readonly Datentraeger[]>;
  /** Ersetzt die Pruefung des Einhaengepunkts; nur fuer Tests. */
  readonly eingehaengt?: (pfad: string) => Promise<boolean>;
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
  readonly #datentraeger: () => Promise<readonly Datentraeger[]>;
  readonly #eingehaengt: (pfad: string) => Promise<boolean>;
  readonly #lauf: LaufFunktion;
  readonly #leser: () => MetadatenLeser;
  readonly #meldeFehler: (fehler: Error) => void;

  #laufend: LaufenderImport | undefined;
  #arbeit: Promise<void> | undefined;
  #abbruch: AbbruchGrund | undefined;

  constructor({
    wurzel,
    quellen,
    datentraegerPfad = '',
    datentraeger,
    eingehaengt,
    lauf,
    leser,
    meldeFehler,
  }: ImportDienstOptionen) {
    this.#wurzel = wurzel;
    this.#quellen = quellen;
    this.#datentraeger =
      datentraeger ?? ((): Promise<Datentraeger[]> => findeDatentraeger(datentraegerPfad));
    this.#eingehaengt = eingehaengt ?? istEingehaengt;
    this.#lauf = lauf ?? fuehreLaufAus;
    this.#leser = leser ?? exiftoolLeser;
    this.#meldeFehler = meldeFehler ?? ((): void => {});
  }

  /**
   * Alle Quellen, die die Seite anbietet: erst die eingestellten Ordner,
   * dann die gerade eingesteckten Datentraeger. Ein Datentraeger, dessen
   * Bezeichnung schon als Ordner-Quelle eingestellt ist, bleibt aussen
   * vor — sonst waere der Name auf der Seite nicht mehr eindeutig.
   */
  async #alleQuellen(): Promise<AngeboteneQuelle[]> {
    const ordner: AngeboteneQuelle[] = this.#quellen.map((quelle) => ({
      ...quelle,
      art: 'ordner',
      anzeige: quelle.name,
    }));

    const traeger: AngeboteneQuelle[] = (await this.#datentraeger())
      .filter((gefunden) => !ordner.some((quelle) => quelle.name === gefunden.name))
      .map((gefunden) => ({
        name: gefunden.name,
        pfad: gefunden.pfad,
        art: 'datentraeger',
        anzeige: gefunden.anzeige,
      }));

    return [...ordner, ...traeger];
  }

  /** Zustand der Seite: Quellen, laufender Import, letzte Laeufe. */
  async zustand(): Promise<ImportZustand> {
    const quellen = await Promise.all(
      (await this.#alleQuellen()).map(async (quelle) => ({
        name: quelle.name,
        anzeige: quelle.anzeige,
        art: quelle.art,
        verfuegbar: await istVerzeichnisLesbar(quelle.pfad),
      })),
    );

    return { quellen, laufend: this.#laufend, laeufe: await ladeLaeufe(this.#wurzel) };
  }

  /** Die Quelle mit diesem Namen, erreichbar und bereit fuer einen Lauf. */
  async #bereiteQuelle(name: string): Promise<AngeboteneQuelle> {
    const quelle = (await this.#alleQuellen()).find((eintrag) => eintrag.name === name);
    if (quelle === undefined) {
      throw new UnbekannteQuelle(name);
    }
    if (!(await istVerzeichnisLesbar(quelle.pfad))) {
      throw new QuelleNichtVerfuegbar(name);
    }

    return quelle;
  }

  /**
   * Eine Ebene der Ordner-Auswahl einer Quelle: die Ordner darin, je mit
   * Name und Anzahl Dateien.
   */
  async ordner(name: string, ordner = ''): Promise<OrdnerAnsicht> {
    const quelle = await this.#bereiteQuelle(name);
    return zeigeOrdner(quelle.pfad, ordner);
  }

  /**
   * Startet einen Lauf. Kehrt sofort zurueck — der Lauf arbeitet im
   * Hintergrund weiter, die Seite fragt den Fortschritt ab. Mit `ordner`
   * umfasst der Lauf nur diesen Ordner samt Unterordnern.
   */
  async starte(
    name: string,
    { ordner = '', jetzt = () => new Date() }: StartOptionen = {},
  ): Promise<void> {
    if (this.#laufend !== undefined) {
      throw new ImportLaeuftBereits();
    }

    const quelle = await this.#bereiteQuelle(name);

    // Ein Ordner, den es in der Quelle nicht gibt, soll den Lauf nicht
    // erst im Hintergrund scheitern lassen.
    const begrenzt = pruefeOrdner(ordner);
    if (begrenzt !== '') {
      await ordnerPfad(quelle.pfad, begrenzt);
    }

    this.#abbruch = undefined;
    this.#laufend = {
      quelle: quelle.name,
      ...(begrenzt === '' ? {} : { ordner: begrenzt }),
      begonnen: jetzt().toISOString(),
      erledigt: 0,
      gesamt: 0,
    };

    this.#arbeit = this.#arbeite(quelle, begrenzt);
  }

  /**
   * Bricht den laufenden Import ab. Der Lauf endet nach der gerade
   * bearbeiteten Datei; alles bis dahin bleibt importiert.
   */
  brecheAb(grund: AbbruchGrund = 'nutzer'): void {
    if (this.#laufend === undefined) {
      throw new KeinImportLaeuft();
    }

    this.#abbruch = grund;
    // Die Seite soll sofort sehen, dass abgebrochen wird — auch wenn der
    // Lauf noch an der aktuellen Datei arbeitet.
    this.#laufend = { ...this.#laufend, abbruch: grund };
  }

  /**
   * Antwort auf die Frage des Laufs, ob er weitermachen soll. Bei einem
   * Datentraeger wird dabei nachgesehen, ob er noch steckt: wird er
   * waehrend des Laufs herausgezogen, endet der Lauf als "abgebrochen —
   * Datenträger entfernt".
   */
  async #abbruchGrund(quelle: Quelle): Promise<AbbruchGrund | undefined> {
    if (this.#abbruch !== undefined || quelle.art !== 'datentraeger') {
      return this.#abbruch;
    }

    if (!(await this.#eingehaengt(quelle.pfad)) && this.#laufend !== undefined) {
      this.brecheAb('entfernt');
    }

    return this.#abbruch;
  }

  async #arbeite(quelle: Quelle, ordner: string): Promise<void> {
    const leser = this.#leser();
    try {
      const ergebnis = await this.#lauf({
        wurzel: this.#wurzel,
        quelle,
        ordner,
        leser,
        abbruch: () => this.#abbruchGrund(quelle),
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
      this.#abbruch = undefined;
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
