import { sql, type Kysely } from 'kysely';

/**
 * Erste Migration: noch keine Tabellen.
 *
 * Das Schema entsteht mit den folgenden Requirements. Hier wird nur die
 * Extension `vector` eingeschaltet, die Knipsa spaeter fuer
 * Bild-Embeddings braucht — sie gehoert zum Zustand der Datenbank und
 * damit in eine Migration, nicht in ein Startskript.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists vector`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop extension if exists vector`.execute(db);
}
