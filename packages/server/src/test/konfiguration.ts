import { leseKonfiguration, type Konfiguration, type UmgebungsVariablen } from '@knipsa/shared';

/**
 * Konfiguration fuer Tests. Enthaelt nur erfundene Werte und zeigt nie auf
 * einen echten Foto-Baum oder eine echte Datenbank.
 */
export function testKonfiguration(ueberschreiben: UmgebungsVariablen = {}): Konfiguration {
  return leseKonfiguration({
    KNIPSA_ENV: 'dev',
    APP_ORIGIN: 'http://127.0.0.1:8098',
    // Port 1 ist zu, also ist die Datenbank in Tests standardmaessig nicht erreichbar.
    DATABASE_URL: 'postgres://knipsa:test@127.0.0.1:1/knipsa_test',
    FOTOS_PFAD: '/fotos-gibt-es-im-test-nicht',
    SERVER_HOST: '127.0.0.1',
    SERVER_PORT: '3000',
    ...ueberschreiben,
  });
}
