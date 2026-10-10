/**
 * Schluessel eines Fotos: `JJJJMMTT-HHMMSS` aus der in der Datei
 * gespeicherten Aufnahmezeit plus Buchstabe.
 *
 * Die Aufnahmezeit wird NIE umgerechnet — keine Zeitzone, keine
 * Sommerzeit. Der Sekundenteil ist genau das, was in der Datei steht.
 * Der Buchstabe unterscheidet Fotos derselben Sekunde: `a`-`z`, danach
 * `za`, `zb`, ... bis `zz`, danach `zza` usw.
 */

const BUCHSTABEN = 'abcdefghijklmnopqrstuvwxyz';

/** Letzter Buchstabe; ab dem 27. Foto einer Sekunde das Praefix. */
const UEBERLAUF = 'z';

/** `JJJJMMTT-HHMMSS` — der Teil des Schluessels ohne Buchstaben. */
export type SekundenTeil = string;

const SEKUNDEN_TEIL = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

const SCHLUESSEL = /^(\d{8}-\d{6})(z*[a-z])$/;

/** Aufnahmezeit, wie sie in der Datei steht — ohne Zeitzone. */
export interface Aufnahmezeit {
  readonly jahr: number;
  readonly monat: number;
  readonly tag: number;
  readonly stunde: number;
  readonly minute: number;
  readonly sekunde: number;
}

function zweistellig(wert: number): string {
  return String(wert).padStart(2, '0');
}

/** Baut `JJJJMMTT-HHMMSS` aus einer Aufnahmezeit. */
export function sekundenTeil(zeit: Aufnahmezeit): SekundenTeil {
  const datum = `${String(zeit.jahr).padStart(4, '0')}${zweistellig(zeit.monat)}${zweistellig(zeit.tag)}`;
  const uhrzeit = `${zweistellig(zeit.stunde)}${zweistellig(zeit.minute)}${zweistellig(zeit.sekunde)}`;
  return `${datum}-${uhrzeit}`;
}

/** `true`, wenn der Text die Form `JJJJMMTT-HHMMSS` hat. */
export function istSekundenTeil(text: string): boolean {
  return SEKUNDEN_TEIL.test(text);
}

/**
 * Buchstabe zum Platz innerhalb einer Sekunde: 0 ist `a`, 25 ist `z`,
 * 26 ist `za`, 51 ist `zz`, 52 ist `zza`.
 */
export function buchstabe(platz: number): string {
  if (!Number.isInteger(platz) || platz < 0) {
    throw new Error(`Platz ${platz} ist keine Zahl ab 0`);
  }

  if (platz < BUCHSTABEN.length) {
    return BUCHSTABEN[platz] as string;
  }

  return UEBERLAUF + buchstabe(platz - BUCHSTABEN.length);
}

/** Umkehrung von `buchstabe`; `undefined`, wenn der Text kein Buchstabe ist. */
export function platzVonBuchstabe(text: string): number | undefined {
  if (!/^z*[a-z]$/.test(text)) {
    return undefined;
  }

  const rest = text.slice(0, -1);
  const letzter = BUCHSTABEN.indexOf(text.slice(-1));

  // Fuehrende `z` sind Ueberlauf-Praefixe, je eines ueberspringt 26 Plaetze.
  // `z` selbst (ohne Praefix) ist Platz 25, nicht ein Praefix ohne Buchstabe.
  return rest.length * BUCHSTABEN.length + letzter;
}

/** Setzt Sekundenteil und Platz zum Schluessel zusammen. */
export function baueSchluessel(teil: SekundenTeil, platz: number): string {
  if (!istSekundenTeil(teil)) {
    throw new Error(`Sekundenteil ${teil} hat nicht die Form JJJJMMTT-HHMMSS`);
  }

  return `${teil}${buchstabe(platz)}`;
}

export interface ZerlegterSchluessel {
  readonly sekundenTeil: SekundenTeil;
  readonly platz: number;
}

/** Zerlegt einen Schluessel; `undefined`, wenn er nicht die Form hat. */
export function zerlegeSchluessel(schluessel: string): ZerlegterSchluessel | undefined {
  const treffer = SCHLUESSEL.exec(schluessel);
  if (treffer === null) {
    return undefined;
  }

  const teil = treffer[1] as SekundenTeil;
  const platz = platzVonBuchstabe(treffer[2] as string);
  if (!istSekundenTeil(teil) || platz === undefined) {
    return undefined;
  }

  return { sekundenTeil: teil, platz };
}

/** Monatsordner `JJJJ-MM` zu einem Sekundenteil. */
export function monatsOrdner(teil: SekundenTeil): string {
  const treffer = SEKUNDEN_TEIL.exec(teil);
  if (treffer === null) {
    throw new Error(`Sekundenteil ${teil} hat nicht die Form JJJJMMTT-HHMMSS`);
  }

  return `${treffer[1] as string}-${treffer[2] as string}`;
}
