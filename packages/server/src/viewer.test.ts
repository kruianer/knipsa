import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { baueApp } from './app.js';
import { testKonfiguration } from './test/konfiguration.js';
import { viewerVerzeichnis } from './viewer.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const bereit = {
  datenbank: () => Promise.resolve(true),
  fotos: () => Promise.resolve(true),
};

async function gebauterViewer(): Promise<string> {
  const verzeichnis = await mkdtemp(join(tmpdir(), 'knipsa-viewer-'));
  await writeFile(join(verzeichnis, 'index.html'), '<!doctype html><title>Knipsa</title>');
  return verzeichnis;
}

describe('viewerVerzeichnis', () => {
  it('nimmt das dist-Verzeichnis des Viewer-Pakets', () => {
    expect(viewerVerzeichnis({})).toMatch(/packages[/\\]viewer[/\\]dist$/);
  });

  it('laesst sich ueber VIEWER_VERZEICHNIS umstellen', () => {
    expect(viewerVerzeichnis({ VIEWER_VERZEICHNIS: '/woanders' })).toBe('/woanders');
  });
});

describe('Viewer als statische Dateien', () => {
  it('liefert die Minimalseite unter /', async () => {
    app = baueApp({
      konfig: testKonfiguration(),
      pruefungen: bereit,
      viewer: await gebauterViewer(),
    });

    const antwort = await app.inject({ method: 'GET', url: '/' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.body).toContain('Knipsa');
  });

  it('bleibt ohne gebauten Viewer lauffaehig', async () => {
    app = baueApp({
      konfig: testKonfiguration(),
      pruefungen: bereit,
      viewer: join(tmpdir(), 'knipsa-viewer-gibt-es-nicht'),
    });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const seite = await app.inject({ method: 'GET', url: '/' });

    expect(live.statusCode).toBe(200);
    expect(seite.statusCode).toBe(404);
  });
});

describe('GET /api/umgebung', () => {
  it('nennt die Umgebung und sonst nichts', async () => {
    app = baueApp({
      konfig: testKonfiguration({ KNIPSA_ENV: 'prod' }),
      pruefungen: bereit,
      viewer: await gebauterViewer(),
    });

    const antwort = await app.inject({ method: 'GET', url: '/api/umgebung' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ umgebung: 'prod' });
  });
});
