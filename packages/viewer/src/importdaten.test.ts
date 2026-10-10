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

/**
 * Laesst genau `runden` weitere Abfragen zu. Im Browser fragt die Seite
 * endlos weiter; der Test will nach wenigen Durchgaengen nachsehen.
 */
function hoechstens(runden: number): () => boolean {
  let gezaehlt = 0;
  return () => (gezaehlt += 1) <= runden;
}

describe('Fortschritt nach dem Neuladen', () => {
  it('zeigt "x von y Dateien" allein aus der Antwort des Servers', async () => {
    // Frisch geladene Seite: kein Wissen aus dem Browser, nur /api/import.
    await fuehreImportBereich(
      bereich,
      () => Promise.resolve(antwort({ quellen, laufend: undefined, laeufe: [] })),
      { warte: sofort, weiter: () => false },
    );
    expect(bereich.querySelector('.import-fortschritt')).toBeNull();

    let antworten = 0;
    await fuehreImportBereich(
      bereich,
      () => {
        antworten += 1;
        // Beim zweiten Abruf ist der Lauf fertig.
        return Promise.resolve(
          antwort({ quellen, laufend: antworten === 1 ? laufend : undefined, laeufe: [] }),
        );
      },
      { warte: sofort, weiter: hoechstens(1) },
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
        weiter: hoechstens(2),
      },
    );

    expect(antworten).toBe(3);
  });

  it('fragt waehrend eines Laufs im engeren Takt als im Leerlauf', async () => {
    const takte: number[] = [];
    let antworten = 0;

    await fuehreImportBereich(
      bereich,
      () => {
        antworten += 1;
        return Promise.resolve(
          antwort({ quellen, laufend: antworten === 1 ? laufend : undefined, laeufe: [] }),
        );
      },
      {
        warte: (ms) => {
          takte.push(ms);
          return Promise.resolve();
        },
        weiter: hoechstens(2),
      },
    );

    // Erst wartet die Seite im Takt des Fortschritts, nach dem Ende des
    // Laufs wieder im Takt der Quellen.
    expect(takte[0]).toBeLessThan(takte[1] ?? 0);
  });
});

