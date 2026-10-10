import { appendFile, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pruefsumme } from '@knipsa/shared';

import { fuehreAbgleichAus, pruefeAlarm } from './abgleich.js';
import { auskunftText } from './archivdienst.js';
import { speicherIndex, type ArchivIndex, type FotoAuskunft } from './archivindex.js';
import { GesehenListe } from './gesehen.js';
import { KEINE_ANGABEN, type AngabenLeser, type GeleseneAngaben } from './metadaten.js';
import { heicBytes, jpegBytes, nefBytes, schreibeDatei, xmpText } from './test/testbilder.js';

const SCHLUESSEL = '20190614-101500a';
const MONAT = '_wartend/2019-06';
const AUFNAHME = '2019:06:14 10:15:00';

let wurzel: string;
let index: ArchivIndex;

beforeEach(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'knipsa-abgleich-'));
  index = speicherIndex();
});

afterEach(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

/** Pfad einer Datei im Baum `original`. */
function imBaum(pfad: string): string {
  return join(wurzel, 'original', pfad);
}

/**
 * Ein Leser, der die Angaben je Dateiname liefert und mitschreibt, welche
 * Dateien er gelesen hat — daran zeigt sich, dass der Abgleich eine
 * unveraenderte Datei nicht zweimal liest.
 */
function leserMit(
  angaben: Readonly<Record<string, Partial<GeleseneAngaben>>>,
): AngabenLeser & { readonly gelesen: string[] } {
  const gelesen: string[] = [];

  return {
    gelesen,
    leseAngaben(pfad: string): Promise<GeleseneAngaben> {
      const name = pfad.split('/').at(-1) ?? '';
      gelesen.push(name);
      return Promise.resolve({ ...KEINE_ANGABEN, ...(angaben[name] ?? {}) });
    },
    schliesse: (): Promise<void> => Promise.resolve(),
  };
}

/** Legt NEF und XMP eines Fotos im Wartebereich ab. */
async function legeFotoAb(bewertung = 4): Promise<void> {
  await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`), nefBytes({ datum: AUFNAHME }));
  await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`), xmpText(bewertung));
}

/**
 * Vermerkt eine Datei in der Gesehen-Liste, wie der Import es tut: mit
 * ihrer echten Import-Pruefsumme.
 */
async function merkeDatei(pfad: string, schluessel = SCHLUESSEL): Promise<void> {
  const gesehen = await GesehenListe.lade(wurzel);
  await gesehen.ergaenze([
    {
      pruefsumme: await pruefsumme(pfad),
      schluessel,
      quelle: 'Test',
      ordner: '',
      dateiname: `DSC_0412${pfad.slice(pfad.lastIndexOf('.'))}`,
      zeitpunkt: '2026-10-10T08:00:00.000Z',
    },
  ]);
}

/** Vermerkt NEF und Sidecar des Fotos, wie nach einem Import. */
async function merkeNefGesehen(): Promise<void> {
  await merkeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`));
  await merkeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`));
}

/** Vermerkt einen Schluessel, zu dem es keine Datei (mehr) gibt. */
async function merkeSchluessel(schluessel = SCHLUESSEL): Promise<void> {
  const gesehen = await GesehenListe.lade(wurzel);
  await gesehen.ergaenze([
    {
      pruefsumme: `summe-${schluessel}`,
      schluessel,
      quelle: 'Test',
      ordner: '',
      dateiname: 'DSC_0412.NEF',
      zeitpunkt: '2026-10-10T08:00:00.000Z',
    },
  ]);
}

/** Die Auskunft zu einem Schluessel; fehlt sie, ist der Test gescheitert. */
async function auskunftVon(schluessel: string): Promise<FotoAuskunft> {
  const auskunft = await index.auskunft(schluessel);
  if (auskunft === undefined) {
    throw new Error(`Schluessel ${schluessel} steht nicht im Index`);
  }

  return auskunft;
}

