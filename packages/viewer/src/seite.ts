import { ampelFarbe, ampelText, holeZustand, UMGEBUNG_UNBEKANNT, type Zustand } from './zustand.js';

/** Zeichnet die Minimalseite: Titel, Umgebung und Ampel. */
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

type Abrufen = (url: string) => Promise<Response>;

/**
 * Baut die Seite auf: erst der bekannte Zustand "keine Antwort", dann das
 * Ergebnis der Abfrage — so steht nie eine leere Seite da.
 */
export async function starteSeite(dokument: Document, abrufen: Abrufen): Promise<void> {
  const wurzel = dokument.querySelector('#app');
  if (wurzel === null) {
    return;
  }

  zeichneSeite(wurzel, { umgebung: UMGEBUNG_UNBEKANNT, ready: { erreichbar: false } });
  zeichneSeite(wurzel, await holeZustand(abrufen));
}
