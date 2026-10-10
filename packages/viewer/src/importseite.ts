/**
 * Bereich "Import" auf der Startseite.
 *
 * Zeigt je Quelle die Beschriftung, ob sie verfuegbar ist, und einen
 * Knopf "Importieren" fuer die ganze Quelle; bei Datentraegern dazu
 * "Ordner wählen …", das die Ordner Ebene fuer Ebene zeigt. Waehrend
 * eines Laufs den Fortschritt "x von y Dateien"; danach die letzten
 * Laeufe mit ihren Zahlen, aufklappbar je Datei. Bilder zeigt die Seite
 * nicht (siehe `delivery/security.md`).
 */

/** Eine Quelle, wie der Server sie meldet. */
export interface QuellenZustand {
  readonly name: string;
  /** Beschriftung; bei Datentraegern mit Groesse. Fehlt sie, gilt der Name. */
  readonly anzeige?: string;
  /** `ordner` oder `datentraeger`; ohne Angabe ein eingestellter Ordner. */
  readonly art?: string;
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
  /** Gesetzt, sobald abgebrochen wird; der Lauf endet dann gleich. */
  readonly abbruch?: string;
}

/** Ein Ordner in der Quelle, wie der Server ihn meldet. */
export interface OrdnerEintrag {
  readonly name: string;
  /** Pfad relativ zur Quellwurzel. */
  readonly pfad: string;
  /** Anzahl Dateien im Ordner samt Unterordnern. */
  readonly dateien: number;
  /** `true`, wenn darunter weitere Ordner liegen. */
  readonly weiter: boolean;
}

/** Die offene Ordner-Auswahl einer Quelle. */
export interface OrdnerWahl {
  readonly quelle: string;
  /** Angesehener Ordner; `''` ist die Wurzel der Quelle. */
  readonly ordner: string;
  readonly dateien: number;
  readonly unterordner: readonly OrdnerEintrag[];
  /** Meldung des Servers, falls die Ordner nicht zu lesen waren. */
  readonly meldung?: string | undefined;
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
  /** Ordner, auf den der Lauf begrenzt war; fehlt bei der ganzen Quelle. */
  readonly ordner?: string;
  readonly begonnen: string;
  readonly beendet: string;
  readonly gesamt: number;
  readonly neu: number;
  readonly bekannt: number;
  readonly uebersprungen: number;
  readonly problem: number;
  readonly dateien: readonly ErgebnisEintrag[];
  /**
   * Abschluss des Laufs im Wortlaut des Servers. Laeufe aus req-005
   * haben ihn noch nicht; dann steht er nicht da.
   */
  readonly abschluss?: string;
  readonly protokoll: string;
}

export interface ImportZustand {
  readonly quellen: readonly QuellenZustand[];
  readonly laufend?: LaufenderImport | undefined;
  readonly laeufe: readonly LaufErgebnis[];
  /** Meldung des Servers, zum Beispiel "Import läuft bereits". */
  readonly meldung?: string | undefined;
  /** Offene Ordner-Auswahl; ohne sie zeigt die Seite nur die Quellen. */
  readonly ordnerwahl?: OrdnerWahl | undefined;
}