describe('Abgleich', () => {
  it('nimmt ein Foto samt Sidecar in den Index auf', async () => {
    await legeFotoAb();
    const leser = leserMit({});

    const lauf = await fuehreAbgleichAus({ wurzel, index, leser });

    expect(lauf.fotos).toBe(1);
    expect(lauf.dateien).toBe(2);

    const stand = await index.lade();
    expect(stand.fotos[0]?.schluessel).toBe(SCHLUESSEL);
    expect(stand.fotos[0]?.aufnahmezeit).toBe('2019-06-14 10:15:00');
    expect(stand.dateien.map((datei) => datei.pfad).sort()).toEqual([
      `${MONAT}/${SCHLUESSEL}.NEF`,
      `${MONAT}/${SCHLUESSEL}.xmp`,
    ]);
  });

  it('vermerkt bei der NEF ihren Sidecar und je Datei Groesse und Pruefsumme', async () => {
    await legeFotoAb();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    const stand = await index.lade();
    const nef = stand.dateien.find((datei) => datei.pfad.endsWith('.NEF'));
    const sidecar = stand.dateien.find((datei) => datei.pfad.endsWith('.xmp'));

    expect(nef?.sidecar).toBe(`${MONAT}/${SCHLUESSEL}.xmp`);
    expect(nef?.groesse).toBeGreaterThan(0);
    expect(nef?.importPruefsumme).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecar?.sidecar).toBeUndefined();
  });

  it('liest die Angaben einer NEF aus ihrem XMP-Sidecar', async () => {
    await legeFotoAb();
    const leser = leserMit({
      [`${SCHLUESSEL}.xmp`]: { bewertung: 4, stichwoerter: ['Toskana'] },
      [`${SCHLUESSEL}.NEF`]: { bewertung: 1 },
    });

    await fuehreAbgleichAus({ wurzel, index, leser });

    const auskunft = await auskunftVon(SCHLUESSEL);
    expect(leser.gelesen).toEqual([`${SCHLUESSEL}.xmp`]);
    expect(auskunft.foto.bewertung).toBe(4);
    expect(auskunftText(auskunft)).toContain('4 Sterne');
    expect(auskunftText(auskunft)).toContain('Toskana');
  });

  it('liest ohne Sidecar die Angaben aus der NEF selbst', async () => {
    await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`), nefBytes({ datum: AUFNAHME }));
    const leser = leserMit({ [`${SCHLUESSEL}.NEF`]: { bewertung: 2 } });

    await fuehreAbgleichAus({ wurzel, index, leser });

    expect(leser.gelesen).toEqual([`${SCHLUESSEL}.NEF`]);
    expect((await index.auskunft(SCHLUESSEL))?.foto.bewertung).toBe(2);
  });

  it('liest eine unveraenderte Datei beim zweiten Lauf nicht erneut', async () => {
    await legeFotoAb();
    const leser = leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 4 } });

    await fuehreAbgleichAus({ wurzel, index, leser });
    const nachDemErsten = [...leser.gelesen];
    await fuehreAbgleichAus({ wurzel, index, leser });

    expect(nachDemErsten).toEqual([`${SCHLUESSEL}.xmp`]);
    expect(leser.gelesen).toEqual(nachDemErsten);
    expect((await index.auskunft(SCHLUESSEL))?.foto.bewertung).toBe(4);
  });

  it('liest neu, wenn sich der Sidecar geaendert hat', async () => {
    await legeFotoAb(4);
    const leser = leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 4 } });
    await fuehreAbgleichAus({ wurzel, index, leser });

    // Dieselbe Bewertung steht jetzt mit 5 Sternen in der XMP; die Datei
    // ist damit laenger und traegt eine neue Aenderungszeit.
    await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`), `${xmpText(5)}\n`);
    const neuerLeser = leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 5 } });
    await fuehreAbgleichAus({ wurzel, index, leser: neuerLeser });

    expect(neuerLeser.gelesen).toEqual([`${SCHLUESSEL}.xmp`]);
    expect((await index.auskunft(SCHLUESSEL))?.foto.bewertung).toBe(5);
  });

  it('liest neu, wenn die Datei dieselbe Groesse, aber eine neue Zeit hat', async () => {
    await legeFotoAb(4);
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    // Lightroom schreibt eine XMP gleicher Laenge neu: dann unterscheidet
    // nur die Aenderungszeit die Datei vom gespeicherten Stand.
    await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`), xmpText(5));
    const spaeter = new Date(Date.now() + 60_000);
    await utimes(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`), spaeter, spaeter);

    const leser = leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 5 } });
    await fuehreAbgleichAus({ wurzel, index, leser });

    expect(leser.gelesen).toEqual([`${SCHLUESSEL}.xmp`]);
    expect((await index.auskunft(SCHLUESSEL))?.foto.bewertung).toBe(5);
  });

  it('haelt Beginn, Ende und Dauer des Laufs fest', async () => {
    await legeFotoAb();
    const zeiten = [new Date('2026-10-10T08:00:00.000Z'), new Date('2026-10-10T08:00:03.000Z')];
    let gefragt = 0;

    const lauf = await fuehreAbgleichAus({
      wurzel,
      index,
      leser: leserMit({}),
      jetzt: () => zeiten[Math.min(gefragt++, zeiten.length - 1)] as Date,
    });

    expect(lauf.art).toBe('abgleich');
    expect(lauf.begonnen).toBe('2026-10-10T08:00:00.000Z');
    expect(lauf.beendet).toBe('2026-10-10T08:00:03.000Z');
    expect(lauf.dauerMs).toBe(3000);
    expect((await index.zahlen()).letzter).toEqual(lauf);
  });

  it('zaehlt ein Foto aus der Gesehen-Liste auch ohne Datei im Baum', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    await rm(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`));
    await rm(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`));
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.fotos).toBe(1);
    expect(lauf.dateien).toBe(0);
    expect(lauf.vermisst).toBe(1);
    await expect(index.liste('vermisst', 500)).resolves.toEqual([SCHLUESSEL]);
  });

  it('nimmt ein zurueckgelegtes Foto wieder aus der Liste "vermisst"', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    await rm(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`));
    await rm(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`));
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    await legeFotoAb(5);
    const lauf = await fuehreAbgleichAus({
      wurzel,
      index,
      leser: leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 5 } }),
    });

    expect(lauf.vermisst).toBe(0);
    await expect(index.liste('vermisst', 500)).resolves.toEqual([]);
    const auskunft = await auskunftVon(SCHLUESSEL);
    expect(auskunft.foto.vermisst).toBe(false);
    expect(auskunft.foto.bewertung).toBe(5);
    expect(auskunftText(auskunft)).toContain('Zustand: normal');
  });

  it('behaelt die Angaben eines vermissten Fotos', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    await fuehreAbgleichAus({
      wurzel,
      index,
      leser: leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 4, stichwoerter: ['Toskana'] } }),
    });

    await rm(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`));
    await rm(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`));
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    const auskunft = await auskunftVon(SCHLUESSEL);
    expect(auskunft.foto.bewertung).toBe(4);
    expect(auskunft.foto.stichwoerter).toEqual(['Toskana']);
    expect(auskunftText(auskunft)).toContain('Zustand: vermisst');
  });

  it('kennt ein vermisstes Foto auch nach einem leeren Index wieder', async () => {
    await merkeSchluessel();

    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.fotos).toBe(1);
    expect(lauf.vermisst).toBe(1);
    expect((await auskunftVon(SCHLUESSEL)).foto.aufnahmezeit).toBe('2019-06-14 10:15:00');
  });

  it('nimmt die Bild-Pruefsumme eines Fotos in den Index auf', async () => {
    await legeFotoAb();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    const stand = await index.lade();
    const nef = stand.dateien.find((datei) => datei.pfad.endsWith('.NEF'));
    const sidecar = stand.dateien.find((datei) => datei.pfad.endsWith('.xmp'));

    expect(nef?.bildPruefsumme).toMatch(/^[0-9a-f]{64}$/);
    expect(sidecar?.bildPruefsumme).toBeUndefined();
  });

  it('vermerkt die Bild-Pruefsumme beim ersten Einlesen in der Gesehen-Liste', async () => {
    await legeFotoAb();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    const stand = await index.lade();
    const nef = stand.dateien.find((datei) => datei.pfad.endsWith('.NEF'));
    const gesehen = await GesehenListe.lade(wurzel);

    expect(gesehen.bildPruefsumme(SCHLUESSEL)).toBe(nef?.bildPruefsumme);
  });
});

