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
  type StartOptionen,
} from './importdienst.js';
export {
  ordnerPfad,
  pruefeOrdner,
  UnbekannterOrdner,
  zeigeOrdner,
  type OrdnerAnsicht,
  type OrdnerEintrag,
} from './ordnerbaum.js';
export {
  findeDatentraeger,
  groesseText,
  istEingehaengt,
  type Datentraeger,
  type DatentraegerOptionen,
} from './datentraeger.js';
export {
  fuehreLaufAus,
  sammleDateien,
  GRUND_ANDERER_DATEITYP,
  GRUND_BESCHAEDIGT,
  GRUND_JPEG_NEBEN_NEF,
  GRUND_KEINE_AUFNAHMEZEIT,
  GRUND_SIDECAR_BEKANNT,
  GRUND_SIDECAR_OHNE_FOTO,
  GRUND_SIDECAR_PROBLEM,
  GRUND_VIDEO,
  type ErgebnisArt,
  type ErgebnisEintrag,
  type Fortschritt,
  type LaufErgebnis,
  type LaufOptionen,
  type Quelle,
  type QuellenArt,
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
export { legeProblemAb, type ProblemAblage, type ProblemAblageOptionen } from './problem.js';
export { raeumeImportTeileAuf, raeumeTeileAuf, type TeilAufraeumung } from './teilaufraeumen.js';
