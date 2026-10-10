/**
 * Der Index in PostgreSQL.
 *
 * Der Abgleich (req-007) sagt, was im Baum steht; hier wird es abgelegt
 * und beantwortet. Geschrieben wird immer der ganze Stand in einer
 * Transaktion: entweder gilt der neue Index vollstaendig oder weiter der
 * alte — einen halben Index gibt es nicht.
 *
 * Jede Abfrage filtert nach `mandant_id` (siehe `delivery/stack.md`).
 */

import { sql, type Kysely } from 'kysely';

import {
  alarmZeile,
  type AbgleichLauf,
  type ArchivIndex,
  type ArchivStand,
  type ArchivZahlen,
  type AlarmArt,
  type FotoAuskunft,
  type IndexAlarm,
  type IndexDatei,
  type IndexFoto,
  type ListenArt,
} from '@knipsa/pipeline';
import { STANDARD_MANDANT } from '@knipsa/shared';

import type {
  AbgleichTabelle,
  AlarmTabelle,
  Datenbank,
  DateiTabelle,
  FotoTabelle,
} from './datenbank.js';

/**
 * So viele Zeilen gehen je `insert` zusammen. PostgreSQL vertraegt nur
 * begrenzt viele Parameter in einer Anweisung; in Stuecken bleibt auch
 * ein Baum mit 100.000 Dateien in einer Transaktion schreibbar.
 */
const STUECK = 500;

function stuecke<T>(liste: readonly T[], groesse = STUECK): T[][] {
  const teile: T[][] = [];
  for (let start = 0; start < liste.length; start += groesse) {
    teile.push(liste.slice(start, start + groesse));
  }
  return teile;
}

/** `null` aus der Datenbank wird im Index `undefined`. */
function ohneNull<T>(wert: T | null): T | undefined {
  return wert === null ? undefined : wert;
}

function fotoAus(zeile: FotoTabelle): IndexFoto {
  return {
    schluessel: zeile.schluessel,
    aufnahmezeit: zeile.aufnahmezeit,
    bewertung: ohneNull(zeile.bewertung),
    farbmarkierung: ohneNull(zeile.farbmarkierung),
    stichwoerter: zeile.stichwoerter,
    titel: ohneNull(zeile.titel),
    beschreibung: ohneNull(zeile.beschreibung),
    gpsBreite: ohneNull(zeile.gps_breite),
    gpsLaenge: ohneNull(zeile.gps_laenge),
    vermisst: zeile.vermisst,
  };
}

function dateiAus(zeile: DateiTabelle): IndexDatei {
  return {
    pfad: zeile.pfad,
    schluessel: zeile.schluessel,
    groesse: zeile.groesse,
    geaendert: zeile.geaendert,
    importPruefsumme: zeile.import_pruefsumme,
    bildPruefsumme: ohneNull(zeile.bild_pruefsumme),
    sidecar: ohneNull(zeile.sidecar),
  };
}

function alarmAus(zeile: AlarmTabelle): IndexAlarm {
  return {
    schluessel: zeile.schluessel,
    // Die Art steht als Text in der Datenbank; unbekannte Arten gibt es
    // nur, wenn eine aeltere Version etwas anderes geschrieben hat.
    art: zeile.art as AlarmArt,
    pfad: zeile.pfad,
  };
}

function laufAus(zeile: AbgleichTabelle): AbgleichLauf {
  return {
    art: zeile.art === 'neuaufbau' ? 'neuaufbau' : 'abgleich',
    begonnen: zeile.begonnen,
    beendet: zeile.beendet,
    dauerMs: zeile.dauer_ms,
    fotos: zeile.fotos,
    dateien: zeile.dateien,
    vermisst: zeile.vermisst,
    alarme: zeile.alarme,
    unbekannte: zeile.unbekannte,
  };
}

