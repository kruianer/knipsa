import { sql, type Kysely } from 'kysely';

/**
 * Der eine Mandant, den es bis zur Anmeldung (req-002) gibt. Der Wert
 * steht hier bewusst als Text und nicht als Import aus
 * `@knipsa/shared`: eine Migration ist ein Stueck Vergangenheit und darf
 * sich nicht aendern, wenn der Code daneben sich aendert. Derselbe Wert
 * steht in `packages/shared/src/mandant.ts`.
 */
const STANDARD_MANDANT = 'standard';

/**
 * Index ueber den Foto-Baum (req-007): Fotos, Dateien, Alarme,
 * unbekannte Dateien und der letzte Abgleich.
 *
 * Der Index ist ein Abbild des Baums und laesst sich jederzeit aus
 * Foto-Baum und Gesehen-Liste neu aufbauen. Der Abgleich ersetzt ihn
 * deshalb immer vollstaendig — bewusst ohne Fremdschluessel zwischen den
 * Tabellen, damit ein Lauf nicht an der Reihenfolge seiner Eintraege
 * scheitern kann.
 *
 * Jede Tabelle hat `mandant_id`; bis zur Anmeldung (req-002) legt diese
 * Migration den einen Mandanten an.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('mandant')
    .addColumn('id', 'text', (spalte) => spalte.primaryKey())
    .addColumn('name', 'text', (spalte) => spalte.notNull())
    .execute();

  await sql`insert into mandant (id, name) values (${STANDARD_MANDANT}, 'Standard')`.execute(db);

  await db.schema
    .createTable('foto')
    .addColumn('mandant_id', 'text', (spalte) => spalte.notNull())
    .addColumn('schluessel', 'text', (spalte) => spalte.notNull())
    // Aufnahmezeit als Text, genau wie im Schluessel: ohne Zeitzone und
    // ohne Umrechnung (siehe `delivery/stack.md`).
    .addColumn('aufnahmezeit', 'text', (spalte) => spalte.notNull())
    .addColumn('bewertung', 'integer')
    .addColumn('farbmarkierung', 'text')
    .addColumn('stichwoerter', sql`text[]`, (spalte) => spalte.notNull().defaultTo(sql`'{}'`))
    .addColumn('titel', 'text')
    .addColumn('beschreibung', 'text')
    .addColumn('gps_breite', 'double precision')
    .addColumn('gps_laenge', 'double precision')
    .addColumn('vermisst', 'boolean', (spalte) => spalte.notNull().defaultTo(false))
    .addPrimaryKeyConstraint('foto_pk', ['mandant_id', 'schluessel'])
    .execute();

  await db.schema
    .createIndex('foto_vermisst_idx')
    .on('foto')
    .columns(['mandant_id', 'vermisst'])
    .execute();

  await db.schema
    .createTable('datei')
    // Pfad ab `original`, mit `/` als Trenner.
    .addColumn('mandant_id', 'text', (spalte) => spalte.notNull())
    .addColumn('pfad', 'text', (spalte) => spalte.notNull())
    .addColumn('schluessel', 'text', (spalte) => spalte.notNull())
    // Groesse und Aenderungszeit als Gleitkommazahl: die Aenderungszeit
    // hat Bruchteile von Millisekunden, und bis 2^53 ist jede ganze Zahl
    // exakt darstellbar.
    .addColumn('groesse', 'double precision', (spalte) => spalte.notNull())
    .addColumn('geaendert', 'double precision', (spalte) => spalte.notNull())
    .addColumn('import_pruefsumme', 'text', (spalte) => spalte.notNull())
    .addColumn('bild_pruefsumme', 'text')
    .addColumn('sidecar', 'text')
    .addPrimaryKeyConstraint('datei_pk', ['mandant_id', 'pfad'])
    .execute();

  await db.schema
    .createIndex('datei_schluessel_idx')
    .on('datei')
    .columns(['mandant_id', 'schluessel'])
    .execute();

  await db.schema
    .createTable('alarm')
    .addColumn('mandant_id', 'text', (spalte) => spalte.notNull())
    .addColumn('schluessel', 'text', (spalte) => spalte.notNull())
    // `nef` oder `bilddaten` — der Wortlaut fuer die Seite steht im Code.
    .addColumn('art', 'text', (spalte) => spalte.notNull())
    .addColumn('pfad', 'text', (spalte) => spalte.notNull())
    .addPrimaryKeyConstraint('alarm_pk', ['mandant_id', 'pfad', 'art'])
    .execute();

  await db.schema
    .createIndex('alarm_schluessel_idx')
    .on('alarm')
    .columns(['mandant_id', 'schluessel'])
    .execute();

  await db.schema
    .createTable('unbekannte_datei')
    .addColumn('mandant_id', 'text', (spalte) => spalte.notNull())
    .addColumn('pfad', 'text', (spalte) => spalte.notNull())
    .addPrimaryKeyConstraint('unbekannte_datei_pk', ['mandant_id', 'pfad'])
    .execute();

  // Genau eine Zeile je Mandant: der letzte Abgleich.
  await db.schema
    .createTable('abgleich')
    .addColumn('mandant_id', 'text', (spalte) => spalte.primaryKey())
    .addColumn('art', 'text', (spalte) => spalte.notNull())
    .addColumn('begonnen', 'text', (spalte) => spalte.notNull())
    .addColumn('beendet', 'text', (spalte) => spalte.notNull())
    .addColumn('dauer_ms', 'integer', (spalte) => spalte.notNull())
    .addColumn('fotos', 'integer', (spalte) => spalte.notNull())
    .addColumn('dateien', 'integer', (spalte) => spalte.notNull())
    .addColumn('vermisst', 'integer', (spalte) => spalte.notNull())
    .addColumn('alarme', 'integer', (spalte) => spalte.notNull())
    .addColumn('unbekannte', 'integer', (spalte) => spalte.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('abgleich').execute();
  await db.schema.dropTable('unbekannte_datei').execute();
  await db.schema.dropTable('alarm').execute();
  await db.schema.dropTable('datei').execute();
  await db.schema.dropTable('foto').execute();
  await db.schema.dropTable('mandant').execute();
}
