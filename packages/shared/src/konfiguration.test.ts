import { describe, expect, it } from 'vitest';

import {
  KonfigurationsFehler,
  leseKonfiguration,
  type UmgebungsVariablen,
} from './konfiguration.js';

const vollstaendig: UmgebungsVariablen = {
  KNIPSA_ENV: 'dev',
  APP_ORIGIN: 'http://192.168.2.200:8098',
  DATABASE_URL: 'postgres://knipsa:geheim@db:5432/knipsa_dev',
  FOTOS_PFAD: '/fotos',
  SERVER_HOST: '0.0.0.0',
  SERVER_PORT: '3000',
};

describe('leseKonfiguration', () => {
  it('liest alle Werte aus der Umgebung', () => {
    expect(leseKonfiguration(vollstaendig)).toEqual({
      umgebung: 'dev',
      appOrigin: 'http://192.168.2.200:8098',
      databaseUrl: 'postgres://knipsa:geheim@db:5432/knipsa_dev',
      fotosPfad: '/fotos',
      serverHost: '0.0.0.0',
      serverPort: 3000,
      importQuellen: [],
      datentraegerPfad: '',
    });
  });

  describe('DATENTRAEGER_PFAD', () => {
    it('ist leer, wenn nichts eingestellt ist', () => {
      expect(leseKonfiguration(vollstaendig).datentraegerPfad).toBe('');
      expect(leseKonfiguration({ ...vollstaendig, DATENTRAEGER_PFAD: '  ' }).datentraegerPfad).toBe(
        '',
      );
    });

    it('liest den Ordner, unter dem Datentraeger eingehaengt erscheinen', () => {
      expect(
        leseKonfiguration({ ...vollstaendig, DATENTRAEGER_PFAD: '/datentraeger' }).datentraegerPfad,
      ).toBe('/datentraeger');
    });

    it('lehnt einen relativen Pfad ab', () => {
      expect(() =>
        leseKonfiguration({ ...vollstaendig, DATENTRAEGER_PFAD: 'datentraeger' }),
      ).toThrow('DATENTRAEGER_PFAD');
    });
  });

  describe('IMPORT_QUELLEN', () => {
    it('ist leer, wenn nichts eingestellt ist', () => {
      expect(leseKonfiguration(vollstaendig).importQuellen).toEqual([]);
      expect(leseKonfiguration({ ...vollstaendig, IMPORT_QUELLEN: '  ' }).importQuellen).toEqual(
        [],
      );
    });

    it('liest Name und Pfad je Quelle', () => {
      const konfig = leseKonfiguration({
        ...vollstaendig,
        IMPORT_QUELLEN: 'Test=/quellen/test; Altbestand=/quellen/alt',
      });

      expect(konfig.importQuellen).toEqual([
        { name: 'Test', pfad: '/quellen/test' },
        { name: 'Altbestand', pfad: '/quellen/alt' },
      ]);
    });

    it.each(['Test', 'Test=', '=/quellen/test', 'Test=quellen/test', 'Test=/a;Test=/b'])(
      'lehnt %s ab',
      (wert) => {
        expect(() => leseKonfiguration({ ...vollstaendig, IMPORT_QUELLEN: wert })).toThrow(
          'IMPORT_QUELLEN',
        );
      },
    );
  });

  it('akzeptiert prod als Umgebung', () => {
    const konfig = leseKonfiguration({ ...vollstaendig, KNIPSA_ENV: 'prod' });
    expect(konfig.umgebung).toBe('prod');
  });

  it.each(['KNIPSA_ENV', 'APP_ORIGIN', 'DATABASE_URL', 'FOTOS_PFAD', 'SERVER_HOST', 'SERVER_PORT'])(
    'wirft, wenn %s fehlt',
    (variable) => {
      const env = { ...vollstaendig, [variable]: undefined };
      expect(() => leseKonfiguration(env)).toThrow(KonfigurationsFehler);
      expect(() => leseKonfiguration(env)).toThrow(variable);
    },
  );

  it('behandelt Leerstring wie fehlend', () => {
    expect(() => leseKonfiguration({ ...vollstaendig, APP_ORIGIN: '   ' })).toThrow('APP_ORIGIN');
  });

  it('lehnt eine unbekannte Umgebung ab', () => {
    expect(() => leseKonfiguration({ ...vollstaendig, KNIPSA_ENV: 'staging' })).toThrow(
      'dev oder prod',
    );
  });

  it.each(['0', '70000', 'abc', '3000.5'])('lehnt den Port %s ab', (port) => {
    expect(() => leseKonfiguration({ ...vollstaendig, SERVER_PORT: port })).toThrow('SERVER_PORT');
  });

  it('nennt in der Fehlermeldung keinen Wert aus der Umgebung', () => {
    const geheim = 'postgres://knipsa:sehr-geheim@db:5432/knipsa_dev';
    try {
      leseKonfiguration({ ...vollstaendig, DATABASE_URL: geheim, SERVER_PORT: 'abc' });
      expect.unreachable('haette werfen muessen');
    } catch (fehler) {
      expect((fehler as Error).message).not.toContain('sehr-geheim');
      expect((fehler as Error).message).not.toContain('abc');
    }
  });
});
