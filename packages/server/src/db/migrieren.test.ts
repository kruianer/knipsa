import { readdir } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { baueDatenbank } from './datenbank.js';
import { migrationsVerzeichnis, migriere } from './migrieren.js';

describe('Migrations-Mechanismus', () => {
  it('kennt die erste Migration', async () => {
    const dateien = await readdir(migrationsVerzeichnis());

    expect(dateien.filter((datei) => datei.startsWith('0001_init'))).not.toHaveLength(0);
  });

  it('bricht ab, wenn die Datenbank nicht erreichbar ist', async () => {
    const db = baueDatenbank({
      databaseUrl: 'postgres://knipsa:test@127.0.0.1:1/knipsa_test',
      verbindungsTimeoutMs: 1000,
    });

    try {
      await expect(migriere(db)).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
});