/** Der Index in PostgreSQL, fuer genau einen Mandanten. */
export function datenbankIndex(
  db: Kysely<Datenbank>,
  mandant: string = STANDARD_MANDANT,
): ArchivIndex {
  const alleFotos = (): Promise<FotoTabelle[]> =>
    db.selectFrom('foto').selectAll().where('mandant_id', '=', mandant).execute();

  const leere = async (ausfuehrer: Kysely<Datenbank>): Promise<void> => {
    for (const tabelle of ['foto', 'datei', 'alarm', 'unbekannte_datei', 'abgleich'] as const) {
      await ausfuehrer.deleteFrom(tabelle).where('mandant_id', '=', mandant).execute();
    }
  };

  return {
    async lade(): Promise<ArchivStand> {
      const [fotos, dateien, alarme, unbekannte, abgleich] = await Promise.all([
        alleFotos(),
        db.selectFrom('datei').selectAll().where('mandant_id', '=', mandant).execute(),
        db.selectFrom('alarm').selectAll().where('mandant_id', '=', mandant).execute(),
        db
          .selectFrom('unbekannte_datei')
          .select('pfad')
          .where('mandant_id', '=', mandant)
          .execute(),
        db.selectFrom('abgleich').selectAll().where('mandant_id', '=', mandant).executeTakeFirst(),
      ]);

      return {
        fotos: fotos.map(fotoAus),
        dateien: dateien.map(dateiAus),
        alarme: alarme.map(alarmAus),
        unbekannte: unbekannte.map((zeile) => zeile.pfad),
        letzter: abgleich === undefined ? undefined : laufAus(abgleich),
      };
    },

    async speichere(stand: ArchivStand): Promise<void> {
      await db.transaction().execute(async (lauf) => {
        await leere(lauf);

        for (const teil of stuecke(stand.fotos)) {
          await lauf
            .insertInto('foto')
            .values(
              teil.map((foto) => ({
                mandant_id: mandant,
                schluessel: foto.schluessel,
                aufnahmezeit: foto.aufnahmezeit,
                bewertung: foto.bewertung ?? null,
                farbmarkierung: foto.farbmarkierung ?? null,
                stichwoerter: [...foto.stichwoerter],
                titel: foto.titel ?? null,
                beschreibung: foto.beschreibung ?? null,
                gps_breite: foto.gpsBreite ?? null,
                gps_laenge: foto.gpsLaenge ?? null,
                vermisst: foto.vermisst,
              })),
            )
            .execute();
        }

        for (const teil of stuecke(stand.dateien)) {
          await lauf
            .insertInto('datei')
            .values(
              teil.map((datei) => ({
                mandant_id: mandant,
                pfad: datei.pfad,
                schluessel: datei.schluessel,
                groesse: datei.groesse,
                geaendert: datei.geaendert,
                import_pruefsumme: datei.importPruefsumme,
                bild_pruefsumme: datei.bildPruefsumme ?? null,
                sidecar: datei.sidecar ?? null,
              })),
            )
            .execute();
        }

        for (const teil of stuecke(stand.alarme)) {
          await lauf
            .insertInto('alarm')
            .values(
              teil.map((alarm) => ({
                mandant_id: mandant,
                schluessel: alarm.schluessel,
                art: alarm.art,
                pfad: alarm.pfad,
              })),
            )
            .execute();
        }

        for (const teil of stuecke(stand.unbekannte)) {
          await lauf
            .insertInto('unbekannte_datei')
            .values(teil.map((pfad) => ({ mandant_id: mandant, pfad })))
            .execute();
        }

        if (stand.letzter !== undefined) {
          await lauf
            .insertInto('abgleich')
            .values({
              mandant_id: mandant,
              art: stand.letzter.art,
              begonnen: stand.letzter.begonnen,
              beendet: stand.letzter.beendet,
              dauer_ms: stand.letzter.dauerMs,
              fotos: stand.letzter.fotos,
              dateien: stand.letzter.dateien,
              vermisst: stand.letzter.vermisst,
              alarme: stand.letzter.alarme,
              unbekannte: stand.letzter.unbekannte,
            })
            .execute();
        }
      });
    },

    async verwirf(): Promise<void> {
      await db.transaction().execute(async (lauf) => {
        await leere(lauf);
      });
    },

    async zahlen(): Promise<ArchivZahlen> {
      const [gezaehlt, abgleich] = await Promise.all([
        sql<{
          fotos: string | number;
          dateien: string | number;
          vermisst: string | number;
          alarme: string | number;
          unbekannte: string | number;
        }>`select
             (select count(*) from foto where mandant_id = ${mandant}) as fotos,
             (select count(*) from datei where mandant_id = ${mandant}) as dateien,
             (select count(*) from foto where mandant_id = ${mandant} and vermisst) as vermisst,
             (select count(*) from alarm where mandant_id = ${mandant}) as alarme,
             (select count(*) from unbekannte_datei where mandant_id = ${mandant}) as unbekannte`.execute(
          db,
        ),
        db.selectFrom('abgleich').selectAll().where('mandant_id', '=', mandant).executeTakeFirst(),
      ]);

      const zeile = gezaehlt.rows[0];
      return {
        fotos: Number(zeile?.fotos ?? 0),
        dateien: Number(zeile?.dateien ?? 0),
        vermisst: Number(zeile?.vermisst ?? 0),
        alarme: Number(zeile?.alarme ?? 0),
        unbekannte: Number(zeile?.unbekannte ?? 0),
        letzter: abgleich === undefined ? undefined : laufAus(abgleich),
      };
    },

    async liste(art: ListenArt, grenze: number): Promise<readonly string[]> {
      switch (art) {
        case 'fotos': {
          const zeilen = await db
            .selectFrom('foto')
            .select('schluessel')
            .where('mandant_id', '=', mandant)
            .orderBy('schluessel')
            .limit(grenze)
            .execute();
          return zeilen.map((zeile) => zeile.schluessel);
        }

        case 'vermisst': {
          const zeilen = await db
            .selectFrom('foto')
            .select('schluessel')
            .where('mandant_id', '=', mandant)
            .where('vermisst', '=', true)
            .orderBy('schluessel')
            .limit(grenze)
            .execute();
          return zeilen.map((zeile) => zeile.schluessel);
        }

        case 'dateien': {
          const zeilen = await db
            .selectFrom('datei')
            .select('pfad')
            .where('mandant_id', '=', mandant)
            .orderBy('pfad')
            .limit(grenze)
            .execute();
          return zeilen.map((zeile) => zeile.pfad);
        }

        case 'unbekannte': {
          const zeilen = await db
            .selectFrom('unbekannte_datei')
            .select('pfad')
            .where('mandant_id', '=', mandant)
            .orderBy('pfad')
            .limit(grenze)
            .execute();
          return zeilen.map((zeile) => zeile.pfad);
        }

        case 'alarme': {
          const zeilen = await db
            .selectFrom('alarm')
            .selectAll()
            .where('mandant_id', '=', mandant)
            .orderBy('schluessel')
            .orderBy('art')
            .limit(grenze)
            .execute();
          return zeilen.map((zeile) => alarmZeile(alarmAus(zeile)));
        }
      }
    },

    async auskunft(schluessel: string): Promise<FotoAuskunft | undefined> {
      const foto = await db
        .selectFrom('foto')
        .selectAll()
        .where('mandant_id', '=', mandant)
        .where('schluessel', '=', schluessel)
        .executeTakeFirst();

      if (foto === undefined) {
        return undefined;
      }

      const [dateien, alarme] = await Promise.all([
        db
          .selectFrom('datei')
          .selectAll()
          .where('mandant_id', '=', mandant)
          .where('schluessel', '=', schluessel)
          .orderBy('pfad')
          .execute(),
        db
          .selectFrom('alarm')
          .selectAll()
          .where('mandant_id', '=', mandant)
          .where('schluessel', '=', schluessel)
          .orderBy('art')
          .execute(),
      ]);

      return {
        foto: fotoAus(foto),
        dateien: dateien.map(dateiAus),
        alarme: alarme.map(alarmAus),
      };
    },
  };
}
