import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fuehreImportBereich } from './seite.js';

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let bereich: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<main id="app"><section id="import"></section></main>';
  const gefunden = document.querySelector<HTMLElement>('#import');
  if (gefunden === null) {
    throw new Error('#import fehlt');
  }
  bereich = gefunden;
});

const quellen = [
  { name: 'Test', verfuegbar: true },
  { name: 'Altbestand', verfuegbar: true },
];

const laufend = { quelle: 'Test', begonnen: '2026-10-10T08:00:00.000Z', erledigt: 7, gesamt: 42 };

/** Wartefunktion, die nicht wirklich wartet. */
const sofort = (): Promise<void> => Promise.resolve();

describe('Fortschritt nach dem Neuladen', () => {
  it('zeigt "x von y Dateien" allein aus der Antwort des Servers', async () => {
    // Frisch geladene Seite: kein Wissen aus dem Browser, nur /api/import.
    await fuehreImportBereich(
      bereich,
      () => Promise.resolve(antwort({ quellen, laufend: undefined, laeufe: [] })),
      { warte: sofort },
    );
    expect(bereich.querySelector('.import-fortschritt')).toBeNull();

    let antworten = 0;
    await fuehreImportBereich(
      bereich,
      () => {
        antworten += 1;
        // Beim zweiten Abruf ist der Lauf fertig, damit die Verfolgung endet.
        return Promise.resolve(
          antwort({ quellen, laufend: antworten === 1 ? laufend : undefined, laeufe: [] }),
        );
      },
      { warte: sofort },
    );

    expect(antworten).toBe(2);
    expect(bereich.querySelector('.import-fortschritt')).toBeNull();
  });

  it('zeigt den Fortschritt, solange der Server einen Lauf meldet', async () => {
    let antworten = 0;
    await fuehreImportBereich(
      bereich,
      () => {
        antworten += 1;
        if (antworten === 1) {
          return Promise.resolve(antwort({ quellen, laufend, laeufe: [] }));
        }
        if (antworten === 2) {
          return Promise.resolve(
            antwort({ quellen, laufend: { ...laufend, erledigt: 19 }, laeufe: [] }),
          );
        }
        return Promise.resolve(antwort({ quellen, laeufe: [] }));
      },
      {
        warte: () => {
          // Zwischen den Abfragen steht der zuletzt gemeldete Stand da.
          const text = bereich.querySelector('.import-fortschritt')?.textContent;
          expect(text).toBe(antworten === 1 ? 'Test: 7 von 42 Dateien' : 'Test: 19 von 42 Dateien');
          return Promise.resolve();
        },
      },
    );

    expect(antworten).toBe(3);
  });
});

describe('zweiter Import', () => {
  it('zeigt die Meldung des Servers und startet keinen zweiten Lauf', async () => {
    const gestartet: string[] = [];
    const abrufen = (url: string, optionen?: RequestInit): Promise<Response> => {
      if (url === '/api/import/start') {
        gestartet.push(String(optionen?.body));
        return Promise.resolve(antwort({ fehler: 'Import läuft bereits' }, 409));
      }
      return Promise.resolve(antwort({ quellen, laeufe: [] }));
    };

    await fuehreImportBereich(bereich, abrufen, { warte: sofort });
    bereich.querySelectorAll<HTMLButtonElement>('.quelle-start')[1]?.click();

    await vi.waitFor(() => {
      expect(bereich.querySelector('.import-meldung')?.textContent).toBe('Import läuft bereits');
    });
    expect(gestartet).toEqual(['{"quelle":"Altbestand"}']);
  });

  it('meldet es, wenn der Server nicht erreichbar ist', async () => {
    const abrufen = (url: string): Promise<Response> => {
      if (url === '/api/import/start') {
        return Promise.reject(new Error('keine Verbindung'));
      }
      return Promise.resolve(antwort({ quellen, laeufe: [] }));
    };

    await fuehreImportBereich(bereich, abrufen, { warte: sofort });
    bereich.querySelector<HTMLButtonElement>('.quelle-start')?.click();

    await vi.waitFor(() => {
      expect(bereich.querySelector('.import-meldung')?.textContent).toBe('Server nicht erreichbar');
    });
  });
});
