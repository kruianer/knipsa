/**
 * Der Archiv-Dienst: haelt den Index aktuell und beantwortet, was der
 * Bereich "Archiv" auf der Startseite zeigt.
 *
 * Ein Abgleich laeuft nach jedem Import, stuendlich von selbst und auf
 * Knopfdruck. Er arbeitet im Hintergrund weiter, auch wenn die Seite
 * zugeklappt wird — der Zustand steht im Dienst, nicht im Browser.
 */

import { fuehreAbgleichAus, type AbgleichOptionen } from './abgleich.js';
import {
  ALARM_TEXT,
  type ArchivIndex,
  type ArchivZahlen,
  type FotoAuskunft,
  type ListenArt,
} from './archivindex.js';
import { exiftoolLeser, type AngabenLeser } from './metadaten.js';
import { Sperre, type Vorhaben } from './sperre.js';

/** Stuendlich, wie in req-007 verlangt. */
export const ABGLEICH_TAKT_MS = 60 * 60 * 1000;

/** So viele Zeilen zeigt eine aufgeklappte Liste hoechstens. */
export const LISTEN_GRENZE = 500;

/** Alles, was der Bereich "Archiv" braucht. */
export interface ArchivZustand extends ArchivZahlen {
  /** Vorhaben, das gerade laeuft; `undefined`, wenn nichts laeuft. */
  readonly laufend: Vorhaben | undefined;
}

/** Ein Abgleich, so wie der Dienst ihn ausfuehrt. In Tests ersetzbar. */
export type AbgleichFunktion = (optionen: AbgleichOptionen) => Promise<unknown>;

export interface ArchivDienstOptionen {
  /** Wurzel des Foto-Baums. */
  readonly wurzel: string;
  readonly index: ArchivIndex;
  /** Gemeinsame Sperre mit dem Import; ohne Angabe eine eigene. */
  readonly sperre?: Sperre;
  /** Ersetzt den `exiftool`-Leser; nur fuer Tests. */
  readonly leser?: () => AngabenLeser;
  /** Ersetzt den echten Abgleich; nur fuer Tests. */
  readonly abgleich?: AbgleichFunktion;
  /** Abstand der selbsttaetigen Abgleiche; in Tests kurz. */
  readonly taktMs?: number;
  /**
   * Wird gerufen, wenn ein Abgleich scheitert. Der Dienst bleibt danach
   * benutzbar; ohne diesen Melder bliebe der Fehler unbemerkt.
   */
  readonly meldeFehler?: (fehler: Error) => void;
  /** Uhr; in Tests festgehalten. */
  readonly jetzt?: () => Date;
}

export class ArchivDienst {
  readonly #wurzel: string;
  readonly #index: ArchivIndex;
  readonly #sperre: Sperre;
  readonly #leser: () => AngabenLeser;
  readonly #abgleich: AbgleichFunktion;
  readonly #taktMs: number;
  readonly #meldeFehler: (fehler: Error) => void;
  readonly #jetzt: () => Date;

  #arbeit: Promise<void> | undefined;
  #takt: ReturnType<typeof setInterval> | undefined;

  constructor({
    wurzel,
    index,
    sperre,
    leser,
    abgleich,
    taktMs = ABGLEICH_TAKT_MS,
    meldeFehler,
    jetzt,
  }: ArchivDienstOptionen) {
    this.#wurzel = wurzel;
    this.#index = index;
    this.#sperre = sperre ?? new Sperre();
    this.#leser = leser ?? exiftoolLeser;
    this.#abgleich = abgleich ?? fuehreAbgleichAus;
    this.#taktMs = taktMs;
    this.#meldeFehler = meldeFehler ?? ((): void => {});
    this.#jetzt = jetzt ?? ((): Date => new Date());
  }

