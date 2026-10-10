import { leseKonfiguration, type Konfiguration, type UmgebungsVariablen } from '@knipsa/shared';

/**
 * Einstiegspunkt der Pipeline (Ingest, Abgleich, Sync, Sortierer).
 *
 * Die Pipeline liest dieselbe Konfiguration wie der Server, damit
 * Foto-Wurzel und Datenbank auch hier ausschliesslich aus
 * Umgebungsvariablen kommen.
 */
export function pipelineKonfiguration(env?: UmgebungsVariablen): Konfiguration {
  return env === undefined ? leseKonfiguration() : leseKonfiguration(env);
}

export {
  ImportDienst,
  ImportLaeuftBereits,
  QuelleNichtVerfuegbar,
  UnbekannteQuelle,
  type ImportDienstOptionen,
  type ImportZustand,
  type LaufenderImport,
  type LaufFunktion,
  type QuellenZustand,
} from './importdienst.js';
export {
  fuehreLaufAus,
  sammleDateien,
  type ErgebnisArt,
  type ErgebnisEintrag,
  type Fortschritt,
  type LaufErgebnis,
  type LaufOptionen,
} from './importlauf.js';
export { GesehenListe, type GesehenEintrag } from './gesehen.js';
export { ladeLaeufe, merkeLauf, MAX_LAEUFE } from './laeufe.js';
export {
  deuteTags,
  exiftoolLeser,
  zerlegeZeitangabe,
  type AufnahmeErgebnis,
  type MetadatenLeser,
} from './metadaten.js';
export { protokollText, schreibeProtokoll } from './protokoll.js';
