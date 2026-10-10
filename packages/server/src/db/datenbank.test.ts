import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { baueApp } from '../app.js';
import { testKonfiguration } from '../test/konfiguration.js';
import { antwortetDatenbank, baueDatenbank } from './datenbank.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Diese Tests laufen gegen den echten Postgres-Treiber, aber ohne
 * laufenden Server: Port 1 ist zu, die Verbindung schlaegt also wirklich
 * fehl. Das ist der Fall "DB-Container ist gestoppt" aus req-001. Der
 * Gegenfall (Datenbank antwortet) wird beim Deploy gegen die laufende
 * Umgebung geprueft (Health-Check im Workflow).
 */
describe('antwortetDatenbank', () => {
  it('meldet false, wenn die Datenbank nicht erreichbar ist', async () => {
    const db = baueDatenbank({
      databaseUrl: 'postgres://knipsa:test@127.0.0.1:1/knipsa_test',
      verbindungsTimeoutMs: 1000,
    });

    try {
      await expect(antwortetDatenbank(db)).resolves.toBe(false);
    } finally {
      await db.destroy();
    }
  });
});

describe('App mit echten Pruefungen', () => {
  it('liefert live weiter 200 und ready 503, wenn die Datenbank steht', async () => {
    const fotos = await mkdtemp(join(tmpdir(), 'knipsa-fotos-'));
    app = baueApp({ konfig: testKonfiguration({ FOTOS_PFAD: fotos }) });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ datenbank: 'fehler', fotos: 'ok' });
  });
});
