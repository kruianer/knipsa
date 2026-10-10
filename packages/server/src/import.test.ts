import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ImportDienst, type LaufErgebnis } from '@knipsa/pipeline';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from './app.js';
import { testKonfiguration } from './test/konfiguration.js';

let app: FastifyInstance | undefined;
let wurzel: string;
let quellenPfad: string;

/** Ein Lauf, der nichts kopiert — hier zaehlt nur die Route. */
function ergebnis(quelle: string): LaufErgebnis {
  return {
    quelle,
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:01.000Z',
    gesamt: 1,
    neu: 1,
    bekannt: 0,
    uebersprungen: 0,
    problem: 0,
    dateien: [
      {
        art: 'neu',
        quellPfad: 'Toskana 2019/DSC_0412.NEF',
        schluessel: '20190614-101500a',
        ablage: '_wartend/2019-06/20190614-101500a.NEF',
      },
    ],
    protokoll: 'protokoll/import/20191010-080000-Test.log',
  };
}

function baueDienst(): ImportDienst {
  return new ImportDienst({
    wurzel,
    quellen: [
      { name: 'Test', pfad: quellenPfad },
      { name: 'Fehlt', pfad: join(quellenPfad, 'gibt-es-nicht') },
    ],
    lauf: ({ quelle }) => Promise.resolve(ergebnis(quelle.name)),
    leser: () => ({
      leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
      schliesse: () => Promise.resolve(),
    }),
  });
}

beforeEach(async () => {
  const platz = await mkdtemp(join(tmpdir(), 'knipsa-import-api-'));
  wurzel = join(platz, 'fotos');
  quellenPfad = await mkdtemp(join(tmpdir(), 'knipsa-quelle-'));
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function starte(dienst = baueDienst()): { app: FastifyInstance; dienst: ImportDienst } {
  app = baueApp({ konfig: testKonfiguration(), importDienst: dienst });
  return { app, dienst };
}

describe('GET /api/import', () => {
  it('nennt je Quelle den Namen und ob sie verfuegbar ist', async () => {
    const { app: server } = starte();

    const antwort = await server.inject({ method: 'GET', url: '/api/import' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({
      quellen: [
        { name: 'Test', anzeige: 'Test', art: 'ordner', verfuegbar: true },
        { name: 'Fehlt', anzeige: 'Fehlt', art: 'ordner', verfuegbar: false },
      ],
      laeufe: [],
    });
  });

  it('wird nicht zwischengespeichert', async () => {
    const { app: server } = starte();

    const antwort = await server.inject({ method: 'GET', url: '/api/import' });

    expect(antwort.headers['cache-control']).toBe('no-store');
  });
});

describe('POST /api/import/start', () => {
  it('startet den Lauf und meldet ihn danach als Ergebnis', async () => {
    const { app: server, dienst } = starte();

    const antwort = await server.inject({
      method: 'POST',
      url: '/api/import/start',
      payload: { quelle: 'Test' },
    });
    await dienst.arbeit();

    expect(antwort.statusCode).toBe(202);
    const zustand = await dienst.zustand();
    expect(zustand.laufend).toBeUndefined();
    expect(zustand.laeufe).toHaveLength(1);
    expect(zustand.laeufe[0]?.quelle).toBe('Test');
  });

  it('antwortet 404 fuer eine unbekannte Quelle', async () => {
    const { app: server } = starte();

    const antwort = await server.inject({
      method: 'POST',
      url: '/api/import/start',
      payload: { quelle: 'Gibt-es-nicht' },
    });

    expect(antwort.statusCode).toBe(404);
    expect(antwort.json().fehler).toBe('Quelle nicht bekannt');
  });

  it('antwortet 409 mit "Import läuft bereits", wenn schon einer laeuft', async () => {
    let weiter: () => void = () => {};
    const tor = new Promise<void>((fertig) => {
      weiter = fertig;
    });
    const laeufe: string[] = [];
    const dienst = new ImportDienst({
      wurzel,
      quellen: [
        { name: 'Test', pfad: quellenPfad },
        { name: 'Altbestand', pfad: quellenPfad },
      ],
      lauf: async ({ quelle, melde }) => {
        laeufe.push(quelle.name);
        melde({ erledigt: 3, gesamt: 42 });
        await tor;
        return ergebnis(quelle.name);
      },
      leser: () => ({
        leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
        schliesse: () => Promise.resolve(),
      }),
    });
    const { app: server } = starte(dienst);

    await server.inject({ method: 'POST', url: '/api/import/start', payload: { quelle: 'Test' } });
    const zweiter = await server.inject({
      method: 'POST',
      url: '/api/import/start',
      payload: { quelle: 'Altbestand' },
    });

    expect(zweiter.statusCode).toBe(409);
    expect(zweiter.json().fehler).toBe('Import läuft bereits');
    expect(laeufe).toEqual(['Test']);

    // Nach dem Neuladen der Seite steht derselbe Fortschritt dort.
    const zustand = await server.inject({ method: 'GET', url: '/api/import' });
    expect(zustand.json().laufend).toEqual({
      quelle: 'Test',
      begonnen: expect.any(String),
      erledigt: 3,
      gesamt: 42,
    });

    weiter();
    await dienst.arbeit();
  });

  it('antwortet 409, wenn die Quelle nicht verfuegbar ist', async () => {
    const { app: server } = starte();

    const antwort = await server.inject({
      method: 'POST',
      url: '/api/import/start',
      payload: { quelle: 'Fehlt' },
    });

    expect(antwort.statusCode).toBe(409);
    expect(antwort.json().fehler).toBe('Quelle nicht verfügbar');
  });
});
