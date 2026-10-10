/**
 * Testbilder fuer die Tests des Imports.
 *
 * Die Dateien werden hier Byte fuer Byte gebaut, damit kein echtes Foto
 * im Repo liegt und jeder Test in einem temporaeren Verzeichnis mit
 * frischen Dateien arbeitet (siehe `delivery/stack.md`). Es sind winzige,
 * aber formal gueltige Dateien: `exiftool` erkennt sie als NEF, JPEG und
 * HEIC und liest die Aufnahmezeit daraus.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Angaben, die in das Testbild geschrieben werden. */
export interface BildAngaben {
  /** Aufnahmezeit in der Schreibweise der Datei: `2019:06:14 10:15:00`. */
  readonly datum: string;
  /** Sekundenbruchteil als Ziffern, zum Beispiel `120`. */
  readonly bruchteil?: string;
  /**
   * Zusaetzliche Bytes an Bilddaten. Damit lassen sich zwei Bilder mit
   * genau derselben Aufnahmezeit unterscheiden — sie haben dann
   * verschiedene Pruefsummen.
   */
  readonly fuellung?: number;
}

const TYP_SHORT = 3;
const TYP_LONG = 4;
const TYP_ASCII = 2;

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_SUB_SEC_TIME_ORIGINAL = 0x9291;
const TAG_STRIP_OFFSETS = 273;

interface Eintrag {
  readonly tag: number;
  readonly typ: number;
  readonly anzahl: number;
  /** Zahl fuer SHORT/LONG, Bytes fuer ASCII. */
  readonly wert: number | Buffer;
}

function textWert(text: string): Buffer {
  return Buffer.from(`${text}\0`, 'ascii');
}

function wertGroesse(eintrag: Eintrag): number {
  return eintrag.typ === TYP_SHORT
    ? eintrag.anzahl * 2
    : eintrag.anzahl * (eintrag.typ === TYP_ASCII ? 1 : 4);
}

/**
 * Baut einen TIFF-Block (little endian) mit IFD0, einem ExifIFD und der
 * Aufnahmezeit darin. Mit `mitBild` entsteht ein vollstaendiges
 * TIFF-Bild (das ist dann die NEF), ohne `mitBild` nur der Block, der in
 * einem JPEG oder HEIC als EXIF steckt.
 */
