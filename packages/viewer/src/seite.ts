import { holeImportZustand, starteImport } from './importdaten.js';
import { IMPORT_UNBEKANNT, zeichneImport, type ImportZustand } from './importseite.js';
import { ampelFarbe, ampelText, holeZustand, UMGEBUNG_UNBEKANNT, type Zustand } from './zustand.js';

/** Zeichnet den Kopf der Seite: Titel, Umgebung und Ampel. */
export function zeichneSeite(wurzel: Element, zustand: Zustand): void {
  const farbe = ampelFarbe(zustand.ready);
  const dokument = wurzel.ownerDocument;

  const titel = dokument.createElement('h1');
  titel.textContent = 'Knipsa';

  const umgebung = dokument.createElement('p');
  umgebung.className = 'umgebung';
  umgebung.dataset.umgebung = zustand.umgebung;
  umgebung.textContent = `Umgebung: ${zustand.umgebung}`;

  const licht = dokument.createElement('span');
  licht.className = `ampel-licht ampel-${farbe}`;
  licht.setAttribute('role', 'img');
  licht.setAttribute('aria-label', ampelText(farbe));

  const ampel = dokument.createElement('p');
  ampel.className = 'ampel';
  ampel.dataset.ampel = farbe;
  ampel.append(licht, ` ${ampelText(farbe)}`);

  wurzel.replaceChildren(titel, umgebung, ampel);
}

type Abrufen = (url: string, optionen?: RequestInit) => Promise<Response>;

/** Abstand zwischen zwei Abfragen, solange ein Import laeuft. */
export const FORTSCHRITT_TAKT_MS = 1000;

/**
 * Abstand zwischen zwei Abfragen, wenn kein Import laeuft. Damit stehen
 * eingesteckte Datentraeger deutlich schneller als in den verlangten 10
 * Sekunden in der Liste und herausgezogene verschwinden wieder (req-006)
 * — ohne dass die Seite neu geladen wird.
 */
export const QUELLEN_TAKT_MS = 3000;

export interface SeiteOptionen {
  /** Wartezeit waehrend eines Laufs; in Tests kurz. */
  readonly taktMs?: number;
  /** Wartezeit im Leerlauf; in Tests kurz. */
  readonly quellenTaktMs?: number;
  /** Wartefunktion; in Tests ersetzbar. */
  readonly warte?: (ms: number) => Promise<void>;
  /**
   * Solange das `true` ergibt, wird weiter abgefragt. Im Browser laeuft
   * das endlos; Tests beenden damit nach wenigen Durchgaengen.
   */
  readonly weiter?: () => boolean;
}

function schlafe(ms: number): Promise<void> {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

/**
 * Baut die Seite auf: erst der bekannte Zustand "keine Antwort", dann das
 * Ergebnis der Abfragen — so steht nie eine leere Seite da.
 *
 * Laeuft ein Import, wird der Bereich "Import" im Takt neu abgefragt.
 * Der Fortschritt kommt dabei immer vom Server: ein Neuladen der Seite
 * zeigt ihn deshalb unveraendert weiter.
 */
export async function starteSeite(
  dokument: Document,
  abrufen: Abrufen,
  optionen: SeiteOptionen = {},
): Promise<void> {
  const wurzel = dokument.querySelector('#app');
  if (wurzel === null) {
    return;
  }

  zeichneSeite(wurzel, { umgebung: UMGEBUNG_UNBEKANNT, ready: { erreichbar: false } });
  zeichneSeite(wurzel, await holeZustand(abrufen));

  const bereich = dokument.createElement('section');
  bereich.id = 'import';
  wurzel.append(bereich);

  await fuehreImportBereich(bereich, abrufen, optionen);
}

/**
 * Haelt den Bereich "Import" aktuell: im Leerlauf, damit ein- und
 * ausgesteckte Datentraeger von selbst erscheinen und verschwinden,
 * waehrend eines Laufs im engeren Takt des Fortschritts.
 */
export async function fuehreImportBereich(
  bereich: Element,
  abrufen: Abrufen,
  {
    taktMs = FORTSCHRITT_TAKT_MS,
    quellenTaktMs = QUELLEN_TAKT_MS,
    warte = schlafe,
    weiter = () => true,
  }: SeiteOptionen = {},
): Promise<void> {
  // Die Meldung des Servers (zum Beispiel "Import läuft bereits") bleibt
  // stehen, bis der naechste Knopfdruck sie ersetzt — die Abfragen des
  // Fortschritts dazwischen duerfen sie nicht wegwischen.
  let meldung: string | undefined;
  let letzter: ImportZustand = IMPORT_UNBEKANNT;

  const zeige = (zustand: ImportZustand): void => {
    letzter = zustand;
    zeichneImport(bereich, meldung === undefined ? zustand : { ...zustand, meldung }, (name) => {
      void (async () => {
        const nachher = await starteImport(abrufen, name);
        meldung = nachher.meldung;
        zeige(nachher);
      })();
    });
  };

  zeige(IMPORT_UNBEKANNT);
  zeige(await holeImportZustand(abrufen));

  while (weiter()) {
    await warte(letzter.laufend === undefined ? quellenTaktMs : taktMs);
    zeige(await holeImportZustand(abrufen));
  }
}
