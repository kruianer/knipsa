import { leseKonfiguration } from '@knipsa/shared';

import { baueApp } from './app.js';
import { baueDatenbank } from './db/datenbank.js';
import { migriere } from './db/migrieren.js';

/**
 * Einstiegspunkt im Container.
 *
 * Reihenfolge: Konfiguration pruefen, Migrationen ausfuehren, erst danach
 * lauschen. Schlaegt etwas davon fehl, startet der Server nicht und die
 * laufende Version bleibt in Betrieb.
 */
const konfig = leseKonfiguration();
const db = baueDatenbank({ databaseUrl: konfig.databaseUrl });
const app = baueApp({ konfig, logger: true, db });

try {
  const { ausgefuehrt } = await migriere(db);
  app.log.info({ anzahl: ausgefuehrt.length, ausgefuehrt }, 'Migrationen fertig');

  await app.listen({ host: konfig.serverHost, port: konfig.serverPort });
} catch (fehler) {
  app.log.error({ fehler: (fehler as Error).message }, 'Start fehlgeschlagen');
  await app.close();
  await db.destroy();
  process.exit(1);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Beende');
    void (async () => {
      await app.close();
      await db.destroy();
    })();
  });
}
