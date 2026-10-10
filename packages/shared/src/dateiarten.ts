/**
 * Einordnung einer Quelldatei nach ihrer Endung.
 *
 * Knipsa uebernimmt Fotos (NEF, JPEG, HEIC) und die Sidecars einer NEF
 * (`.xmp`, `.acr`). Videos und alles andere werden uebersprungen. Die
 * Endung selbst bleibt immer unveraendert — nur fuer die Einordnung wird
 * sie klein geschrieben.
 */

export type DateiArt = 'raw' | 'jpeg' | 'heic' | 'sidecar' | 'video' | 'anderes';

/** Endungen, die als Foto uebernommen werden. */
const FOTO_ENDUNGEN = new Map<string, DateiArt>([
  ['.nef', 'raw'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
  // `.heif` ist dasselbe Format wie `.heic`; iPhones liefern beide Endungen.
  ['.heic', 'heic'],
  ['.heif', 'heic'],
]);

/** Sidecar-Endungen einer NEF. */
const SIDECAR_ENDUNGEN = new Set(['.xmp', '.acr']);

const VIDEO_ENDUNGEN = new Set([
  '.mov',
  '.mp4',
  '.m4v',
  '.avi',
  '.mts',
  '.m2ts',
  '.mpg',
  '.mpeg',
  '.3gp',
  '.mkv',
  '.wmv',
  '.webm',
]);

/** Endung inklusive Punkt, unveraendert aus dem Dateinamen (`.NEF`). */
export function endung(dateiname: string): string {
  const punkt = dateiname.lastIndexOf('.');
  return punkt <= 0 ? '' : dateiname.slice(punkt);
}

/** Dateiname ohne Endung (`DSC_0412`) — der Grundname. */
export function grundname(dateiname: string): string {
  const punkt = dateiname.lastIndexOf('.');
  return punkt <= 0 ? dateiname : dateiname.slice(0, punkt);
}

/** Ordnet eine Datei nach ihrer Endung ein. */
export function dateiArt(dateiname: string): DateiArt {
  const klein = endung(dateiname).toLowerCase();

  const foto = FOTO_ENDUNGEN.get(klein);
  if (foto !== undefined) {
    return foto;
  }
  if (SIDECAR_ENDUNGEN.has(klein)) {
    return 'sidecar';
  }
  if (VIDEO_ENDUNGEN.has(klein)) {
    return 'video';
  }

  return 'anderes';
}

/** `true` fuer NEF, JPEG und HEIC. */
export function istFoto(art: DateiArt): boolean {
  return art === 'raw' || art === 'jpeg' || art === 'heic';
}