/** Was der Nutzer im Bereich "Import" anstossen kann. */
export interface ImportAktionen {
  /** Lauf starten; mit `ordner` nur dieser Ordner samt Unterordnern. */
  readonly starte: (quelle: string, ordner?: string) => void;
  /** Ordner-Auswahl oeffnen oder eine Ebene wechseln. */
  readonly zeigeOrdner: (quelle: string, ordner: string) => void;
  /** Ordner-Auswahl schliessen. */
  readonly schliesseOrdner: () => void;
  /** Laufenden Import abbrechen. */
  readonly brecheAb: () => void;
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

/** "3 Dateien" — mit der Einzahl, wo sie hingehoert. */
export function dateienText(anzahl: number): string {
  return anzahl === 1 ? '1 Datei' : `${anzahl} Dateien`;
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

function zeichneQuelle(
  dokument: Document,
  quelle: QuellenZustand,
  gesperrt: boolean,
  aktionen: ImportAktionen,
): HTMLElement {
  const zeile = element(dokument, 'li', 'quelle');
  zeile.dataset.quelle = quelle.name;
  zeile.dataset.art = quelle.art ?? 'ordner';

  const name = element(dokument, 'span', 'quelle-name');
  name.textContent = quelle.anzeige ?? quelle.name;

  const zustand = element(dokument, 'span', 'quelle-zustand');
  zustand.textContent = quelle.verfuegbar ? 'verfügbar' : 'nicht verfügbar';

  const unbenutzbar = !quelle.verfuegbar || gesperrt;
  zeile.append(
    name,
    zustand,
    knopfZu(dokument, 'quelle-start', 'Importieren', unbenutzbar, () => {
      aktionen.starte(quelle.name);
    }),
  );

  // Ein Datentraeger wird entweder ganz oder ordnerweise importiert.
  if (quelle.art === 'datentraeger') {
    zeile.append(
      knopfZu(dokument, 'quelle-ordner', 'Ordner wählen …', unbenutzbar, () => {
        aktionen.zeigeOrdner(quelle.name, '');
      }),
    );
  }

  return zeile;
}

function zeichneOrdnerwahl(
  dokument: Document,
  wahl: OrdnerWahl,
  gesperrt: boolean,
  aktionen: ImportAktionen,
): HTMLElement {
  const block = element(dokument, 'div', 'ordnerwahl');
  block.dataset.quelle = wahl.quelle;
  block.dataset.ordner = wahl.ordner;

  const pfad = element(dokument, 'p', 'ordnerwahl-pfad');
  pfad.textContent = [wahl.quelle, ...wahl.ordner.split('/').filter((teil) => teil !== '')].join(
    ' / ',
  );

  const hoch = wahl.ordner.split('/').slice(0, -1).join('/');
  block.append(
    pfad,
    knopfZu(dokument, 'ordnerwahl-hoch', 'Eine Ebene höher', wahl.ordner === '', () => {
      aktionen.zeigeOrdner(wahl.quelle, hoch);
    }),
    knopfZu(dokument, 'ordnerwahl-start', 'Diesen Ordner importieren', gesperrt, () => {
      aktionen.starte(wahl.quelle, wahl.ordner);
    }),
  );

  if (wahl.meldung !== undefined) {
    const meldung = element(dokument, 'p', 'ordnerwahl-meldung');
    meldung.setAttribute('role', 'status');
    meldung.textContent = wahl.meldung;
    block.append(meldung);
  }

  const liste = element(dokument, 'ul', 'ordnerwahl-liste');
  for (const eintrag of wahl.unterordner) {
    const zeile = element(dokument, 'li', 'ordner');
    zeile.dataset.ordner = eintrag.pfad;

    const name = element(dokument, 'span', 'ordner-name');
    name.textContent = eintrag.name;

    const anzahl = element(dokument, 'span', 'ordner-dateien');
    anzahl.textContent = dateienText(eintrag.dateien);

    zeile.append(
      name,
      anzahl,
      knopfZu(dokument, 'ordner-oeffnen', 'Öffnen', !eintrag.weiter, () => {
        aktionen.zeigeOrdner(wahl.quelle, eintrag.pfad);
      }),
      knopfZu(dokument, 'ordner-start', 'Diesen Ordner importieren', gesperrt, () => {
        aktionen.starte(wahl.quelle, eintrag.pfad);
      }),
    );
    liste.append(zeile);
  }

  if (wahl.unterordner.length === 0) {
    const leer = element(dokument, 'li', 'ordnerwahl-leer');
    leer.textContent = 'Keine weiteren Ordner';
    liste.append(leer);
  }

  block.append(
    liste,
    knopfZu(dokument, 'ordnerwahl-zu', 'Schließen', false, () => {
      aktionen.schliesseOrdner();
    }),
  );

  return block;
}

function zeichneLauf(dokument: Document, lauf: LaufErgebnis): HTMLElement {
  const block = element(dokument, 'details', 'lauf');
  block.dataset.quelle = lauf.quelle;
  if (lauf.ordner !== undefined) {
    block.dataset.ordner = lauf.ordner;
  }

  const woher = lauf.ordner === undefined ? lauf.quelle : `${lauf.quelle} / ${lauf.ordner}`;
  const kopf = element(dokument, 'summary');
  kopf.textContent =
    `${woher} — ${zeitText(lauf.begonnen)} — ` +
    `${lauf.neu} neu, ${lauf.bekannt} schon bekannt, ` +
    `${lauf.uebersprungen} übersprungen, ${lauf.problem} Problem`;

  if (lauf.abschluss !== undefined) {
    const abschluss = element(dokument, 'span', 'lauf-abschluss');
    abschluss.textContent = ` — ${lauf.abschluss}`;
    kopf.append(abschluss);
  }

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
  aktionen: ImportAktionen,
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
    quellen.append(zeichneQuelle(dokument, quelle, gesperrt, aktionen));
  }
  if (zustand.quellen.length === 0) {
    const leer = element(dokument, 'li', 'quellen-leer');
    leer.textContent = 'Keine Quelle eingestellt';
    quellen.append(leer);
  }
  teile.push(quellen);

  if (zustand.ordnerwahl !== undefined) {
    teile.push(zeichneOrdnerwahl(dokument, zustand.ordnerwahl, gesperrt, aktionen));
  }

  if (zustand.laufend !== undefined) {
    const fortschritt = element(dokument, 'p', 'import-fortschritt');
    fortschritt.dataset.quelle = zustand.laufend.quelle;
    if (zustand.laufend.ordner !== undefined) {
      fortschritt.dataset.ordner = zustand.laufend.ordner;
    }
    fortschritt.setAttribute('role', 'status');
    const woher =
      zustand.laufend.ordner === undefined
        ? zustand.laufend.quelle
        : `${zustand.laufend.quelle} / ${zustand.laufend.ordner}`;
    const abbruch =
      zustand.laufend.abbruch === undefined ? '' : ' — wird abgebrochen, bitte warten …';
    fortschritt.textContent = `${woher}: ${fortschrittText(zustand.laufend)}${abbruch}`;

    teile.push(
      fortschritt,
      knopfZu(
        dokument,
        'import-abbrechen',
        'Abbrechen',
        zustand.laufend.abbruch !== undefined,
        () => {
          aktionen.brecheAb();
        },
      ),
    );
  }

  const laeufe = element(dokument, 'div', 'laeufe');
  for (const lauf of zustand.laeufe) {
    laeufe.append(zeichneLauf(dokument, lauf));
  }
  teile.push(laeufe);

  wurzel.replaceChildren(...teile);
}
