import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

/**
 * Datenbank-Schema. Noch ohne Tabellen — das Schema entsteht
 * ausschliesslich ueber Kysely-Migrationen (siehe `src/db/migrations`).
 */
export type Datenbank = Record<string, never>;

export interface DatenbankOptionen {
  /** Verbindung aus `DATABASE_URL`. */
  readonly databaseUrl: string;
  /** Wartezeit auf eine Verbindung in Millisekunden. */
  readonly verbindungsTimeoutMs?: number;
}

/**
 * Baut den Kysely-Zugang. Die Verbindung wird erst beim ersten Zugriff
 * aufgebaut, damit der Prozess auch bei stehender Datenbank startet
 * (`/health/live` muss dann weiter antworten).
 */
export function baueDatenbank({
  databaseUrl,
  verbindungsTimeoutMs = 3000,
}: DatenbankOptionen): Kysely<Datenbank> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: verbindungsTimeoutMs,
  });

  // Ein Verbindungsfehler im Pool darf den Prozess nicht beenden; die
  // Health-Pruefung meldet den Zustand stattdessen als `fehler`.
  pool.on('error', () => {});

  return new Kysely<Datenbank>({ dialect: new PostgresDialect({ pool }) });
}

/** `true`, wenn die Datenbank antwortet. */
export async function antwortetDatenbank(db: Kysely<Datenbank>): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}
