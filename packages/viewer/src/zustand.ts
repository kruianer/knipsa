/** Was die Minimalseite anzeigt: Umgebung und Ampel aus /health/ready. */

export type Pruefstatus = 'ok' | 'fehler';

export type AmpelFarbe = 'gruen' | 'gelb' | 'rot';

export interface ReadyErgebnis {
  /** Hat der Server ueberhaupt geantwortet? */
  readonly erreichbar: boolean;
  readonly datenbank?: Pruefstatus | undefined;
  readonly fotos?: Pruefstatus | undefined;
}

export interface Zustand {
  readonly umgebung: string;
  readonly ready: ReadyErgebnis;
}

/** Unbekannte Umgebung, solange die Auskunft fehlt. */
export const UMGEBUNG_UNBEKANNT = 'unbekannt';

export function ampelFarbe(ready: ReadyErgebnis): AmpelFarbe {
  if (!ready.erreichbar) {
    return 'gelb';
  }

  return ready.datenbank === 'ok' && ready.fotos === 'ok' ? 'gruen' : 'rot';
}

export function ampelText(farbe: AmpelFarbe): string {
  switch (farbe) {
    case 'gruen':
      return 'bereit';
    case 'rot':
      return 'nicht bereit';
    case 'gelb':
      return 'keine Antwort';
  }
}

type Abrufen = (url: string) => Promise<Response>;

async function holeUmgebung(abrufen: Abrufen): Promise<string> {
  try {
    const antwort = await abrufen('/api/umgebung');
    if (!antwort.ok) {
      return UMGEBUNG_UNBEKANNT;
    }
    const daten = (await antwort.json()) as { umgebung?: string };
    return daten.umgebung ?? UMGEBUNG_UNBEKANNT;
  } catch {
    return UMGEBUNG_UNBEKANNT;
  }
}

async function holeReady(abrufen: Abrufen): Promise<ReadyErgebnis> {
  try {
    const antwort = await abrufen('/health/ready');
    const daten = (await antwort.json()) as { datenbank?: Pruefstatus; fotos?: Pruefstatus };
    return { erreichbar: true, datenbank: daten.datenbank, fotos: daten.fotos };
  } catch {
    return { erreichbar: false };
  }
}

/** Fragt Umgebung und Health-Zustand beim Server ab. */
export async function holeZustand(abrufen: Abrufen): Promise<Zustand> {
  const [umgebung, ready] = await Promise.all([holeUmgebung(abrufen), holeReady(abrufen)]);
  return { umgebung, ready };
}
