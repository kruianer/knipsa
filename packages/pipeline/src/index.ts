import { leseKonfiguration, type Konfiguration, type UmgebungsVariablen } from '@knipsa/shared';

/**
 * Einstiegspunkt der Pipeline (Ingest, Abgleich, Sync, Sortierer).
 *
 * In req-001 steht hier nur das Gestell: die Pipeline liest dieselbe
 * Konfiguration wie der Server, damit Foto-Wurzel und Datenbank auch hier
 * ausschliesslich aus Umgebungsvariablen kommen. Die eigentlichen Laeufe
 * kommen mit den folgenden Requirements.
 */
export function pipelineKonfiguration(env?: UmgebungsVariablen): Konfiguration {
  return env === undefined ? leseKonfiguration() : leseKonfiguration(env);
}
