/**
 * Bereich "Archiv" auf der Startseite.
 *
 * Zeigt die Zahlen des Index — Fotos, Dateien, vermisst, Alarme,
 * unbekannte Dateien —, jede aufklappbar zur Liste, dazu den letzten
 * Abgleich mit Zeitpunkt und Dauer. Mit "Abgleich jetzt" und "Neu
 * aufbauen" laesst sich der Index von Hand erneuern; "Schlüssel
 * nachschlagen" zeigt die Angaben eines Fotos als Text. Bilder zeigt die
 * Seite nicht (siehe `delivery/security.md`).
 */

import { dauerText, zeitText } from './zeit.js';

/** Was ein Abgleich gekostet und gefunden hat. */
export interface AbgleichLauf {
  readonly art?: string;
  readonly begonnen: string;
  readonly beendet: string;
  readonly dauerMs: number;
  readonly fotos: number;
  readonly dateien: number;
  readonly vermisst: number;
  readonly alarme: number;
  readonly unbekannte: number;
}

/** Eine Zahl des Bereichs samt ihrer Liste. */
export interface ArchivZahl {
  readonly art: string;
  readonly beschriftung: string;
  readonly anzahl: number;
}

/** Die Zahlen in der Reihenfolge der Seite. */
export const ARCHIV_ZAHLEN: readonly { art: string; beschriftung: string }[] = [
  { art: 'fotos', beschriftung: 'Fotos' },
  { art: 'dateien', beschriftung: 'Dateien' },
  { art: 'vermisst', beschriftung: 'vermisst' },
  { art: 'alarme', beschriftung: 'Alarme' },
  { art: 'unbekannte', beschriftung: 'unbekannte Dateien' },
];

/** Die Nachfrage vor dem Neuaufbau — im Wortlaut von req-007. */
export const NEU_AUFBAUEN_FRAGE =
  'Index verwerfen und aus den Dateien neu einlesen? Fotos und Dateien bleiben unverändert.';

/** Das Nachschlagen eines Schluessels. */
export interface Auskunft {
  readonly schluessel: string;
  /** Die Angaben als Text; fehlt, wenn der Schluessel unbekannt ist. */
  readonly text?: string | undefined;
  /** Meldung, falls nichts gefunden wurde. */
  readonly meldung?: string | undefined;
}

export interface ArchivZustand {
  readonly fotos: number;
  readonly dateien: number;
  readonly vermisst: number;
  readonly alarme: number;
  readonly unbekannte: number;
  readonly letzter?: AbgleichLauf | undefined;
  /** `import`, `abgleich` oder `neuaufbau`, solange etwas laeuft. */
  readonly laufend?: string | undefined;
  /** Meldung des Servers, zum Beispiel "Import läuft — bitte warten". */
  readonly meldung?: string | undefined;
  /** Aufgeklappte Zahlen samt ihren Zeilen. */
  readonly listen?: Readonly<Record<string, readonly string[]>> | undefined;
  /** `true`, solange die Nachfrage zum Neuaufbau offen ist. */
  readonly nachfrage?: boolean | undefined;
  readonly auskunft?: Auskunft | undefined;
}

/** Was der Nutzer im Bereich "Archiv" anstossen kann. */
export interface ArchivAktionen {
  readonly gleicheAb: () => void;
  /** Oeffnet die Nachfrage zum Neuaufbau. */
  readonly frageNeuAufbau: () => void;
  /** Baut nach bestaetigter Nachfrage neu auf. */
  readonly baueNeuAuf: () => void;
  /** Schliesst die Nachfrage, ohne etwas zu tun. */
  readonly verwirfNachfrage: () => void;
  /** Klappt die Liste hinter einer Zahl auf oder zu. */
  readonly klappe: (art: string) => void;
  readonly schlageNach: (schluessel: string) => void;
}

/** Zustand, solange der Server noch nicht geantwortet hat. */
export const ARCHIV_UNBEKANNT: ArchivZustand = {
  fotos: 0,
  dateien: 0,
  vermisst: 0,
  alarme: 0,
  unbekannte: 0,
};

function element<K extends keyof HTMLElementTagNameMap>(
  dokument: Document,
  name: K,
  klasse?: string,
): HTMLElementTagNameMap[K] {
  const erzeugt = dokument.createElement(name);
  if (klasse !== undefined) {
    erzeugt.className = klasse;
  }
  return erzeugt;
}

function knopfZu(
  dokument: Document,
  klasse: string,
  beschriftung: string,
  gesperrt: boolean,
  tun: () => void,
): HTMLButtonElement {
  const knopf = element(dokument, 'button', klasse);
  knopf.type = 'button';
  knopf.textContent = beschriftung;
  knopf.disabled = gesperrt;
  knopf.addEventListener('click', tun);
  return knopf;
}

/** "Letzter Abgleich: … — …" oder der Hinweis, dass noch keiner lief. */
export function letzterText(letzter: AbgleichLauf | undefined): string {
  if (letzter === undefined) {
    return 'Letzter Abgleich: noch keiner';
  }

  const was = letzter.art === 'neuaufbau' ? 'Letzter Neuaufbau' : 'Letzter Abgleich';
  return `${was}: ${zeitText(letzter.begonnen)} — ${dauerText(letzter.dauerMs)}`;
}

