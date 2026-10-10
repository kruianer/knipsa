import { appendFile, mkdtemp, readdir, readFile, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

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

/**
 * Jede Datei und jeder Ordner im Foto-Baum mit Groesse, Aenderungszeit
 * und Pruefsumme. Die Gesehen-Liste bleibt aussen vor: sie darf wachsen
 * (siehe req-007), alles andere nicht.
 */
async function standDesBaums(ordner = ''): Promise<Record<string, string>> {
  const stand: Record<string, string> = {};

  for (const eintrag of await readdir(join(wurzel, ordner), { withFileTypes: true })) {
    const pfad = posix.join(ordner, eintrag.name);
    if (pfad === 'gesehen' || pfad === 'gesehen/gesehen.jsonl') {
      continue;
    }

    if (eintrag.isDirectory()) {
      stand[`${pfad}/`] = 'Ordner';
      Object.assign(stand, await standDesBaums(pfad));
    } else if (eintrag.isFile()) {
      const vollPfad = join(wurzel, pfad);
      const angaben = await stat(vollPfad);
      stand[pfad] = `${angaben.size} ${angaben.mtimeMs} ${await pruefsumme(vollPfad)}`;
    }
  }

  return stand;
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

describe('unbekannte Dateien', () => {
  it('meldet eine von Hand abgelegte Datei mit Pfad und zaehlt sie nicht als Foto', async () => {
    await legeFotoAb();
    await schreibeDatei(imBaum(`${MONAT}/urlaub.jpg`), jpegBytes({ datum: AUFNAHME }));

    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.unbekannte).toBe(1);
    expect(lauf.fotos).toBe(1);
    expect(lauf.dateien).toBe(2);
    await expect(index.liste('unbekannte', 500)).resolves.toEqual([`${MONAT}/urlaub.jpg`]);
    await expect(index.liste('fotos', 500)).resolves.toEqual([SCHLUESSEL]);
  });

  it('meldet auch eine Datei mit beinahe richtigem Namen', async () => {
    await schreibeDatei(imBaum(`${MONAT}/20190614-1015.NEF`), nefBytes({ datum: AUFNAHME }));
    await schreibeDatei(imBaum(`${MONAT}/20190614-101500.NEF`), nefBytes({ datum: AUFNAHME }));

    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.fotos).toBe(0);
    await expect(index.liste('unbekannte', 500)).resolves.toEqual([
      `${MONAT}/20190614-1015.NEF`,
      `${MONAT}/20190614-101500.NEF`,
    ]);
  });

  it('nimmt eine unbekannte Datei nicht in den Index auf', async () => {
    await schreibeDatei(imBaum(`${MONAT}/urlaub.jpg`), jpegBytes({ datum: AUFNAHME }));

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    const stand = await index.lade();
    expect(stand.dateien).toHaveLength(0);
    expect(stand.fotos).toHaveLength(0);
  });

  it('uebergeht versteckte Dateien und Ordner still', async () => {
    await legeFotoAb();
    await schreibeDatei(imBaum(`${MONAT}/.DS_Store`), 'technisch');
    await schreibeDatei(imBaum('.technik/zwischenstand'), 'technisch');

    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.unbekannte).toBe(0);
    expect(lauf.dateien).toBe(2);
  });
});

describe('Neu aufbauen', () => {
  it('kennt danach dieselben Fotos samt dem vermissten Schluessel', async () => {
    const bytes = nefBytes({ datum: AUFNAHME });
    const schluessel = (nummer: number): string =>
      `20190614-10${String(Math.floor(nummer / 60)).padStart(2, '0')}${String(nummer % 60).padStart(2, '0')}a`;

    // 120 Fotos, davon eines nur noch in der Gesehen-Liste.
    for (let nummer = 1; nummer < 120; nummer += 1) {
      await schreibeDatei(imBaum(`${MONAT}/${schluessel(nummer)}.NEF`), bytes);
    }
    await merkeSchluessel(schluessel(0));

    const vorher = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    expect(vorher.fotos).toBe(120);
    expect(vorher.vermisst).toBe(1);

    const nachher = await fuehreAbgleichAus({
      wurzel,
      index,
      leser: leserMit({}),
      neuAufbauen: true,
    });

    expect(nachher.art).toBe('neuaufbau');
    expect(nachher.fotos).toBe(120);
    expect(nachher.vermisst).toBe(1);
    await expect(index.liste('vermisst', 500)).resolves.toEqual([schluessel(0)]);
  });

  it('liest dabei jede Datei neu ein', async () => {
    await legeFotoAb();
    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    const leser = leserMit({ [`${SCHLUESSEL}.xmp`]: { bewertung: 5 } });
    await fuehreAbgleichAus({ wurzel, index, leser, neuAufbauen: true });

    expect(leser.gelesen).toEqual([`${SCHLUESSEL}.xmp`]);
    expect((await auskunftVon(SCHLUESSEL)).foto.bewertung).toBe(5);
  });

  it('laesst Fotos, Sidecars und Ordner im Baum unangetastet', async () => {
    await legeFotoAb();
    await merkeNefGesehen();
    const vorher = await standDesBaums();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}), neuAufbauen: true });

    expect(await standDesBaums()).toEqual(vorher);
  });
});

