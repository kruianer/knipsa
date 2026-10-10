import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

/**
 * Datenbank-Schema. Es entsteht ausschliesslich ueber Kysely-Migrationen
 * (siehe `src/db/migrations`); die Typen hier beschreiben, was dort
 * angelegt wurde.
 *
 * Jede Fachtabelle hat `mandant_id`, und jede Abfrage filtert danach
 * (siehe `delivery/stack.md`).
 */
export interface MandantTabelle {
  readonly id: string;
  readonly name: string;
}

/** Ein Foto im Index (req-007). */
export interface FotoTabelle {
  readonly mandant_id: string;
  readonly schluessel: string;
  readonly aufnahmezeit: string;
  readonly bewertung: number | null;
  readonly farbmarkierung: string | null;
  readonly stichwoerter: string[];
  readonly titel: string | null;
  readonly beschreibung: string | null;
  readonly gps_breite: number | null;
  readonly gps_laenge: number | null;
  readonly vermisst: boolean;
}

/** Eine Datei im Index (req-007). */
export interface DateiTabelle {
  readonly mandant_id: string;
  readonly pfad: string;
  readonly schluessel: string;
  readonly groesse: number;
  readonly geaendert: number;
  readonly import_pruefsumme: string;
  readonly bild_pruefsumme: string | null;
  readonly sidecar: string | null;
}

/** Ein Alarm "Original verändert" (req-007). */
export interface AlarmTabelle {
  readonly mandant_id: string;
  readonly schluessel: string;
  readonly art: string;
  readonly pfad: string;
}

/** Eine Datei im Baum ohne gueltigen Schluessel im Namen (req-007). */
export interface UnbekannteDateiTabelle {
  readonly mandant_id: string;
  readonly pfad: string;
}

/** Der letzte Abgleich — genau eine Zeile je Mandant (req-007). */
export interface AbgleichTabelle {
  readonly mandant_id: string;
  readonly art: string;
  readonly begonnen: string;
  readonly beendet: string;
  readonly dauer_ms: number;
  readonly fotos: number;
  readonly dateien: number;
  readonly vermisst: number;
  readonly alarme: number;
  readonly unbekannte: number;
}

export interface Datenbank {
  readonly mandant: MandantTabelle;
  readonly foto: FotoTabelle;
  readonly datei: DateiTabelle;
  readonly alarm: AlarmTabelle;
  readonly unbekannte_datei: UnbekannteDateiTabelle;
  readonly abgleich: AbgleichTabelle;
}

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
