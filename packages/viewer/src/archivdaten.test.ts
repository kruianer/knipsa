import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fuehreArchivBereich } from './seite.js';

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let bereich: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<main id="app"><section id="archiv"></section></main>';
  const gefunden = document.querySelector<HTMLElement>('#archiv');
  if (gefunden === null) {
    throw new Error('#archiv fehlt');
  }
  bereich = gefunden;
});

/** Wartefunktion, die nicht wirklich wartet. */
const sofort = (): Promise<void> => Promise.resolve();

/** Laesst genau `runden` weitere Abfragen zu. */
function hoechstens(runden: number): () => boolean {
  let gezaehlt = 0;
  return () => (gezaehlt += 1) <= runden;
}

const ZAHLEN = {
  fotos: 1,
  dateien: 2,
  vermisst: 0,
  alarme: 0,
  unbekannte: 0,
  letzter: {
    art: 'abgleich',
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:02.000Z',
    dauerMs: 2000,
    fotos: 1,
    dateien: 2,
    vermisst: 0,
    alarme: 0,
    unbekannte: 0,
  },
};

const SCHLUESSEL = '20190614-101500a';

/** Ein Server, der Zahlen, Listen und das Nachschlagen beantwortet. */
function server(
  stand: {
    zahlen?: unknown;
    listen?: Record<string, readonly string[]>;
    auskunft?: Record<string, string>;
  } = {},
  mitschrift: string[] = [],
): (url: string, optionen?: RequestInit) => Promise<Response> {
  return (url, optionen) => {
    mitschrift.push(`${optionen?.method ?? 'GET'} ${url}`);

    if (url === '/api/archiv') {
      return Promise.resolve(antwort(stand.zahlen ?? ZAHLEN));
    }
    if (url.startsWith('/api/archiv/liste')) {
      const art = new URL(url, 'http://test').searchParams.get('art') ?? '';
      return Promise.resolve(antwort({ art, grenze: 500, zeilen: stand.listen?.[art] ?? [] }));
    }
    if (url.startsWith('/api/archiv/foto')) {
      const schluessel = new URL(url, 'http://test').searchParams.get('schluessel') ?? '';
      const text = stand.auskunft?.[schluessel];
      return Promise.resolve(
        text === undefined
          ? antwort({ fehler: 'Schlüssel im Index nicht gefunden' }, 404)
          : antwort({ schluessel, text }),
      );
    }
    if (url === '/api/archiv/abgleich' || url === '/api/archiv/neu-aufbauen') {
      return Promise.resolve(antwort(stand.zahlen ?? ZAHLEN, 202));
    }

    return Promise.resolve(new Response('', { status: 404 }));
  };
}

/** Das Feld "Schlüssel nachschlagen" samt Knopfdruck. */
function schlageNach(schluessel: string): void {
  const feld = bereich.querySelector<HTMLInputElement>('.nachschlagen-feld');
  if (feld === null) {
    throw new Error('Feld fehlt');
  }

  feld.value = schluessel;
  bereich.querySelector<HTMLButtonElement>('.nachschlagen-knopf')?.click();
}

