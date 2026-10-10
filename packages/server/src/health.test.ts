import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { baueApp } from './app.js';
import { istFotosWurzelLesbar, type Pruefungen } from './health.js';
import { testKonfiguration } from './test/konfiguration.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function pruefungen(datenbank: boolean, fotos: boolean): Pruefungen {
  return {
    datenbank: () => Promise.resolve(datenbank),
    fotos: () => Promise.resolve(fotos),
  };
}

function baue(datenbank: boolean, fotos: boolean): FastifyInstance {
  app = baueApp({ konfig: testKonfiguration(), pruefungen: pruefungen(datenbank, fotos) });
  return app;
}

describe('GET /health/live', () => {
  it('antwortet mit 200 und nur einer Status-Angabe', async () => {
    const antwort = await baue(true, true).inject({ method: 'GET', url: '/health/live' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ status: 'ok' });
  });

  it('antwortet auch mit 200, wenn die Datenbank nicht antwortet', async () => {
    const antwort = await baue(false, true).inject({ method: 'GET', url: '/health/live' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ status: 'ok' });
  });

  it('fragt die Datenbank gar nicht', async () => {
    let gefragt = false;
    app = baueApp({
      konfig: testKonfiguration(),
      pruefungen: {
        datenbank: () => {
          gefragt = true;
          return Promise.resolve(true);
        },
        fotos: () => Promise.resolve(true),
      },
    });

    await app.inject({ method: 'GET', url: '/health/live' });

    expect(gefragt).toBe(false);
  });
});

describe('GET /health/ready', () => {
  it('antwortet mit 200, wenn Datenbank und /fotos ok sind', async () => {
    const antwort = await baue(true, true).inject({ method: 'GET', url: '/health/ready' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ datenbank: 'ok', fotos: 'ok' });
  });

  it('meldet 503 und die Datenbank als fehler, wenn sie nicht antwortet', async () => {
    const antwort = await baue(false, true).inject({ method: 'GET', url: '/health/ready' });

    expect(antwort.statusCode).toBe(503);
    expect(antwort.json()).toEqual({ datenbank: 'fehler', fotos: 'ok' });
  });

  it('meldet 503, wenn /fotos nicht lesbar ist', async () => {
    const antwort = await baue(true, false).inject({ method: 'GET', url: '/health/ready' });

    expect(antwort.statusCode).toBe(503);
    expect(antwort.json()).toEqual({ datenbank: 'ok', fotos: 'fehler' });
  });

  it('meldet 503, wenn beides fehlt', async () => {
    const antwort = await baue(false, false).inject({ method: 'GET', url: '/health/ready' });

    expect(antwort.statusCode).toBe(503);
    expect(antwort.json()).toEqual({ datenbank: 'fehler', fotos: 'fehler' });
  });

  it('gibt nur Status je Pruefung zurueck — keine Pfade, Versionen oder Verbindungsdaten', async () => {
    const konfig = testKonfiguration();
    app = baueApp({ konfig, pruefungen: pruefungen(false, false) });

    const antwort = await app.inject({ method: 'GET', url: '/health/ready' });
    const koerper = antwort.body;

    expect(Object.keys(antwort.json<Record<string, string>>()).sort()).toEqual([
      'datenbank',
      'fotos',
    ]);
    for (const wert of Object.values(antwort.json<Record<string, string>>())) {
      expect(['ok', 'fehler']).toContain(wert);
    }
    expect(koerper).not.toContain(konfig.fotosPfad);
    expect(koerper).not.toContain('postgres');
    expect(koerper).not.toContain('version');
  });

  it('erlaubt kein Zwischenspeichern der Antwort', async () => {
    const antwort = await baue(true, true).inject({ method: 'GET', url: '/health/ready' });

    expect(antwort.headers['cache-control']).toBe('no-store');
  });
});

describe('istFotosWurzelLesbar', () => {
  it('erkennt ein vorhandenes, lesbares Verzeichnis', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'knipsa-fotos-'));

    await expect(istFotosWurzelLesbar(verzeichnis)).resolves.toBe(true);
  });

  it('erkennt ein fehlendes Verzeichnis', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'knipsa-fotos-'));

    await expect(istFotosWurzelLesbar(join(verzeichnis, 'gibt-es-nicht'))).resolves.toBe(false);
  });

  it('erkennt eine Datei anstelle eines Verzeichnisses', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'knipsa-fotos-'));
    const datei = join(verzeichnis, 'keine-wurzel.txt');
    await writeFile(datei, 'x');

    await expect(istFotosWurzelLesbar(datei)).resolves.toBe(false);
  });
});
