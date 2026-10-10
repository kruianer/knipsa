/** Abfragen des Bereichs "Import" gegen den Server. */

import { IMPORT_UNBEKANNT, type ImportZustand, type OrdnerWahl } from './importseite.js';

type Abrufen = (url: string, optionen?: RequestInit) => Promise<Response>;

function istZustand(wert: unknown): wert is ImportZustand {
  if (typeof wert !== 'object' || wert === null) {
    return false;
  }

  const satz = wert as Record<string, unknown>;
  return Array.isArray(satz.quellen) && Array.isArray(satz.laeufe);
}

/** Holt Quellen, laufenden Import und die letzten Laeufe. */
export async function holeImportZustand(abrufen: Abrufen): Promise<ImportZustand> {
  try {
    const antwort = await abrufen('/api/import');
    if (!antwort.ok) {
      return IMPORT_UNBEKANNT;
    }

    const daten: unknown = await antwort.json();
    return istZustand(daten) ? daten : IMPORT_UNBEKANNT;
  } catch {
    return IMPORT_UNBEKANNT;
  }
}

/** Die Meldung aus einer abweisenden Antwort des Servers. */
function fehlerText(daten: unknown, ersatz: string): string {
  return typeof daten === 'object' &&
    daten !== null &&
    typeof (daten as { fehler?: unknown }).fehler === 'string'
    ? (daten as { fehler: string }).fehler
    : ersatz;
}

/**
 * Startet einen Lauf, wahlweise begrenzt auf einen Ordner der Quelle.
 * Weist der Server ab (zum Beispiel "Import läuft bereits"), steht seine
 * Meldung im Zustand.
 */
export async function starteImport(
  abrufen: Abrufen,
  quelle: string,
  ordner = '',
): Promise<ImportZustand> {
  let antwort: Response;
  try {
    antwort = await abrufen('/api/import/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quelle, ordner }),
    });
  } catch {
    return { ...IMPORT_UNBEKANNT, meldung: 'Server nicht erreichbar' };
  }

  const daten: unknown = await antwort.json().catch(() => undefined);

  if (!antwort.ok) {
    return {
      ...(await holeImportZustand(abrufen)),
      meldung: fehlerText(daten, 'Import nicht gestartet'),
    };
  }

  return istZustand(daten) ? daten : await holeImportZustand(abrufen);
}

/**
 * Bricht den laufenden Import ab. Der Lauf endet nach der gerade
 * bearbeiteten Datei; was bis dahin importiert ist, bleibt es.
 */
export async function brecheImportAb(abrufen: Abrufen): Promise<ImportZustand> {
  let antwort: Response;
  try {
    antwort = await abrufen('/api/import/abbrechen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return { ...IMPORT_UNBEKANNT, meldung: 'Server nicht erreichbar' };
  }

  const daten: unknown = await antwort.json().catch(() => undefined);

  if (!antwort.ok) {
    return {
      ...(await holeImportZustand(abrufen)),
      meldung: fehlerText(daten, 'Import nicht abgebrochen'),
    };
  }

  return istZustand(daten) ? daten : await holeImportZustand(abrufen);
}

function istWahl(wert: unknown): wert is OrdnerWahl {
  if (typeof wert !== 'object' || wert === null) {
    return false;
  }

  const satz = wert as Record<string, unknown>;
  return typeof satz.ordner === 'string' && Array.isArray(satz.unterordner);
}

/**
 * Holt eine Ebene der Ordner-Auswahl. Antwortet der Server nicht oder
 * weist er ab, kommt eine leere Ebene samt Meldung zurueck — die Seite
 * bleibt dann bedienbar.
 */
export async function holeOrdner(
  abrufen: Abrufen,
  quelle: string,
  ordner = '',
): Promise<OrdnerWahl> {
  const leer: OrdnerWahl = { quelle, ordner, dateien: 0, unterordner: [] };

  let antwort: Response;
  try {
    antwort = await abrufen(
      `/api/import/ordner?quelle=${encodeURIComponent(quelle)}&ordner=${encodeURIComponent(ordner)}`,
    );
  } catch {
    return { ...leer, meldung: 'Server nicht erreichbar' };
  }

  const daten: unknown = await antwort.json().catch(() => undefined);
  if (!antwort.ok) {
    return { ...leer, meldung: fehlerText(daten, 'Ordner nicht gelesen') };
  }

  return istWahl(daten) ? { ...(daten as OrdnerWahl), quelle } : leer;
}
