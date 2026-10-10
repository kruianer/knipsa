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
  fuehreAbgleichAus,
  ordneEinheiten,
  pruefeAlarm,
  sammleBaum,
  type AbgleichOptionen,
  type AlarmPruefung,
  type BaumDatei,
} from './abgleich.js';
export {
  ABGLEICH_TAKT_MS,
  ArchivDienst,
  auskunftText,
  LISTEN_GRENZE,
  type AbgleichFunktion,
  type ArchivDienstOptionen,
  type ArchivZustand,
} from './archivdienst.js';
export {
  ALARM_TEXT,
  alarmZeile,
  istListenArt,
  LEERER_STAND,
  LISTEN_ARTEN,
  listeZu,
  speicherIndex,
  zahlenZu,
  type AbgleichLauf,
  type AlarmArt,
  type ArchivIndex,
  type ArchivStand,
  type ArchivZahlen,
  type FotoAuskunft,
  type IndexAlarm,
  type IndexDatei,
  type IndexFoto,
  type ListenArt,
} from './archivindex.js';
export { Sperre, VORHABEN_TEXT, VorhabenLaeuft, type Vorhaben } from './sperre.js';
export {
  ImportDienst,
  ImportLaeuftBereits,
  KeinImportLaeuft,
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
  abschlussText,
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
  type AbbruchGrund,
  type AbschlussAngaben,
  type ErgebnisArt,
  type ErgebnisEintrag,
  type Fortschritt,
  type LaufErgebnis,
  type LaufOptionen,
  type Quelle,
  type QuellenArt,
} from './importlauf.js';
export { GesehenListe, type BildEintrag, type GesehenEintrag } from './gesehen.js';
export { ladeLaeufe, merkeLauf, MAX_LAEUFE } from './laeufe.js';
export {
  deuteAngaben,
  deuteTags,
  exiftoolLeser,
  KEINE_ANGABEN,
  zerlegeZeitangabe,
  type AngabenLeser,
  type AufnahmeErgebnis,
  type GeleseneAngaben,
  type MetadatenLeser,
} from './metadaten.js';
export { protokollText, schreibeProtokoll } from './protokoll.js';
export { legeProblemAb, type ProblemAblage, type ProblemAblageOptionen } from './problem.js';
export { raeumeImportTeileAuf, raeumeTeileAuf, type TeilAufraeumung } from './teilaufraeumen.js';