describe('Bereich Archiv am Server', () => {
  it('zeigt die Zahlen des Servers', async () => {
    await fuehreArchivBereich(bereich, server(), { warte: sofort, weiter: () => false });

    expect(bereich.querySelector('.archiv-zahl[data-art="fotos"] .zahl-knopf')?.textContent).toBe(
      'Fotos: 1',
    );
    expect(bereich.querySelector('.archiv-letzter')?.textContent).toContain('2 Sekunden');
  });

  it('bleibt bedienbar, wenn der Server nicht antwortet', async () => {
    await fuehreArchivBereich(bereich, () => Promise.reject(new Error('keine Verbindung')), {
      warte: sofort,
      weiter: () => false,
    });

    expect(bereich.querySelector('.archiv-zahl[data-art="fotos"] .zahl-knopf')?.textContent).toBe(
      'Fotos: 0',
    );
  });

  it('stoesst auf Knopfdruck einen Abgleich an', async () => {
    const mitschrift: string[] = [];
    await fuehreArchivBereich(bereich, server({}, mitschrift), {
      warte: sofort,
      weiter: () => false,
    });

    bereich.querySelector<HTMLButtonElement>('.archiv-abgleich')?.click();

    await vi.waitFor(() => {
      expect(mitschrift).toContain('POST /api/archiv/abgleich');
    });
  });

  it('baut erst nach bestaetigter Nachfrage neu auf', async () => {
    const mitschrift: string[] = [];
    await fuehreArchivBereich(bereich, server({}, mitschrift), {
      warte: sofort,
      weiter: () => false,
    });

    bereich.querySelector<HTMLButtonElement>('.archiv-neu')?.click();
    expect(mitschrift).not.toContain('POST /api/archiv/neu-aufbauen');
    expect(bereich.querySelector('.nachfrage-text')).not.toBeNull();

    bereich.querySelector<HTMLButtonElement>('.nachfrage-ja')?.click();

    await vi.waitFor(() => {
      expect(mitschrift).toContain('POST /api/archiv/neu-aufbauen');
    });
  });

  it('holt die Liste beim Aufklappen und laesst sie beim Zuklappen verschwinden', async () => {
    const abrufen = server({ listen: { dateien: ['_wartend/2019-06/20190614-101500a.NEF'] } });
    await fuehreArchivBereich(bereich, abrufen, { warte: sofort, weiter: () => false });

    const knopf = (): HTMLButtonElement | null =>
      bereich.querySelector<HTMLButtonElement>('.archiv-zahl[data-art="dateien"] .zahl-knopf');
    const liste = (): Element | null =>
      bereich.querySelector('.archiv-zahl[data-art="dateien"] .zahl-liste');

    knopf()?.click();
    await vi.waitFor(() => {
      expect(liste()?.textContent).toBe('_wartend/2019-06/20190614-101500a.NEF');
    });

    knopf()?.click();
    await vi.waitFor(() => {
      expect(liste()).toBeNull();
    });
  });

  it('zeigt die Angaben eines nachgeschlagenen Schluessels', async () => {
    const abrufen = server({
      auskunft: {
        [SCHLUESSEL]: `Schlüssel: ${SCHLUESSEL}\nBewertung: 4 Sterne\nStichwörter: Toskana\n`,
      },
    });
    await fuehreArchivBereich(bereich, abrufen, { warte: sofort, weiter: () => false });

    schlageNach(SCHLUESSEL);

    await vi.waitFor(() => {
      const auskunft = bereich.querySelector('.nachschlagen-auskunft');
      expect(auskunft?.textContent).toContain('4 Sterne');
      expect(auskunft?.textContent).toContain('Toskana');
    });
  });

  it('meldet einen unbekannten Schluessel im Klartext', async () => {
    await fuehreArchivBereich(bereich, server(), { warte: sofort, weiter: () => false });

    schlageNach('20200101-000000a');

    await vi.waitFor(() => {
      expect(bereich.querySelector('.nachschlagen-meldung')?.textContent).toBe(
        'Schlüssel im Index nicht gefunden',
      );
    });
  });

  it('verlangt einen Schluessel, bevor es nachschlaegt', async () => {
    const mitschrift: string[] = [];
    await fuehreArchivBereich(bereich, server({}, mitschrift), {
      warte: sofort,
      weiter: () => false,
    });

    schlageNach('   ');

    await vi.waitFor(() => {
      expect(bereich.querySelector('.nachschlagen-meldung')?.textContent).toBe(
        'Bitte einen Schlüssel eingeben',
      );
    });
    expect(mitschrift.filter((zeile) => zeile.includes('/api/archiv/foto'))).toHaveLength(0);
  });

  it('zieht eine offene Liste bei der naechsten Abfrage mit', async () => {
    let listenRunde = 0;
    const abrufen = (url: string): Promise<Response> => {
      if (url.startsWith('/api/archiv/liste')) {
        listenRunde += 1;
        // Beim ersten Mal ist das Foto vermisst, danach wieder da.
        return Promise.resolve(
          antwort({ art: 'vermisst', grenze: 500, zeilen: listenRunde === 1 ? [SCHLUESSEL] : [] }),
        );
      }
      return server()(url);
    };

    const liste = (): Element | null =>
      bereich.querySelector('.archiv-zahl[data-art="vermisst"] .zahl-liste');

    await fuehreArchivBereich(bereich, abrufen, {
      warte: async () => {
        if (listenRunde > 0) {
          return;
        }

        bereich
          .querySelector<HTMLButtonElement>('.archiv-zahl[data-art="vermisst"] .zahl-knopf')
          ?.click();
        await vi.waitFor(() => {
          expect(liste()?.textContent).toBe(SCHLUESSEL);
        });
      },
      weiter: hoechstens(1),
    });

    expect(listenRunde).toBe(2);
    expect(liste()?.textContent).toBe('Nichts dabei');
  });
});
