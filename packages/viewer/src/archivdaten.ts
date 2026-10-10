/** Abfragen des Bereichs "Archiv" gegen den Server. */

import { ARCHIV_UNBEKANNT, type ArchivZustand, type Auskunft } from './archivseite.js';

type Abrufen = (url: string, optionen?: RequestInit) => Promise<Response>;

function istZustand(wert: unknown): wert is ArchivZustand {
  if (typeof wert !== 'object' || wert === null) {
    return false;
  }

  const satz = wert as Record<string, unknown>;
  return typeof satz.fotos === 'number' && typeof satz.dateien === 'number';
}

/** Die Meldung aus einer abweisenden Antwort des Servers. */
function fehlerText(daten: unknown, ersatz: string): string {
  return typeof daten === 'object' &&
    daten !== null &&
    typeof (daten as { fehler?: unknown }).fehler === 'string'
    ? (daten as { fehler: string }).fehler
    : ersatz;
}

/** Holt Zahlen, letzten Abgleich und das laufende Vorhaben. */
export async function holeArchivZustand(abrufen: Abrufen): Promise<ArchivZustand> {
  try {
    const antwort = await abrufen('/api/archiv');
    if (!antwort.ok) {
      return ARCHIV_UNBEKANNT;
    }

    const daten: unknown = await antwort.json();
    return istZustand(daten) ? daten : ARCHIV_UNBEKANNT;
  } catch {
    return ARCHIV_UNBEKANNT;
  }
}

/** Startet einen Abgleich oder einen Neuaufbau. */
async function stosseAn(abrufen: Abrufen, weg: string, ersatz: string): Promise<ArchivZustand> {
  let antwort: Response;
  try {
    antwort = await abrufen(weg, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return { ...ARCHIV_UNBEKANNT, meldung: 'Server nicht erreichbar' };
  }

  const daten: unknown = await antwort.json().catch(() => undefined);

  if (!antwort.ok) {
    const zustand = istZustand(daten) ? daten : await holeArchivZustand(abrufen);
    return { ...zustand, meldung: fehlerText(daten, ersatz) };
  }

  return istZustand(daten) ? daten : await holeArchivZustand(abrufen);
}

/** "Abgleich jetzt". */
export function starteAbgleich(abrufen: Abrufen): Promise<ArchivZustand> {
  return stosseAn(abrufen, '/api/archiv/abgleich', 'Abgleich nicht gestartet');
}

/** "Neu aufbauen" — nach bestaetigter Nachfrage. */
export function starteNeuaufbau(abrufen: Abrufen): Promise<ArchivZustand> {
  return stosseAn(abrufen, '/api/archiv/neu-aufbauen', 'Neuaufbau nicht gestartet');
}

/**
 * Holt die Liste hinter einer Zahl. Antwortet der Server nicht, kommt
 * eine leere Liste zurueck — die Seite bleibt dann bedienbar.
 */
export async function holeListe(abrufen: Abrufen, art: string): Promise<readonly string[]> {
  try {
    const antwort = await abrufen(`/api/archiv/liste?art=${encodeURIComponent(art)}`);
    if (!antwort.ok) {
      return [];
    }

    const daten: unknown = await antwort.json();
    const zeilen = (daten as { zeilen?: unknown }).zeilen;
    return Array.isArray(zeilen) ? zeilen.filter((zeile) => typeof zeile === 'string') : [];
  } catch {
    return [];
  }
}

/** Schlaegt einen Schluessel nach und holt seine Angaben als Text. */
export async function holeAuskunft(abrufen: Abrufen, schluessel: string): Promise<Auskunft> {
  const gesucht = schluessel.trim();
  if (gesucht === '') {
    return { schluessel: gesucht, meldung: 'Bitte einen Schlüssel eingeben' };
  }

  let antwort: Response;
  try {
    antwort = await abrufen(`/api/archiv/foto?schluessel=${encodeURIComponent(gesucht)}`);
  } catch {
    return { schluessel: gesucht, meldung: 'Server nicht erreichbar' };
  }

  const daten: unknown = await antwort.json().catch(() => undefined);

  if (!antwort.ok) {
    return { schluessel: gesucht, meldung: fehlerText(daten, 'Schlüssel nicht gefunden') };
  }

  const text = (daten as { text?: unknown }).text;
  return typeof text === 'string'
    ? { schluessel: gesucht, text }
    : { schluessel: gesucht, meldung: 'Keine Angaben erhalten' };
}