function tiffBlock(angaben: BildAngaben, mitBild: boolean): Buffer {
  const exifEintraege: Eintrag[] = [
    {
      tag: TAG_DATE_TIME_ORIGINAL,
      typ: TYP_ASCII,
      anzahl: angaben.datum.length + 1,
      wert: textWert(angaben.datum),
    },
  ];
  if (angaben.bruchteil !== undefined) {
    exifEintraege.push({
      tag: TAG_SUB_SEC_TIME_ORIGINAL,
      typ: TYP_ASCII,
      anzahl: angaben.bruchteil.length + 1,
      wert: textWert(angaben.bruchteil),
    });
  }

  const bildBytes = mitBild ? 1 + (angaben.fuellung ?? 0) : 0;

  const ifd0Eintraege: Eintrag[] = mitBild
    ? [
        { tag: 256, typ: TYP_SHORT, anzahl: 1, wert: 1 }, // ImageWidth
        { tag: 257, typ: TYP_SHORT, anzahl: 1, wert: 1 }, // ImageHeight
        { tag: 258, typ: TYP_SHORT, anzahl: 1, wert: 8 }, // BitsPerSample
        { tag: 259, typ: TYP_SHORT, anzahl: 1, wert: 1 }, // Compression: keine
        { tag: 262, typ: TYP_SHORT, anzahl: 1, wert: 1 }, // PhotometricInterpretation
        { tag: TAG_STRIP_OFFSETS, typ: TYP_LONG, anzahl: 1, wert: 0 }, // wird unten gesetzt
        { tag: 277, typ: TYP_SHORT, anzahl: 1, wert: 1 }, // SamplesPerPixel
        { tag: 278, typ: TYP_SHORT, anzahl: 1, wert: 1 }, // RowsPerStrip
        { tag: 279, typ: TYP_LONG, anzahl: 1, wert: bildBytes }, // StripByteCounts
        { tag: TAG_EXIF_IFD, typ: TYP_LONG, anzahl: 1, wert: 0 }, // wird unten gesetzt
      ]
    : [{ tag: TAG_EXIF_IFD, typ: TYP_LONG, anzahl: 1, wert: 0 }];

  const ifd0Offset = 8;
  const ifd0Groesse = 2 + ifd0Eintraege.length * 12 + 4;
  const exifOffset = ifd0Offset + ifd0Groesse;
  const exifGroesse = 2 + exifEintraege.length * 12 + 4;
  const datenOffset = exifOffset + exifGroesse;
  const datenGroesse = [...ifd0Eintraege, ...exifEintraege]
    .map(wertGroesse)
    .filter((groesse) => groesse > 4)
    .reduce((summe, groesse) => summe + groesse, 0);
  const bildOffset = datenOffset + datenGroesse;

  const buf = Buffer.alloc(bildOffset + bildBytes);
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifd0Offset, 4);

  let daten = datenOffset;

  function schreibeIfd(offset: number, eintraege: Eintrag[]): void {
    buf.writeUInt16LE(eintraege.length, offset);
    let p = offset + 2;
    for (const eintrag of eintraege) {
      buf.writeUInt16LE(eintrag.tag, p);
      buf.writeUInt16LE(eintrag.typ, p + 2);
      buf.writeUInt32LE(eintrag.anzahl, p + 4);

      if (Buffer.isBuffer(eintrag.wert)) {
        // Werte bis vier Bytes stehen laut TIFF unmittelbar im Eintrag,
        // laengere im Datenbereich dahinter.
        if (eintrag.wert.length <= 4) {
          eintrag.wert.copy(buf, p + 8);
        } else {
          buf.writeUInt32LE(daten, p + 8);
          eintrag.wert.copy(buf, daten);
          daten += eintrag.wert.length;
        }
      } else if (eintrag.tag === TAG_STRIP_OFFSETS) {
        buf.writeUInt32LE(bildOffset, p + 8);
      } else if (eintrag.tag === TAG_EXIF_IFD) {
        buf.writeUInt32LE(exifOffset, p + 8);
      } else if (eintrag.typ === TYP_SHORT) {
        buf.writeUInt16LE(eintrag.wert, p + 8);
      } else {
        buf.writeUInt32LE(eintrag.wert, p + 8);
      }

      p += 12;
    }
    buf.writeUInt32LE(0, p);
  }

  schreibeIfd(ifd0Offset, ifd0Eintraege);
  schreibeIfd(exifOffset, exifEintraege);
  buf.fill(0x80, bildOffset);

  return buf;
}

/** Eine NEF: ein TIFF mit Aufnahmezeit im ExifIFD. */
export function nefBytes(angaben: BildAngaben): Buffer {
  return tiffBlock(angaben, true);
}

function jpegAbschnitt(marker: number, inhalt: Buffer): Buffer {
  const laenge = inhalt.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, laenge >> 8, laenge & 0xff]), inhalt]);
}

function huffmanTabelle(): Buffer {
  const anzahlen = Buffer.alloc(16);
  anzahlen[1] = 1; // ein Code der Laenge 2
  return Buffer.concat([anzahlen, Buffer.from([0x00])]);
}

/**
 * Ein JPEG mit einem Bildpunkt. Ohne `angaben` enthaelt es kein EXIF und
 * damit keine Aufnahmezeit — das ist der Problemfall "keine Aufnahmezeit".
 */
export function jpegBytes(angaben?: BildAngaben): Buffer {
  const app1 =
    angaben === undefined
      ? Buffer.alloc(0)
      : jpegAbschnitt(
          0xe1,
          Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiffBlock(angaben, false)]),
        );

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    app1,
    jpegAbschnitt(0xdb, Buffer.concat([Buffer.from([0x00]), Buffer.alloc(64, 16)])), // DQT
    jpegAbschnitt(0xc0, Buffer.from([0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00])), // SOF0
    jpegAbschnitt(0xc4, Buffer.concat([Buffer.from([0x00]), huffmanTabelle()])), // DHT (DC)
    jpegAbschnitt(0xc4, Buffer.concat([Buffer.from([0x10]), huffmanTabelle()])), // DHT (AC)
    jpegAbschnitt(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])), // SOS
    Buffer.alloc(1 + (angaben?.fuellung ?? 0), 0x0f), // Bilddaten
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

