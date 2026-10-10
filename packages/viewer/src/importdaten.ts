/** Abfragen des Bereichs "Import" gegen den Server. */

import { IMPORT_UNBEKANNT, type ImportZustand } from './importseite.js';

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

/**
 * Startet einen Lauf. Weist der Server ab (zum Beispiel "Import läuft
 * bereits"), steht seine Meldung im Zustand.
 */
export async function starteImport(abrufen: Abrufen, quelle: string): Promise<ImportZustand> {
  let antwort: Response;
  try {
    antwort = await abrufen('/api/import/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quelle }),
    });
  } catch {
    return { ...IMPORT_UNBEKANNT, meldung: 'Server nicht erreichbar' };
  }

  const daten: unknown = await antwort.json().catch(() => undefined);

  if (!antwort.ok) {
    const meldung =
      typeof daten === 'object' &&
      daten !== null &&
      typeof (daten as { fehler?: unknown }).fehler === 'string'
        ? (daten as { fehler: string }).fehler
        : 'Import nicht gestartet';
    return { ...(await holeImportZustand(abrufen)), meldung };
  }

  return istZustand(daten) ? daten : await holeImportZustand(abrufen);
}
