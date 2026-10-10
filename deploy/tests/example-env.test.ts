import { describe, expect, it } from 'vitest';

import { leseDatei } from './pfade.js';

/** Alle Variablen, die in den env-Dateien auf dem Beelink stehen. */
const erwarteteVariablen = [
  // req-001
  'KNIPSA_ENV',
  'KNIPSA_PORT',
  'APP_ORIGIN',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'DATABASE_URL',
  'FOTOS_ROOT',
  // req-005
  'QUELLEN_ROOT',
  'IMPORT_QUELLEN',
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
