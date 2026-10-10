import { describe, expect, it } from 'vitest';

import { leseDatei } from './pfade.js';

/** Alle Variablen, die in den env-Dateien auf dem Beelink stehen (req-001). */
const erwarteteVariablen = [
  'KNIPSA_ENV',
  'KNIPSA_PORT',
  'APP_ORIGIN',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'DATABASE_URL',
  'FOTOS_ROOT',
];

const zeilen = leseDatei('deploy/example.env')
  .split('\n')
  .map((zeile) => zeile.trim())
  .filter((zeile) => zeile !== '' && !zeile.startsWith('#'));

describe('deploy/example.env', () => {
  it('listet genau die Variablen des Requirements', () => {
    const namen = zeilen.map((zeile) => zeile.split('=')[0]);
    expect(namen.sort()).toEqual([...erwarteteVariablen].sort());
  });

  it('enthaelt keine Werte', () => {
    for (const zeile of zeilen) {
      expect(zeile, zeile).toMatch(/^[A-Z0-9_]+=$/);
    }
  });
});
