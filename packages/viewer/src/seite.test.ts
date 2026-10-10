import { beforeEach, describe, expect, it } from 'vitest';

import { starteSeite, zeichneSeite, type SeiteOptionen } from './seite.js';

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Stellt einen Server nach, der Umgebung, ready-Status und Import liefert. */
function server(options: {
  umgebung?: string;
  ready?: { status: number; koerper: unknown };
  fehlerBei?: string;
  import?: unknown;
}): (url: string) => Promise<Response> {
  return (url) => {
    if (url === options.fehlerBei) {
      return Promise.reject(new Error('keine Verbindung'));
    }
    if (url === '/api/umgebung') {
      return Promise.resolve(antwort({ umgebung: options.umgebung ?? 'dev' }));
    }
    if (url === '/health/ready') {
      const ready = options.ready ?? { status: 200, koerper: { datenbank: 'ok', fotos: 'ok' } };
      return Promise.resolve(antwort(ready.koerper, ready.status));
    }
    if (url === '/api/import') {
      return Promise.resolve(antwort(options.import ?? { quellen: [], laeufe: [] }));
    }
    if (url === '/api/archiv') {
      return Promise.resolve(
        antwort({ fotos: 120, dateien: 231, vermisst: 1, alarme: 0, unbekannte: 0 }),
      );
    }
    return Promise.resolve(new Response('', { status: 404 }));
  };
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
});

/**
 * Baut die Seite auf und beendet das Abfragen danach. Im Browser fragt
 * die Seite endlos weiter; der Test will nach dem ersten Durchgang
 * nachsehen und braucht dabei keine echte Wartezeit.
 */
function oeffne(
  abrufen: (url: string) => Promise<Response>,
  optionen: SeiteOptionen = {},
): Promise<void> {
  return starteSeite(document, abrufen, {
    warte: () => Promise.resolve(),
    weiter: () => false,
    ...optionen,
  });
}

function seite(): HTMLElement {
  const wurzel = document.querySelector<HTMLElement>('#app');
  if (wurzel === null) {
    throw new Error('#app fehlt');
  }
  return wurzel;
}

describe('starteSeite', () => {
  it('zeigt Knipsa, die Umgebung dev und eine gruene Ampel', async () => {
    await oeffne(server({ umgebung: 'dev' }));

    const wurzel = seite();
    expect(wurzel.querySelector('h1')?.textContent).toBe('Knipsa');
    expect(wurzel.querySelector('.umgebung')?.textContent).toBe('Umgebung: dev');
    expect(wurzel.querySelector<HTMLElement>('.ampel')?.dataset.ampel).toBe('gruen');
    expect(wurzel.textContent).toContain('bereit');
  });

  it('zeigt prod, wenn der Server prod meldet', async () => {
    await oeffne(server({ umgebung: 'prod' }));

    expect(seite().querySelector<HTMLElement>('.umgebung')?.dataset.umgebung).toBe('prod');
  });

  it('zeigt eine rote Ampel, wenn ready 503 meldet', async () => {
    await oeffne(server({ ready: { status: 503, koerper: { datenbank: 'fehler', fotos: 'ok' } } }));

    const wurzel = seite();
    expect(wurzel.querySelector<HTMLElement>('.ampel')?.dataset.ampel).toBe('rot');
    expect(wurzel.textContent).toContain('nicht bereit');
  });

  it('zeigt eine gelbe Ampel, wenn der Server nicht antwortet', async () => {
    await oeffne(server({ fehlerBei: '/health/ready' }));

    expect(seite().querySelector<HTMLElement>('.ampel')?.dataset.ampel).toBe('gelb');
  });

  it('zeigt unbekannt, wenn die Umgebungs-Auskunft fehlt', async () => {
    await oeffne(server({ fehlerBei: '/api/umgebung' }));

    expect(seite().querySelector('.umgebung')?.textContent).toBe('Umgebung: unbekannt');
  });

  it('zeichnet beim zweiten Lauf nicht doppelt', () => {
    const wurzel = seite();
    const zustand = { umgebung: 'dev', ready: { erreichbar: true as const } };

    zeichneSeite(wurzel, zustand);
    zeichneSeite(wurzel, zustand);

    expect(wurzel.querySelectorAll('h1')).toHaveLength(1);
  });

  it('haengt den Bereich Import mit den Quellen des Servers an', async () => {
    await oeffne(
      server({
        import: {
          quellen: [{ name: 'Test', anzeige: 'Test', art: 'ordner', verfuegbar: true }],
          laeufe: [],
        },
      }),
    );

    const bereich = seite().querySelector('#import');
    expect(bereich?.querySelector('h2')?.textContent).toBe('Import');
    expect(bereich?.querySelector('.quelle-name')?.textContent).toBe('Test');
  });

  it('haengt den Bereich Archiv mit den Zahlen des Servers an', async () => {
    await oeffne(server({}));

    const bereich = seite().querySelector('#archiv');
    expect(bereich?.querySelector('h2')?.textContent).toBe('Archiv');
    expect(bereich?.querySelector('.archiv-zahl[data-art="fotos"] .zahl-knopf')?.textContent).toBe(
      'Fotos: 120',
    );
    expect(bereich?.querySelectorAll('img')).toHaveLength(0);
  });
});

describe('eingesteckte Datentraeger', () => {
  /** Server, dessen Quellen-Liste sich von Abfrage zu Abfrage aendert. */
  function wechselnd(folge: readonly unknown[]): (url: string) => Promise<Response> {
    let stelle = 0;
    return (url) => {
      if (url === '/api/import') {
        const quellen = folge[Math.min(stelle, folge.length - 1)];
        stelle += 1;
        return Promise.resolve(antwort({ quellen, laeufe: [] }));
      }
      return server({})(url);
    };
  }

  const karte = {
    name: 'NIKON D750',
    anzeige: 'NIKON D750 (64 GB)',
    art: 'datentraeger',
    verfuegbar: true,
  };

  it('zeigt eine eingesteckte Karte ohne Neuladen mit Bezeichnung und Groesse', async () => {
    // Beim Aufbau ist nichts eingesteckt, bei der naechsten Abfrage schon.
    let runden = 0;
    await oeffne(wechselnd([[], [karte]]), { weiter: () => (runden += 1) <= 1 });

    const zeile = seite().querySelector<HTMLElement>('.quelle');
    expect(zeile?.dataset.quelle).toBe('NIKON D750');
    expect(zeile?.dataset.art).toBe('datentraeger');
    expect(zeile?.querySelector('.quelle-name')?.textContent).toBe('NIKON D750 (64 GB)');
  });

  it('nimmt eine herausgezogene Karte ohne Neuladen wieder aus der Liste', async () => {
    let runden = 0;
    await oeffne(wechselnd([[karte], []]), { weiter: () => (runden += 1) <= 1 });

    expect(seite().querySelectorAll('.quelle')).toHaveLength(0);
    expect(seite().querySelector('.quellen-leer')?.textContent).toBe('Keine Quelle eingestellt');
  });

  it('fragt im Leerlauf oefter als alle 10 Sekunden nach den Quellen', async () => {
    const takte: number[] = [];
    let runden = 0;

    await oeffne(wechselnd([[]]), {
      warte: (ms) => {
        takte.push(ms);
        return Promise.resolve();
      },
      weiter: () => (runden += 1) <= 2,
    });

    expect(takte).toHaveLength(2);
    for (const takt of takte) {
      expect(takt).toBeLessThan(10_000);
    }
  });
});
