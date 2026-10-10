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
    });
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
