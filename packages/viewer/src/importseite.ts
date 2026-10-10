/**
 * Bereich "Import" auf der Startseite.
 *
 * Zeigt je Quelle den Namen, ob sie verfuegbar ist, und einen Knopf
 * "Importieren"; waehrend eines Laufs den Fortschritt "x von y Dateien";
 * danach die letzten Laeufe mit ihren Zahlen, aufklappbar je Datei.
 * Bilder zeigt die Seite nicht (siehe `delivery/security.md`).
 */

/** Eine Quelle, wie der Server sie meldet. */
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

/** Eine Datei im Ergebnis eines Laufs. */
export interface ErgebnisEintrag {
  readonly art: string;
  readonly quellPfad: string;
  readonly schluessel?: string;
  readonly ablage?: string;
  readonly grund?: string;
}

/** Das Ergebnis eines Laufs. */
export interface LaufErgebnis {
  readonly quelle: string;
  readonly begonnen: string;
  readonly beendet: string;
  readonly gesamt: number;
  readonly neu: number;
  readonly bekannt: number;
  readonly uebersprungen: number;
  readonly problem: number;
  readonly dateien: readonly ErgebnisEintrag[];
  readonly protokoll: string;
}

export interface ImportZustand {
  readonly quellen: readonly QuellenZustand[];
  readonly laufend?: LaufenderImport | undefined;
  readonly laeufe: readonly LaufErgebnis[];
  /** Meldung des Servers, zum Beispiel "Import läuft bereits". */
  readonly meldung?: string | undefined;
}

/** Zustand, solange der Server noch nicht geantwortet hat. */
export const IMPORT_UNBEKANNT: ImportZustand = { quellen: [], laeufe: [] };

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

/** "x von y Dateien" — der Text des Fortschritts. */
export function fortschrittText(laufend: LaufenderImport): string {
  return `${laufend.erledigt} von ${laufend.gesamt} Dateien`;
}

/** Zeitpunkt in der Schreibweise des Browsers. */
function zeitText(iso: string): string {
  const zeit = new Date(iso);
  return Number.isNaN(zeit.getTime()) ? iso : zeit.toLocaleString('de-DE');
}

function zeileZu(eintrag: ErgebnisEintrag): string {
  switch (eintrag.art) {
    case 'neu':
      return `${eintrag.quellPfad} → ${eintrag.ablage ?? ''}`;
    case 'uebersprungen':
      return `${eintrag.quellPfad} → übersprungen: ${eintrag.grund ?? ''}`;
    case 'problem':
      return `${eintrag.quellPfad} → Problem: ${eintrag.grund ?? ''}`;
    default:
      return `${eintrag.quellPfad} → schon bekannt als ${eintrag.schluessel ?? ''}`;
  }
}

function zeichneQuelle(
  dokument: Document,
  quelle: QuellenZustand,
  gesperrt: boolean,
  starte: (name: string) => void,
): HTMLElement {
  const zeile = element(dokument, 'li', 'quelle');
  zeile.dataset.quelle = quelle.name;

  const name = element(dokument, 'span', 'quelle-name');
  name.textContent = quelle.name;

  const zustand = element(dokument, 'span', 'quelle-zustand');
  zustand.textContent = quelle.verfuegbar ? 'verfügbar' : 'nicht verfügbar';

  const knopf = element(dokument, 'button', 'quelle-start');
  knopf.type = 'button';
  knopf.textContent = 'Importieren';
  knopf.disabled = !quelle.verfuegbar || gesperrt;
  knopf.addEventListener('click', () => {
    starte(quelle.name);
  });

  zeile.append(name, zustand, knopf);
  return zeile;
}

function zeichneLauf(dokument: Document, lauf: LaufErgebnis): HTMLElement {
  const block = element(dokument, 'details', 'lauf');
  block.dataset.quelle = lauf.quelle;

  const kopf = element(dokument, 'summary');
  kopf.textContent =
    `${lauf.quelle} — ${zeitText(lauf.begonnen)} — ` +
    `${lauf.neu} neu, ${lauf.bekannt} schon bekannt, ` +
    `${lauf.uebersprungen} übersprungen, ${lauf.problem} Problem`;

  const liste = element(dokument, 'ul', 'lauf-dateien');
  for (const eintrag of lauf.dateien) {
    const zeile = element(dokument, 'li');
    zeile.dataset.art = eintrag.art;
    zeile.textContent = zeileZu(eintrag);
    liste.append(zeile);
  }

  block.append(kopf, liste);
  return block;
}

/** Zeichnet den Bereich "Import" neu. */
export function zeichneImport(
  wurzel: Element,
  zustand: ImportZustand,
  starte: (name: string) => void,
): void {
  const dokument = wurzel.ownerDocument;
  const teile: HTMLElement[] = [];

  const titel = element(dokument, 'h2');
  titel.textContent = 'Import';
  teile.push(titel);

  if (zustand.meldung !== undefined) {
    const meldung = element(dokument, 'p', 'import-meldung');
    meldung.setAttribute('role', 'status');
    meldung.textContent = zustand.meldung;
    teile.push(meldung);
  }

  const gesperrt = zustand.laufend !== undefined;
  const quellen = element(dokument, 'ul', 'quellen');
  for (const quelle of zustand.quellen) {
    quellen.append(zeichneQuelle(dokument, quelle, gesperrt, starte));
  }
  if (zustand.quellen.length === 0) {
    const leer = element(dokument, 'li', 'quellen-leer');
    leer.textContent = 'Keine Quelle eingestellt';
    quellen.append(leer);
  }
  teile.push(quellen);

  if (zustand.laufend !== undefined) {
    const fortschritt = element(dokument, 'p', 'import-fortschritt');
    fortschritt.dataset.quelle = zustand.laufend.quelle;
    fortschritt.setAttribute('role', 'status');
    fortschritt.textContent = `${zustand.laufend.quelle}: ${fortschrittText(zustand.laufend)}`;
    teile.push(fortschritt);
  }

  const laeufe = element(dokument, 'div', 'laeufe');
  for (const lauf of zustand.laeufe) {
    laeufe.append(zeichneLauf(dokument, lauf));
  }
  teile.push(laeufe);

  wurzel.replaceChildren(...teile);
}