describe('der Foto-Baum bleibt unangetastet', () => {
  /** Ein Baum mit allem, was req-007 kennt: NEF samt Sidecar, JPEG, HEIC. */
  async function legeBaumAn(): Promise<void> {
    await legeFotoAb();
    await schreibeDatei(imBaum(`${MONAT}/20190614-101501a.JPG`), jpegBytes({ datum: AUFNAHME }));
    await schreibeDatei(imBaum(`${MONAT}/20190614-101502a.HEIC`), heicBytes({ datum: AUFNAHME }));
    await schreibeDatei(
      imBaum('2019-06-14_toskana/20190614-101503a.NEF'),
      nefBytes({ datum: AUFNAHME }),
    );
    await schreibeDatei(imBaum('2019-06-14_toskana/20190614-101503a.xmp'), xmpText(2));
    await schreibeDatei(imBaum(`${MONAT}/urlaub.jpg`), jpegBytes({ datum: AUFNAHME }));
    await merkeNefGesehen();
  }

  /** Der Inhalt der Gesehen-Liste, Zeile fuer Zeile. */
  async function gesehenZeilen(): Promise<string> {
    return readFile(join(wurzel, 'gesehen', 'gesehen.jsonl'), 'utf8');
  }

  it('veraendert bei Abgleich und Neuaufbau keine Datei und keinen Ordner', async () => {
    await legeBaumAn();
    const vorher = await standDesBaums();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    expect(await standDesBaums()).toEqual(vorher);

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}), neuAufbauen: true });
    expect(await standDesBaums()).toEqual(vorher);
  });

  it('ergaenzt die Gesehen-Liste nur, statt sie zu aendern', async () => {
    await legeBaumAn();
    const vorher = await gesehenZeilen();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    const nachAbgleich = await gesehenZeilen();

    // Neue Zeilen kommen hinten dazu, der Anfang bleibt Zeichen fuer Zeichen.
    expect(nachAbgleich.startsWith(vorher)).toBe(true);
    expect(nachAbgleich.length).toBeGreaterThan(vorher.length);

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}), neuAufbauen: true });

    // Die Bild-Pruefsummen stehen schon da: der Neuaufbau aendert nichts.
    expect(await gesehenZeilen()).toBe(nachAbgleich);
  });

  it('legt im Baum nichts Neues an', async () => {
    await legeBaumAn();
    const vorher = Object.keys(await standDesBaums()).sort();

    await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(Object.keys(await standDesBaums()).sort()).toEqual(vorher);
  });
});

describe('Abgleich ueber einen grossen Baum', () => {
  /** Schluessel Nummer `nummer` am 14. Juni 2019. */
  function schluesselNummer(nummer: number): string {
    const stunde = String(Math.floor(nummer / 3600)).padStart(2, '0');
    const minute = String(Math.floor(nummer / 60) % 60).padStart(2, '0');
    const sekunde = String(nummer % 60).padStart(2, '0');
    return `20190614-${stunde}${minute}${sekunde}a`;
  }

  it('braucht ohne Aenderung bei 10.000 Dateien hoechstens 2 Minuten', async () => {
    const anzahl = 10_000;
    const bytes = nefBytes({ datum: AUFNAHME });

    for (let nummer = 0; nummer < anzahl; nummer += 1) {
      const schluessel = schluesselNummer(nummer);
      await schreibeDatei(imBaum(`${MONAT}/${schluessel}.NEF`), bytes);
    }

    // Erster Lauf: alles neu, jede Datei wird gelesen.
    const erster = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });
    expect(erster.dateien).toBe(anzahl);

    // Zweiter Lauf: nichts hat sich geaendert.
    const leser = leserMit({});
    const zweiter = await fuehreAbgleichAus({ wurzel, index, leser });

    expect(zweiter.dateien).toBe(anzahl);
    expect(leser.gelesen).toHaveLength(0);
    expect(zweiter.dauerMs).toBeLessThanOrEqual(120_000);
    expect((await index.zahlen()).letzter?.dauerMs).toBe(zweiter.dauerMs);
  }, 300_000);
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
