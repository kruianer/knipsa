import { afterEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

import { baueApp } from './app.js';
import { testKonfiguration } from './test/konfiguration.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('baueApp', () => {
  it('startet und kennt seine Konfiguration', async () => {
    app = baueApp({ konfig: testKonfiguration() });
    await app.ready();

    expect(app.knipsaKonfiguration.umgebung).toBe('dev');
  });

  it('antwortet auf unbekannte Routen mit 404', async () => {
    app = baueApp({ konfig: testKonfiguration() });
    const antwort = await app.inject({ method: 'GET', url: '/gibt-es-nicht' });

    expect(antwort.statusCode).toBe(404);
  });
});