  /** Zahlen, letzter Abgleich und was gerade laeuft. */
  async zustand(): Promise<ArchivZustand> {
    return { ...(await this.#index.zahlen()), laufend: this.#sperre.laufend() };
  }

  /** Die Liste hinter einer Zahl. */
  liste(art: ListenArt, grenze = LISTEN_GRENZE): Promise<readonly string[]> {
    return this.#index.liste(art, grenze);
  }

  /**
   * Die Angaben eines Fotos als Text; `undefined`, wenn der Schluessel
   * im Index nicht vorkommt.
   */
  async nachschlagen(schluessel: string): Promise<string | undefined> {
    const auskunft = await this.#index.auskunft(schluessel.trim());
    return auskunft === undefined ? undefined : auskunftText(auskunft);
  }

  /**
   * Startet einen Abgleich. Kehrt sofort zurueck — der Lauf arbeitet im
   * Hintergrund, die Seite fragt den Zustand ab. Laeuft schon ein
   * Vorhaben, wirft die Sperre `VorhabenLaeuft`.
   */
  gleicheAb(): void {
    this.#starte('abgleich');
  }

  /**
   * Verwirft den Index und liest alles neu ein. Fotos und Dateien im
   * Baum bleiben dabei unveraendert.
   */
  baueNeuAuf(): void {
    this.#starte('neuaufbau');
  }

  #starte(vorhaben: Vorhaben): void {
    this.#sperre.nimm(vorhaben);
    this.#arbeit = this.#arbeite(vorhaben === 'neuaufbau');
  }

  async #arbeite(neuAufbauen: boolean): Promise<void> {
    const leser = this.#leser();
    try {
      await this.#abgleich({
        wurzel: this.#wurzel,
        index: this.#index,
        leser,
        neuAufbauen,
        jetzt: this.#jetzt,
      });
    } catch (fehler) {
      // Ein gescheiterter Abgleich darf den Server nicht mitnehmen: der
      // Baum ist unberuehrt, und der naechste Lauf versucht es erneut.
      this.#meldeFehler(fehler as Error);
    } finally {
      await leser.schliesse();
      this.#sperre.gib();
    }
  }

  /**
   * Startet die stuendlichen Abgleiche. Laeuft gerade etwas, wird der
   * Takt uebersprungen statt aufgestaut.
   */
  startePlan(): void {
    if (this.#takt !== undefined) {
      return;
    }

    this.#takt = setInterval(() => {
      if (this.#sperre.laufend() !== undefined) {
        return;
      }

      try {
        this.gleicheAb();
      } catch (fehler) {
        this.#meldeFehler(fehler as Error);
      }
    }, this.#taktMs);

    // Der Takt soll den Prozess nicht am Leben halten.
    this.#takt.unref?.();
  }

  /** Beendet die stuendlichen Abgleiche. */
  stoppePlan(): void {
    if (this.#takt !== undefined) {
      clearInterval(this.#takt);
      this.#takt = undefined;
    }
  }

  /**
   * Das laufende Vorhaben, damit Tests darauf warten koennen. Im Betrieb
   * fragt die Seite statt zu warten den Zustand ab.
   */
  arbeit(): Promise<void> | undefined {
    return this.#arbeit;
  }
}

/** Ein leeres Feld zeigt die Seite als Gedankenstrich. */
const LEER = '—';

function sterne(bewertung: number | undefined): string {
  if (bewertung === undefined) {
    return LEER;
  }

  return bewertung === 1 ? '1 Stern' : `${bewertung} Sterne`;
}

function gps(breite: number | undefined, laenge: number | undefined): string {
  if (breite === undefined || laenge === undefined) {
    return LEER;
  }

  return `${breite}, ${laenge}`;
}

/** Die Angaben eines Fotos als Text, so wie das Nachschlagen sie zeigt. */
export function auskunftText({ foto, dateien, alarme }: FotoAuskunft): string {
  const zustand =
    alarme.length > 0
      ? alarme.map((alarm) => ALARM_TEXT[alarm.art]).join(', ')
      : foto.vermisst
        ? 'vermisst'
        : 'normal';

  const zeilen = [
    `Schlüssel: ${foto.schluessel}`,
    `Aufnahmezeit: ${foto.aufnahmezeit}`,
    `Bewertung: ${sterne(foto.bewertung)}`,
    `Farbmarkierung: ${foto.farbmarkierung ?? LEER}`,
    `Stichwörter: ${foto.stichwoerter.length === 0 ? LEER : foto.stichwoerter.join(', ')}`,
    `Titel: ${foto.titel ?? LEER}`,
    `Beschreibung: ${foto.beschreibung ?? LEER}`,
    `GPS: ${gps(foto.gpsBreite, foto.gpsLaenge)}`,
    `Zustand: ${zustand}`,
    'Dateien:',
  ];

  if (dateien.length === 0) {
    zeilen.push(`  ${LEER}`);
  }
  for (const datei of [...dateien].sort((a, b) => (a.pfad < b.pfad ? -1 : 1))) {
    const sidecar = datei.sidecar === undefined ? '' : ` (Sidecar: ${datei.sidecar})`;
    zeilen.push(`  ${datei.pfad} — ${datei.groesse} Bytes${sidecar}`);
  }

  return `${zeilen.join('\n')}\n`;
}
