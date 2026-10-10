import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ArchivDienst,
  ImportDienst,
  KEINE_ANGABEN,
  LEERER_STAND,
  speicherIndex,
  Sperre,
  type ArchivIndex,
  type ArchivStand,
  type LaufErgebnis,
} from '@knipsa/pipeline';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { baueApp } from './app.js';
import { testDatenbank, type TestDatenbank } from './test/datenbank.js';
import { testKonfiguration } from './test/konfiguration.js';

let app: FastifyInstance | undefined;
let wurzel: string;
let index: ArchivIndex;
let datenbank: TestDatenbank | undefined;

const SCHLUESSEL = '20190614-101500a';

const STAND: ArchivStand = {
  fotos: [
    {
      schluessel: SCHLUESSEL,
      aufnahmezeit: '2019-06-14 10:15:00',
      bewertung: 4,
      farbmarkierung: undefined,
      stichwoerter: ['Toskana'],
      titel: undefined,
      beschreibung: undefined,
      gpsBreite: undefined,
      gpsLaenge: undefined,
      vermisst: false,
    },
  ],
  dateien: [
    {
      pfad: `_wartend/2019-06/${SCHLUESSEL}.NEF`,
      schluessel: SCHLUESSEL,
      groesse: 100,
      geaendert: 1_700_000_000_000,
      importPruefsumme: 'aa',
      bildPruefsumme: undefined,
      sidecar: undefined,
    },
  ],
  alarme: [],
  unbekannte: ['_wartend/2019-06/urlaub.jpg'],
  letzter: {
    art: 'abgleich',
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:02.000Z',
    dauerMs: 2000,
    fotos: 1,
    dateien: 1,
    vermisst: 0,
    alarme: 0,
    unbekannte: 1,
  },
};

/** Ergebnis eines Laufs, der nichts kopiert — hier zaehlt die Sperre. */
function laufErgebnis(): LaufErgebnis {
  return {
    quelle: 'Test',
    begonnen: '2026-10-10T08:00:00.000Z',
    beendet: '2026-10-10T08:00:01.000Z',
    gesamt: 0,
    neu: 0,
    bekannt: 0,
    uebersprungen: 0,
    problem: 0,
    dateien: [],
    abschluss: 'Vollständig im Archiv',
    protokoll: 'protokoll/import/lauf.log',
  };
}

beforeEach(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'knipsa-archiv-api-'));
  index = speicherIndex();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  await datenbank?.schliesse();
  datenbank = undefined;
});

/**
 * Startet die App mit einem Archiv-Dienst auf einem Index im
 * Arbeitsspeicher. Der Abgleich selbst ist ersetzt — hier zaehlen die
 * Routen.
 */
function starte(
  abgleich: (optionen: { neuAufbauen?: boolean }) => Promise<unknown> = () => Promise.resolve({}),
): { app: FastifyInstance; dienst: ArchivDienst } {
  const dienst = new ArchivDienst({
    wurzel,
    index,
    leser: () => ({
      leseAngaben: () => Promise.resolve(KEINE_ANGABEN),
      schliesse: () => Promise.resolve(),
    }),
    abgleich,
  });

  app = baueApp({
    konfig: testKonfiguration({ FOTOS_PFAD: wurzel }),
    pruefungen: { datenbank: () => Promise.resolve(true), fotos: () => Promise.resolve(true) },
    archivDienst: dienst,
  });

  return { app, dienst };
}

