import { describe, expect, it } from 'vitest';

import { pipelineKonfiguration } from './index.js';

describe('pipelineKonfiguration', () => {
  it('liefert die Konfiguration aus der uebergebenen Umgebung', () => {
    const konfig = pipelineKonfiguration({
      KNIPSA_ENV: 'dev',
      APP_ORIGIN: 'http://192.168.2.200:8098',
      DATABASE_URL: 'postgres://knipsa@db:5432/knipsa_dev',
      FOTOS_PFAD: '/fotos',
      SERVER_HOST: '0.0.0.0',
      SERVER_PORT: '3000',
    });

    expect(konfig.umgebung).toBe('dev');
    expect(konfig.fotosPfad).toBe('/fotos');
  });

  it('meldet eine unvollstaendige Umgebung', () => {
    expect(() => pipelineKonfiguration({ KNIPSA_ENV: 'dev' })).toThrow('APP_ORIGIN');
  });
});
