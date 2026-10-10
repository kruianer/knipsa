import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fuehreAbgleichAus } from './abgleich.js';
import { auskunftText } from './archivdienst.js';
import { speicherIndex, type ArchivIndex, type FotoAuskunft } from './archivindex.js';
import { KEINE_ANGABEN, type AngabenLeser, type GeleseneAngaben } from './metadaten.js';
import { nefBytes, schreibeDatei, xmpText } from './test/testbilder.js';

const SCHLUESSEL = '20190614-101500a';
const MONAT = '_wartend/2019-06';

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
  await schreibeDatei(
    imBaum(`${MONAT}/${SCHLUESSEL}.NEF`),
    nefBytes({ datum: '2019:06:14 10:15:00' }),
  );
  await schreibeDatei(imBaum(`${MONAT}/${SCHLUESSEL}.xmp`), xmpText(bewertung));
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
    await schreibeDatei(
      imBaum(`${MONAT}/${SCHLUESSEL}.NEF`),
      nefBytes({ datum: '2019:06:14 10:15:00' }),
    );
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

  it('kommt mit einem Baum ohne original-Verzeichnis zurecht', async () => {
    const lauf = await fuehreAbgleichAus({ wurzel, index, leser: leserMit({}) });

    expect(lauf.fotos).toBe(0);
    expect(lauf.dateien).toBe(0);
  });
});