/** Ein JPEG, dem der Rest fehlt — `exiftool` meldet darauf einen Formatfehler. */
export function kaputteJpegBytes(): Buffer {
  return jpegBytes({ datum: '2019:06:14 10:15:00' }).subarray(0, 24);
}

function isoBox(typ: string, ...teile: Buffer[]): Buffer {
  const inhalt = Buffer.concat(teile);
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(inhalt.length + 8, 0);
  kopf.write(typ, 4, 'ascii');
  return Buffer.concat([kopf, inhalt]);
}

function isoVollBox(typ: string, version: number, ...teile: Buffer[]): Buffer {
  return isoBox(typ, Buffer.from([version, 0, 0, 0]), ...teile);
}

/** Ein HEIC mit der Aufnahmezeit im `Exif`-Element. */
export function heicBytes(angaben: BildAngaben): Buffer {
  // Vor dem EXIF-Block steht sein Abstand zum TIFF-Kopf (hier 6 Bytes).
  const exif = Buffer.concat([
    Buffer.from([0, 0, 0, 6]),
    Buffer.from('Exif\0\0', 'ascii'),
    tiffBlock(angaben, false),
  ]);
  const bild = Buffer.alloc(1 + (angaben.fuellung ?? 0), 0x80);

  const ftyp = isoBox(
    'ftyp',
    Buffer.from('heic', 'ascii'),
    Buffer.alloc(4),
    Buffer.from('mif1heic', 'ascii'),
  );
  const hdlr = isoVollBox(
    'hdlr',
    0,
    Buffer.alloc(4),
    Buffer.from('pict', 'ascii'),
    Buffer.alloc(12),
    Buffer.from([0]),
  );
  const pitm = isoVollBox('pitm', 0, Buffer.from([0, 1]));

  function infe(id: number, typ: string): Buffer {
    return isoVollBox(
      'infe',
      2,
      Buffer.from([id >> 8, id & 0xff, 0, 0]),
      Buffer.from(typ, 'ascii'),
      Buffer.from([0]),
    );
  }
  const iinf = isoVollBox('iinf', 0, Buffer.from([0, 2]), infe(1, 'hvc1'), infe(2, 'Exif'));

  function ilocEintrag(id: number, offset: number, laenge: number): Buffer {
    const b = Buffer.alloc(14);
    b.writeUInt16BE(id, 0);
    b.writeUInt16BE(0, 2); // data_reference_index
    b.writeUInt16BE(1, 4); // ein Abschnitt
    b.writeUInt32BE(offset, 6);
    b.writeUInt32BE(laenge, 10);
    return b;
  }

  // Die Abstaende zeigen in das mdat, dessen Lage erst nach dem
  // Zusammenbau feststeht. Deshalb zweimal bauen: beim ersten Mal nur,
  // um den Abstand zu erfahren; die Boxgroessen aendern sich dabei nicht.
  function baue(datenOffset: number): { datei: Buffer; datenOffset: number } {
    const iloc = isoVollBox(
      'iloc',
      0,
      Buffer.from([0x44, 0x00, 0, 2]), // Abstand und Laenge je 4 Bytes, zwei Elemente
      ilocEintrag(1, datenOffset, bild.length),
      ilocEintrag(2, datenOffset + bild.length, exif.length),
    );
    const meta = isoVollBox('meta', 0, hdlr, pitm, iinf, iloc);
    const mdat = isoBox('mdat', bild, exif);
    return {
      datei: Buffer.concat([ftyp, meta, mdat]),
      datenOffset: ftyp.length + meta.length + 8,
    };
  }

  return baue(baue(0).datenOffset).datei;
}

/** Ein XMP-Sidecar, wie Lightroom es neben eine NEF legt. */
export function xmpText(bewertung = 3): string {
  return [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""',
    '    xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    `    xmp:Rating="${bewertung}"/>`,
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
    '',
  ].join('\n');
}

/** Legt eine Datei samt Elternordnern an. */
export async function schreibeDatei(pfad: string, inhalt: Buffer | string): Promise<void> {
  await mkdir(dirname(pfad), { recursive: true });
  await writeFile(pfad, inhalt);
}
