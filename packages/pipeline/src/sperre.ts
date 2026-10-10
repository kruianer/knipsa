/**
 * Die Sperre: Import, Abgleich und Neuaufbau laufen nie gleichzeitig.
 *
 * Alle drei arbeiten am selben Foto-Baum und an derselben Gesehen-Liste.
 * Gleichzeitig wuerden sie sich halbe Staende zeigen — deshalb haelt
 * immer nur einer die Sperre, und wer sie nicht bekommt, erfaehrt im
 * Klartext, wer gerade arbeitet.
 */

/** Was die Sperre halten kann. */
export type Vorhaben = 'import' | 'abgleich' | 'neuaufbau';

/** Wortlaut der Vorhaben auf der Seite. */
export const VORHABEN_TEXT: Record<Vorhaben, string> = {
  import: 'Import',
  abgleich: 'Abgleich',
  neuaufbau: 'Neuaufbau',
};

/** Ein anderes Vorhaben laeuft noch. */
export class VorhabenLaeuft extends Error {
  constructor(readonly laufend: Vorhaben) {
    super(`${VORHABEN_TEXT[laufend]} läuft — bitte warten`);
    this.name = 'VorhabenLaeuft';
  }
}

export class Sperre {
  #laufend: Vorhaben | undefined;

  /** Wer die Sperre gerade haelt; `undefined`, wenn nichts laeuft. */
  laufend(): Vorhaben | undefined {
    return this.#laufend;
  }

  /** Nimmt die Sperre; wirft `VorhabenLaeuft`, wenn schon etwas laeuft. */
  nimm(vorhaben: Vorhaben): void {
    if (this.#laufend !== undefined) {
      throw new VorhabenLaeuft(this.#laufend);
    }

    this.#laufend = vorhaben;
  }

  /** Gibt die Sperre frei. */
  gib(): void {
    this.#laufend = undefined;
  }
}