describe('GET /api/archiv', () => {
  it('nennt die Zahlen und den letzten Abgleich', async () => {
    const { app: gestartet } = starte();
    await index.speichere(STAND);

    const antwort = await gestartet.inject({ method: 'GET', url: '/api/archiv' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.headers['cache-control']).toBe('no-store');
    expect(antwort.json()).toEqual({
      fotos: 1,
      dateien: 1,
      vermisst: 0,
      alarme: 0,
      unbekannte: 1,
      letzter: STAND.letzter,
    });
  });

  it('nennt vor dem ersten Abgleich lauter Nullen', async () => {
    const { app: gestartet } = starte();

    expect((await gestartet.inject({ method: 'GET', url: '/api/archiv' })).json()).toMatchObject({
      fotos: 0,
      dateien: 0,
    });
  });
});

describe('GET /api/archiv/liste', () => {
  it('gibt die Liste hinter einer Zahl', async () => {
    const { app: gestartet } = starte();
    await index.speichere(STAND);

    const antwort = await gestartet.inject({
      method: 'GET',
      url: '/api/archiv/liste?art=unbekannte',
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({
      art: 'unbekannte',
      zeilen: ['_wartend/2019-06/urlaub.jpg'],
    });
  });

  it('weist eine unbekannte Liste mit 404 ab', async () => {
    const { app: gestartet } = starte();

    const antwort = await gestartet.inject({ method: 'GET', url: '/api/archiv/liste?art=blabla' });

    expect(antwort.statusCode).toBe(404);
  });
});

describe('GET /api/archiv/foto', () => {
  it('gibt die Angaben eines Schluessels als Text', async () => {
    const { app: gestartet } = starte();
    await index.speichere(STAND);

    const antwort = await gestartet.inject({
      method: 'GET',
      url: `/api/archiv/foto?schluessel=${SCHLUESSEL}`,
    });

    expect(antwort.statusCode).toBe(200);
    const koerper = antwort.json() as { schluessel: string; text: string };
    expect(koerper.schluessel).toBe(SCHLUESSEL);
    expect(koerper.text).toContain('Bewertung: 4 Sterne');
    expect(koerper.text).toContain('Toskana');
  });

  it('antwortet 404 fuer einen Schluessel, den der Index nicht kennt', async () => {
    const { app: gestartet } = starte();

    const antwort = await gestartet.inject({
      method: 'GET',
      url: '/api/archiv/foto?schluessel=20200101-000000a',
    });

    expect(antwort.statusCode).toBe(404);
    expect(antwort.json()).toEqual({ fehler: 'Schlüssel im Index nicht gefunden' });
  });
});

describe('POST /api/archiv/abgleich', () => {
  it('startet einen Abgleich und antwortet 202', async () => {
    let gelaufen = 0;
    const { app: gestartet, dienst } = starte(() => {
      gelaufen += 1;
      return Promise.resolve({});
    });

    const antwort = await gestartet.inject({ method: 'POST', url: '/api/archiv/abgleich' });
    await dienst.arbeit();

    expect(antwort.statusCode).toBe(202);
    expect(gelaufen).toBe(1);
  });

  it('weist einen zweiten Abgleich mit 409 und Klartext ab', async () => {
    let loese = (): void => {};
    const { app: gestartet, dienst } = starte(
      () => new Promise((fertig) => (loese = () => fertig({}))),
    );

    await gestartet.inject({ method: 'POST', url: '/api/archiv/abgleich' });
    const zweiter = await gestartet.inject({ method: 'POST', url: '/api/archiv/abgleich' });
    loese();
    await dienst.arbeit();

    expect(zweiter.statusCode).toBe(409);
    expect(zweiter.json()).toMatchObject({
      fehler: 'Abgleich läuft — bitte warten',
      laufend: 'abgleich',
    });
  });
});

describe('Abgleich nach dem Import', () => {
  /**
   * Hier baut die App Import- und Archiv-Dienst selbst — genau wie im
   * Betrieb. Geprueft wird die Verdrahtung: nach einem Import laeuft ein
   * Abgleich, ohne dass jemand "Abgleich jetzt" drueckt. Die Quelle ist
   * leer, damit der Lauf ohne Fremddienste auskommt.
   */
  it('gleicht nach einem Lauf von selbst ab', async () => {
    const quelle = await mkdtemp(join(tmpdir(), 'knipsa-archiv-quelle-'));
    datenbank = await testDatenbank();

    app = baueApp({
      konfig: testKonfiguration({ FOTOS_PFAD: wurzel, IMPORT_QUELLEN: `Test=${quelle}` }),
      db: datenbank.db,
    });

    const gestartet = await app.inject({
      method: 'POST',
      url: '/api/import/start',
      payload: { quelle: 'Test' },
    });
    expect(gestartet.statusCode).toBe(202);

    await vi.waitFor(
      async () => {
        const zustand = (await app?.inject({ method: 'GET', url: '/api/archiv' }))?.json() as {
          letzter?: { art: string };
        };
        expect(zustand.letzter?.art).toBe('abgleich');
      },
      { timeout: 10_000 },
    );
  });
});

describe('POST /api/archiv/neu-aufbauen', () => {
  it('weist "Neu aufbauen" mit 409 ab, solange ein Import laeuft', async () => {
    const quelle = await mkdtemp(join(tmpdir(), 'knipsa-archiv-quelle-'));
    const sperre = new Sperre();
    const archiv = new ArchivDienst({
      wurzel,
      index,
      sperre,
      leser: () => ({
        leseAngaben: () => Promise.resolve(KEINE_ANGABEN),
        schliesse: () => Promise.resolve(),
      }),
      abgleich: () => Promise.resolve({}),
    });

    let loese = (): void => {};
    const importDienst = new ImportDienst({
      wurzel,
      quellen: [{ name: 'Test', pfad: quelle }],
      sperre,
      leser: () => ({
        leseAufnahmezeit: () => Promise.resolve({ art: 'keineZeit' as const }),
        schliesse: () => Promise.resolve(),
      }),
      lauf: () => new Promise((fertig) => (loese = () => fertig(laufErgebnis()))),
    });

    app = baueApp({
      konfig: testKonfiguration({ FOTOS_PFAD: wurzel }),
      pruefungen: { datenbank: () => Promise.resolve(true), fotos: () => Promise.resolve(true) },
      importDienst,
      archivDienst: archiv,
    });
    await index.speichere(STAND);

    const gestartet = await app.inject({
      method: 'POST',
      url: '/api/import/start',
      payload: { quelle: 'Test' },
    });
    const abgewiesen = await app.inject({ method: 'POST', url: '/api/archiv/neu-aufbauen' });
    loese();
    await importDienst.arbeit();

    expect(gestartet.statusCode).toBe(202);
    expect(abgewiesen.statusCode).toBe(409);
    expect(abgewiesen.json()).toMatchObject({
      fehler: 'Import läuft — bitte warten',
      laufend: 'import',
    });
    // Der Index ist unveraendert geblieben.
    expect(await index.lade()).toEqual(STAND);
  });

  it('baut neu auf und verwirft dabei den alten Index', async () => {
    const neuAufbau: boolean[] = [];
    const { app: gestartet, dienst } = starte(({ neuAufbauen }) => {
      neuAufbau.push(neuAufbauen === true);
      return index.speichere(LEERER_STAND);
    });
    await index.speichere(STAND);

    const antwort = await gestartet.inject({ method: 'POST', url: '/api/archiv/neu-aufbauen' });
    await dienst.arbeit();

    expect(antwort.statusCode).toBe(202);
    expect(neuAufbau).toEqual([true]);
    expect((await index.zahlen()).fotos).toBe(0);
  });
});
