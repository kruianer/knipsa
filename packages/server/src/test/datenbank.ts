/**
 * Echtes PostgreSQL fuer Tests, ohne Server daneben.
 *
 * `delivery/stack.md` verlangt Integrationstests gegen echtes PostgreSQL
 * mit `pgvector` — nicht gegen eine nachgestellte Datenbank. Hier laeuft
 * genau dieses PostgreSQL als PGlite im Testprozess: dieselbe
 * SQL-Maschine, dieselben Migrationen, nur ohne Docker. Wer gegen ein
 * laufendes PostgreSQL testen will, setzt `TEST_DATABASE_URL`; dann
 * benutzen die Tests dieses.
 */

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import {
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from 'kysely';

import { baueDatenbank, type Datenbank } from '../db/datenbank.js';
import { migriere } from '../db/migrieren.js';

/** Eine Datenbank samt Migrationen, die der Test am Ende schliesst. */
export interface TestDatenbank {
  readonly db: Kysely<Datenbank>;
  schliesse(): Promise<void>;
}

/**
 * Kysely-Treiber auf PGlite. PGlite hat genau eine Verbindung und
 * reiht Abfragen selbst auf; mehr braucht ein Test nicht.
 */
function pgliteDialekt(pg: PGlite): Dialect {
  const verbindung: DatabaseConnection = {
    async executeQuery<R>(anfrage): Promise<QueryResult<R>> {
      const ergebnis = await pg.query<R>(anfrage.sql, [...anfrage.parameters]);
      return {
        rows: ergebnis.rows,
        numAffectedRows: BigInt(ergebnis.affectedRows ?? 0),
      };
    },

    // Kysely braucht das nur fuer `stream()`; der Index liest nie im Strom.
    streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error('PGlite im Test liest nicht im Strom');
    },
  };

  const treiber: Driver = {
    init: (): Promise<void> => Promise.resolve(),
    acquireConnection: (): Promise<DatabaseConnection> => Promise.resolve(verbindung),
    beginTransaction: async (verbindet): Promise<void> => {
      await verbindet.executeQuery(CompiledQuery.raw('begin'));
    },
    commitTransaction: async (verbindet): Promise<void> => {
      await verbindet.executeQuery(CompiledQuery.raw('commit'));
    },
    rollbackTransaction: async (verbindet): Promise<void> => {
      await verbindet.executeQuery(CompiledQuery.raw('rollback'));
    },
    releaseConnection: (): Promise<void> => Promise.resolve(),
    destroy: (): Promise<void> => pg.close(),
  };

  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => treiber,
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  };
}

/**
 * Baut eine frische Datenbank mit allen Migrationen. Ohne
 * `TEST_DATABASE_URL` laeuft sie als PGlite im Prozess; mit der Variable
 * gegen das dort genannte PostgreSQL (dessen Schema dabei durch die
 * Migrationen entsteht).
 */
export async function testDatenbank(): Promise<TestDatenbank> {
  const url = process.env.TEST_DATABASE_URL?.trim();

  if (url !== undefined && url !== '') {
    const db = baueDatenbank({ databaseUrl: url });
    await migriere(db);
    return {
      db,
      schliesse: () => db.destroy(),
    };
  }

  const pg = await PGlite.create({ extensions: { vector } });
  const db = new Kysely<Datenbank>({ dialect: pgliteDialekt(pg) });
  await migriere(db);

  return {
    db,
    schliesse: () => db.destroy(),
  };
}
