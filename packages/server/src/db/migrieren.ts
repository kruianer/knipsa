import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';

import type { Datenbank } from './datenbank.js';

/** Verzeichnis mit den Migrationen, neben diesem Modul. */
export function migrationsVerzeichnis(): string {
  return fileURLToPath(new URL('./migrations', import.meta.url));
}

export interface MigrationsErgebnis {
  /** Namen der in diesem Lauf ausgefuehrten Migrationen, in Reihenfolge. */
  readonly ausgefuehrt: string[];
}

/**
 * Fuehrt alle offenen Migrationen aus. Wird beim Start des Servers
 * aufgerufen, bevor er lauscht — ein Fehler bricht den Start ab, damit nie
 * eine Version mit halbem Schema Anfragen annimmt.
 */
export async function migriere(
  db: Kysely<Datenbank>,
  verzeichnis: string = migrationsVerzeichnis(),
): Promise<MigrationsErgebnis> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: verzeichnis }),
  });

  const { error, results } = await migrator.migrateToLatest();

  const ausgefuehrt = (results ?? [])
    .filter((ergebnis) => ergebnis.status === 'Success')
    .map((ergebnis) => ergebnis.migrationName);

  if (error !== undefined) {
    const fehlgeschlagen = (results ?? []).find((ergebnis) => ergebnis.status === 'Error');
    const name = fehlgeschlagen?.migrationName ?? 'unbekannt';
    throw new Error(`Migration ${name} fehlgeschlagen`, { cause: error });
  }

  return { ausgefuehrt };
}