describe('Alarm am Original', () => {
  it('meldet "NEF verändert", wenn ein Byte angehaengt wurde', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    await appendFile(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`), Buffer.from([0x00]));
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.alarme).toBe(1);
    await expect(index.liste('alarme', 500)).resolves.toEqual([
      `${SCHLUESSEL} — NEF verändert (${MONAT}/${SCHLUESSEL}.NEF)`,
    ]);
  });

  it('nimmt den Alarm zurueck, sobald die urspruengliche Datei wieder daliegt', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    await appendFile(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`), Buffer.from([0x00]));
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`), nefBytes({ datum: AUFNAHME }));
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.alarme).toBe(0);
    await expect(index.liste('alarme', 500)).resolves.toEqual([]);
    expect(auskunftText(await auskunftVon(SCHLUESSEL))).toContain('Zustand: normal');
  });

  it('bleibt beim Alarm, solange die NEF veraendert ist', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    await appendFile(imBaum(`${MONAT}/${SCHLUESSEL}.NEF`), Buffer.from([0x00]));

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    const zweiter = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(zweiter.alarme).toBe(1);
    expect(auskunftText(await auskunftVon(SCHLUESSEL))).toContain('Zustand: NEF verändert');
  });

  it('meldet keinen Alarm, wenn ein HEIC eine neue Bewertung bekommt', async () => {
    const pfad = imBaum(`${MONAT}/${SCHLUESSEL}.HEIC`);
    await schreibeDatei(pfad, heicBytes({ datum: AUFNAHME }));
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    // Jemand schreibt eine Bewertung in die Datei: die Metadaten werden
    // laenger, die Bilddaten bleiben Byte fuer Byte dieselben.
    await schreibeDatei(pfad, heicBytes({ datum: AUFNAHME, bewertung: 5 }));
    const lauf = await fuehreAbgleichAus({
      wurzel,
      index,
      leser: leserMit({ [`${SCHLUESSEL}.HEIC`]: { bewertung: 5 } }),
    });

    expect(lauf.alarme).toBe(0);
    expect((await auskunftVon(SCHLUESSEL)).foto.bewertung).toBe(5);
  });

  it('meldet "Bilddaten verändert", wenn ein JPEG neu gerechnet wurde', async () => {
    const pfad = imBaum(`${MONAT}/${SCHLUESSEL}.JPG`);
    await schreibeDatei(pfad, jpegBytes({ datum: AUFNAHME }));
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    // Zugeschnitten: dieselbe Aufnahme, andere Bilddaten.
    await schreibeDatei(pfad, jpegBytes({ datum: AUFNAHME, fuellung: 32 }));
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.alarme).toBe(1);
    await expect(index.liste('alarme', 500)).resolves.toEqual([
      `${SCHLUESSEL} — Bilddaten verändert (${MONAT}/${SCHLUESSEL}.JPG)`,
    ]);
  });

  it('meldet keinen Alarm, wenn ein JPEG nur neue Metadaten bekommt', async () => {
    const pfad = imBaum(`${MONAT}/${SCHLUESSEL}.JPG`);
    await schreibeDatei(pfad, jpegBytes({ datum: AUFNAHME }));
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    await schreibeDatei(pfad, jpegBytes({ datum: AUFNAHME, bewertung: 3 }));
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.alarme).toBe(0);
  });
});

describe('pruefeAlarm', () => {
  const basis = {
    importPruefsumme: 'jetzt',
    bildPruefsumme: 'bild-jetzt',
    referenz: 'bild-jetzt',
    importSummen: new Set(['jetzt']),
  };

  it('meldet eine NEF, die nicht mehr ihrer Import-Pruefsumme entspricht', () => {
    expect(pruefeAlarm({ ...basis, art: 'raw', importPruefsumme: 'anders' })).toBe('nef');
    expect(pruefeAlarm({ ...basis, art: 'raw' })).toBeUndefined();
  });

  it('nimmt bei einer nie importierten NEF die Bild-Pruefsumme als Referenz', () => {
    const ohneImport = { ...basis, art: 'raw' as const, importSummen: new Set<string>() };

    expect(pruefeAlarm({ ...ohneImport, bildPruefsumme: 'anders' })).toBe('nef');
    expect(pruefeAlarm(ohneImport)).toBeUndefined();
  });

  it('meldet bei JPEG und HEIC nur veraenderte Bilddaten', () => {
    expect(pruefeAlarm({ ...basis, art: 'jpeg', importPruefsumme: 'anders' })).toBeUndefined();
    expect(pruefeAlarm({ ...basis, art: 'heic', bildPruefsumme: 'anders' })).toBe('bilddaten');
  });

  it('meldet nichts, solange es keine Referenz gibt', () => {
    expect(
      pruefeAlarm({
        ...basis,
        art: 'jpeg',
        referenz: undefined,
        bildPruefsumme: 'anders',
        importSummen: new Set<string>(),
      }),
    ).toBeUndefined();
  });
});

describe('weitere Faelle', () => {
  it('kommt mit einem Baum ohne original-Verzeichnis zurecht', async () => {
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.fotos).toBe(0);
    expect(lauf.dateien).toBe(0);
  });
});