describe('Ordner wählen', () => {
  const karte = {
    name: 'NIKON D750',
    anzeige: 'NIKON D750 (64 GB)',
    art: 'datentraeger',
    verfuegbar: true,
  };

  /** Server mit einer Karte, deren Ordner er Ebene fuer Ebene meldet. */
  function mitKarte(gestartet: string[] = []): (url: string, o?: RequestInit) => Promise<Response> {
    return (url, optionen) => {
      if (url.startsWith('/api/import/ordner')) {
        const ordner = new URL(url, 'http://test').searchParams.get('ordner') ?? '';
        return Promise.resolve(
          antwort(
            ordner === ''
              ? {
                  quelle: 'NIKON D750',
                  ordner: '',
                  dateien: 3,
                  unterordner: [{ name: 'DCIM', pfad: 'DCIM', dateien: 3, weiter: true }],
                }
              : {
                  quelle: 'NIKON D750',
                  ordner: 'DCIM',
                  dateien: 3,
                  unterordner: [
                    { name: '101NIKON', pfad: 'DCIM/101NIKON', dateien: 1, weiter: false },
                  ],
                },
          ),
        );
      }
      if (url === '/api/import/start') {
        gestartet.push(String(optionen?.body));
        return Promise.resolve(antwort({ quellen: [karte], laeufe: [] }, 202));
      }
      return Promise.resolve(antwort({ quellen: [karte], laeufe: [] }));
    };
  }

  it('holt die Ordner des Datentraegers und zeigt die naechste Ebene', async () => {
    await fuehreImportBereich(bereich, mitKarte(), { warte: sofort, weiter: () => false });

    bereich.querySelector<HTMLButtonElement>('.quelle-ordner')?.click();
    await vi.waitFor(() => {
      expect(bereich.querySelector('.ordner-name')?.textContent).toBe('DCIM');
    });

    bereich.querySelector<HTMLButtonElement>('.ordner-oeffnen')?.click();
    await vi.waitFor(() => {
      expect(bereich.querySelector('.ordner-name')?.textContent).toBe('101NIKON');
    });
  });

  it('laesst die Auswahl stehen, waehrend die Seite weiter abfragt', async () => {
    // Hier laeuft das Abfragen wie im Browser weiter, waehrend bedient
    // wird: die offene Auswahl darf dabei nicht wegwischt werden.
    let runden = 0;
    let schluss = false;
    const bereit = fuehreImportBereich(bereich, mitKarte(), {
      warte: () => new Promise((fertig) => setTimeout(fertig, 1)),
      weiter: () => {
        runden += 1;
        return !schluss;
      },
    });

    await vi.waitFor(() => {
      expect(bereich.querySelector('.quelle-ordner')).not.toBeNull();
    });
    bereich.querySelector<HTMLButtonElement>('.quelle-ordner')?.click();
    await vi.waitFor(() => {
      expect(bereich.querySelector('.ordnerwahl')).not.toBeNull();
    });

    const stand = runden;
    await vi.waitFor(() => {
      expect(runden).toBeGreaterThan(stand + 1);
    });
    expect(bereich.querySelector('.ordnerwahl')).not.toBeNull();

    schluss = true;
    await bereit;
  });

  it('startet den Lauf mit Quelle und Ordner', async () => {
    const gestartet: string[] = [];
    await fuehreImportBereich(bereich, mitKarte(gestartet), {
      warte: sofort,
      weiter: () => false,
    });

    bereich.querySelector<HTMLButtonElement>('.quelle-ordner')?.click();
    await vi.waitFor(() => {
      expect(bereich.querySelector('.ordner-start')).not.toBeNull();
    });
    bereich.querySelector<HTMLButtonElement>('.ordner-start')?.click();

    await vi.waitFor(() => {
      expect(gestartet).toEqual(['{"quelle":"NIKON D750","ordner":"DCIM"}']);
    });
    // Nach dem Start ist die Auswahl erledigt.
    await vi.waitFor(() => {
      expect(bereich.querySelector('.ordnerwahl')).toBeNull();
    });
  });

  it('meldet es, wenn der Server die Ordner nicht liefert', async () => {
    const abrufen = (url: string): Promise<Response> => {
      if (url.startsWith('/api/import/ordner')) {
        return Promise.resolve(antwort({ fehler: 'Ordner nicht bekannt' }, 404));
      }
      return Promise.resolve(antwort({ quellen: [karte], laeufe: [] }));
    };

    await fuehreImportBereich(bereich, abrufen, { warte: sofort, weiter: () => false });
    bereich.querySelector<HTMLButtonElement>('.quelle-ordner')?.click();

    await vi.waitFor(() => {
      expect(bereich.querySelector('.ordnerwahl-meldung')?.textContent).toBe(
        'Ordner nicht bekannt',
      );
    });
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

    await fuehreImportBereich(bereich, abrufen, { warte: sofort, weiter: () => false });
    bereich.querySelectorAll<HTMLButtonElement>('.quelle-start')[1]?.click();

    await vi.waitFor(() => {
      expect(bereich.querySelector('.import-meldung')?.textContent).toBe('Import läuft bereits');
    });
    expect(gestartet).toEqual(['{"quelle":"Altbestand","ordner":""}']);
  });

  it('meldet es, wenn der Server nicht erreichbar ist', async () => {
    const abrufen = (url: string): Promise<Response> => {
      if (url === '/api/import/start') {
        return Promise.reject(new Error('keine Verbindung'));
      }
      return Promise.resolve(antwort({ quellen, laeufe: [] }));
    };

    await fuehreImportBereich(bereich, abrufen, { warte: sofort, weiter: () => false });
    bereich.querySelector<HTMLButtonElement>('.quelle-start')?.click();

    await vi.waitFor(() => {
      expect(bereich.querySelector('.import-meldung')?.textContent).toBe('Server nicht erreichbar');
    });
  });
});