/** Die Zahlen des Bereichs in der Reihenfolge der Seite. */
export function zahlenZu(zustand: ArchivZustand): ArchivZahl[] {
  const werte: Record<string, number> = {
    fotos: zustand.fotos,
    dateien: zustand.dateien,
    vermisst: zustand.vermisst,
    alarme: zustand.alarme,
    unbekannte: zustand.unbekannte,
  };

  return ARCHIV_ZAHLEN.map((zahl) => ({ ...zahl, anzahl: werte[zahl.art] ?? 0 }));
}

function zeichneZahl(
  dokument: Document,
  zahl: ArchivZahl,
  zeilen: readonly string[] | undefined,
  aktionen: ArchivAktionen,
): HTMLElement {
  const eintrag = element(dokument, 'li', 'archiv-zahl');
  eintrag.dataset.art = zahl.art;
  eintrag.dataset.anzahl = String(zahl.anzahl);

  const knopf = knopfZu(
    dokument,
    'zahl-knopf',
    `${zahl.beschriftung}: ${zahl.anzahl}`,
    false,
    () => {
      aktionen.klappe(zahl.art);
    },
  );
  knopf.setAttribute('aria-expanded', String(zeilen !== undefined));
  eintrag.append(knopf);

  if (zeilen === undefined) {
    return eintrag;
  }

  const liste = element(dokument, 'ul', 'zahl-liste');
  for (const zeile of zeilen) {
    const punkt = element(dokument, 'li');
    punkt.textContent = zeile;
    liste.append(punkt);
  }
  if (zeilen.length === 0) {
    const leer = element(dokument, 'li', 'zahl-leer');
    leer.textContent = 'Nichts dabei';
    liste.append(leer);
  }

  eintrag.append(liste);
  return eintrag;
}

function zeichneNachschlagen(
  dokument: Document,
  auskunft: Auskunft | undefined,
  aktionen: ArchivAktionen,
): HTMLElement[] {
  const block = element(dokument, 'div', 'archiv-nachschlagen');

  const beschriftung = element(dokument, 'label');
  beschriftung.htmlFor = 'archiv-schluessel';
  beschriftung.textContent = 'Schlüssel nachschlagen';

  const feld = element(dokument, 'input', 'nachschlagen-feld');
  feld.id = 'archiv-schluessel';
  feld.type = 'text';
  feld.value = auskunft?.schluessel ?? '';

  block.append(
    beschriftung,
    feld,
    knopfZu(dokument, 'nachschlagen-knopf', 'Nachschlagen', false, () => {
      aktionen.schlageNach(feld.value);
    }),
  );

  const teile: HTMLElement[] = [block];

  if (auskunft?.meldung !== undefined) {
    const meldung = element(dokument, 'p', 'nachschlagen-meldung');
    meldung.setAttribute('role', 'status');
    meldung.textContent = auskunft.meldung;
    teile.push(meldung);
  }

  if (auskunft?.text !== undefined) {
    const auskunftText = element(dokument, 'pre', 'nachschlagen-auskunft');
    auskunftText.dataset.schluessel = auskunft.schluessel;
    auskunftText.textContent = auskunft.text;
    teile.push(auskunftText);
  }

  return teile;
}

/** Zeichnet den Bereich "Archiv" neu. */
export function zeichneArchiv(
  wurzel: Element,
  zustand: ArchivZustand,
  aktionen: ArchivAktionen,
): void {
  const dokument = wurzel.ownerDocument;
  const teile: HTMLElement[] = [];

  const titel = element(dokument, 'h2');
  titel.textContent = 'Archiv';
  teile.push(titel);

  if (zustand.meldung !== undefined) {
    const meldung = element(dokument, 'p', 'archiv-meldung');
    meldung.setAttribute('role', 'status');
    meldung.textContent = zustand.meldung;
    teile.push(meldung);
  }

  const zahlen = element(dokument, 'ul', 'archiv-zahlen');
  for (const zahl of zahlenZu(zustand)) {
    zahlen.append(zeichneZahl(dokument, zahl, zustand.listen?.[zahl.art], aktionen));
  }
  teile.push(zahlen);

  const letzter = element(dokument, 'p', 'archiv-letzter');
  letzter.textContent = letzterText(zustand.letzter);
  teile.push(letzter);

  if (zustand.laufend !== undefined) {
    const laufend = element(dokument, 'p', 'archiv-laufend');
    laufend.setAttribute('role', 'status');
    laufend.dataset.laufend = zustand.laufend;
    laufend.textContent = `Läuft gerade: ${zustand.laufend}`;
    teile.push(laufend);
  }

  const gesperrt = zustand.laufend !== undefined;
  teile.push(
    knopfZu(dokument, 'archiv-abgleich', 'Abgleich jetzt', gesperrt, aktionen.gleicheAb),
    knopfZu(dokument, 'archiv-neu', 'Neu aufbauen', gesperrt, aktionen.frageNeuAufbau),
  );

  if (zustand.nachfrage === true) {
    const nachfrage = element(dokument, 'div', 'archiv-nachfrage');

    const frage = element(dokument, 'p', 'nachfrage-text');
    frage.setAttribute('role', 'status');
    frage.textContent = NEU_AUFBAUEN_FRAGE;

    nachfrage.append(
      frage,
      knopfZu(dokument, 'nachfrage-ja', 'Ja, neu aufbauen', gesperrt, aktionen.baueNeuAuf),
      knopfZu(dokument, 'nachfrage-nein', 'Abbrechen', false, aktionen.verwirfNachfrage),
    );
    teile.push(nachfrage);
  }

  teile.push(...zeichneNachschlagen(dokument, zustand.auskunft, aktionen));

  wurzel.replaceChildren(...teile);
}
