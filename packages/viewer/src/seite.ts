import {
  holeArchivZustand,
  holeAuskunft,
  holeListe,
  starteAbgleich,
  starteNeuaufbau,
} from './archivdaten.js';
import {
  ARCHIV_UNBEKANNT,
  zeichneArchiv,
  type ArchivZustand,
  type Auskunft,
} from './archivseite.js';
import { brecheImportAb, holeImportZustand, holeOrdner, starteImport } from './importdaten.js';
import {
  IMPORT_UNBEKANNT,
  zeichneImport,
  type ImportZustand,
  type OrdnerWahl,
} from './importseite.js';
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

  const importBereich = dokument.createElement('section');
  importBereich.id = 'import';

  const archivBereich = dokument.createElement('section');
  archivBereich.id = 'archiv';

  wurzel.append(importBereich, archivBereich);

  await fuehreBereiche(importBereich, archivBereich, abrufen, optionen);
}

/**
 * Haelt den Bereich "Import" aktuell: im Leerlauf, damit ein- und
 * ausgesteckte Datentraeger von selbst erscheinen und verschwinden,
 * waehrend eines Laufs im engeren Takt des Fortschritts.
 */
export function fuehreImportBereich(
  bereich: Element,
  abrufen: Abrufen,
  optionen: SeiteOptionen = {},
): Promise<void> {
  return fuehreBereiche(bereich, undefined, abrufen, optionen);
}

/**
 * Haelt den Bereich "Archiv" aktuell: die Zahlen, der letzte Abgleich
 * und die aufgeklappten Listen kommen bei jeder Abfrage frisch vom
 * Server — ein laufender Abgleich ist damit auf der Seite zu sehen.
 */
export function fuehreArchivBereich(
  bereich: Element,
  abrufen: Abrufen,
  optionen: SeiteOptionen = {},
): Promise<void> {
  return fuehreBereiche(undefined, bereich, abrufen, optionen);
}

/**
 * Haelt die Bereiche der Startseite aktuell. Beide gehen in denselben
 * Takt: ein Durchgang fragt ab, was auf der Seite steht, und zeichnet
 * sie neu.
 */
async function fuehreBereiche(
  importBereich: Element | undefined,
  archivBereich: Element | undefined,
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
  // Die offene Ordner-Auswahl gehoert zur Bedienung, nicht zum Zustand
  // des Servers: sie bleibt ueber die Abfragen hinweg stehen.
  let ordnerwahl: OrdnerWahl | undefined;

  const zeigeImport = (zustand: ImportZustand): void => {
    letzter = zustand;
    if (importBereich === undefined) {
      return;
    }

    zeichneImport(
      importBereich,
      { ...zustand, meldung, ordnerwahl },
      {
        starte: (name, ordner) => {
          void (async () => {
            const nachher = await starteImport(abrufen, name, ordner);
            meldung = nachher.meldung;
            // Nach dem Start ist die Auswahl erledigt.
            ordnerwahl = undefined;
            zeigeImport(nachher);
          })();
        },
        zeigeOrdner: (name, ordner) => {
          void (async () => {
            ordnerwahl = await holeOrdner(abrufen, name, ordner);
            zeigeImport(letzter);
          })();
        },
        schliesseOrdner: () => {
          ordnerwahl = undefined;
          zeigeImport(letzter);
        },
        brecheAb: () => {
          void (async () => {
            const nachher = await brecheImportAb(abrufen);
            meldung = nachher.meldung;
            zeigeImport(nachher);
          })();
        },
      },
    );
  };

  // Meldung, Nachfrage, offene Listen und die Auskunft gehoeren zur
  // Bedienung: sie bleiben ueber die Abfragen hinweg stehen.
  let archivMeldung: string | undefined;
  let nachfrage = false;
  let auskunft: Auskunft | undefined;
  const listen = new Map<string, readonly string[]>();
  let letzterArchiv: ArchivZustand = ARCHIV_UNBEKANNT;

  const zeigeArchiv = (zustand: ArchivZustand): void => {
    letzterArchiv = zustand;
    if (archivBereich === undefined) {
      return;
    }

    zeichneArchiv(
      archivBereich,
      {
        ...zustand,
        meldung: archivMeldung,
        nachfrage,
        auskunft,
        listen: Object.fromEntries(listen),
      },
      {
        gleicheAb: () => {
          void (async () => {
            const nachher = await starteAbgleich(abrufen);
            archivMeldung = nachher.meldung;
            nachfrage = false;
            zeigeArchiv(nachher);
          })();
        },
        frageNeuAufbau: () => {
          nachfrage = true;
          zeigeArchiv(letzterArchiv);
        },
        baueNeuAuf: () => {
          void (async () => {
            const nachher = await starteNeuaufbau(abrufen);
            archivMeldung = nachher.meldung;
            nachfrage = false;
            zeigeArchiv(nachher);
          })();
        },
        verwirfNachfrage: () => {
          nachfrage = false;
          zeigeArchiv(letzterArchiv);
        },
        klappe: (art) => {
          void (async () => {
            if (listen.has(art)) {
              listen.delete(art);
              zeigeArchiv(letzterArchiv);
              return;
            }

            listen.set(art, await holeListe(abrufen, art));
            zeigeArchiv(letzterArchiv);
          })();
        },
        schlageNach: (schluessel) => {
          void (async () => {
            auskunft = await holeAuskunft(abrufen, schluessel);
            zeigeArchiv(letzterArchiv);
          })();
        },
      },
    );
  };

  zeigeImport(IMPORT_UNBEKANNT);
  zeigeArchiv(ARCHIV_UNBEKANNT);

  if (importBereich !== undefined) {
    zeigeImport(await holeImportZustand(abrufen));
  }
  if (archivBereich !== undefined) {
    zeigeArchiv(await holeArchivZustand(abrufen));
  }

  while (weiter()) {
    const eilig = letzter.laufend !== undefined || letzterArchiv.laufend !== undefined;
    await warte(eilig ? taktMs : quellenTaktMs);

    if (importBereich !== undefined) {
      zeigeImport(await holeImportZustand(abrufen));
    }
    if (archivBereich !== undefined) {
      // Eine aufgeklappte Liste zieht mit: ein vermisstes Foto
      // verschwindet daraus, sobald der Abgleich es wiedergefunden hat.
      for (const art of [...listen.keys()]) {
        listen.set(art, await holeListe(abrufen, art));
      }
      zeigeArchiv(await holeArchivZustand(abrufen));
    }
  }
}
