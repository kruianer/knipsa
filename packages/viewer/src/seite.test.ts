import { beforeEach, describe, expect, it } from 'vitest';

import { starteSeite, zeichneSeite } from './seite.js';

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Stellt einen Server nach, der Umgebung und ready-Status liefert. */
function server(options: {
  umgebung?: string;
  ready?: { status: number; koerper: unknown };
  fehlerBei?: string;
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
    return Promise.resolve(new Response('', { status: 404 }));
  };
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
});

function seite(): HTMLElement {
  const wurzel = document.querySelector<HTMLElement>('#app');
  if (wurzel === null) {
    throw new Error('#app fehlt');
  }
  return wurzel;
}

describe('starteSeite', () => {
  it('zeigt Knipsa, die Umgebung dev und eine gruene Ampel', async () => {
    await starteSeite(document, server({ umgebung: 'dev' }));

    const wurzel = seite();
    expect(wurzel.querySelector('h1')?.textContent).toBe('Knipsa');
    expect(wurzel.querySelector('.umgebung')?.textContent).toBe('Umgebung: dev');
    expect(wurzel.querySelector<HTMLElement>('.ampel')?.dataset.ampel).toBe('gruen');
    expect(wurzel.textContent).toContain('bereit');
  });

  it('zeigt prod, wenn der Server prod meldet', async () => {
    await starteSeite(document, server({ umgebung: 'prod' }));

    expect(seite().querySelector<HTMLElement>('.umgebung')?.dataset.umgebung).toBe('prod');
  });

  it('zeigt eine rote Ampel, wenn ready 503 meldet', async () => {
    await starteSeite(
      document,
      server({ ready: { status: 503, koerper: { datenbank: 'fehler', fotos: 'ok' } } }),
    );

    const wurzel = seite();
    expect(wurzel.querySelector<HTMLElement>('.ampel')?.dataset.ampel).toBe('rot');
    expect(wurzel.textContent).toContain('nicht bereit');
  });

  it('zeigt eine gelbe Ampel, wenn der Server nicht antwortet', async () => {
    await starteSeite(document, server({ fehlerBei: '/health/ready' }));

    expect(seite().querySelector<HTMLElement>('.ampel')?.dataset.ampel).toBe('gelb');
  });

  it('zeigt unbekannt, wenn die Umgebungs-Auskunft fehlt', async () => {
    await starteSeite(document, server({ fehlerBei: '/api/umgebung' }));

    expect(seite().querySelector('.umgebung')?.textContent).toBe('Umgebung: unbekannt');
  });

  it('zeichnet beim zweiten Lauf nicht doppelt', () => {
    const wurzel = seite();
    const zustand = { umgebung: 'dev', ready: { erreichbar: true as const } };

    zeichneSeite(wurzel, zustand);
    zeichneSeite(wurzel, zustand);

    expect(wurzel.querySelectorAll('h1')).toHaveLength(1);
  });
});
