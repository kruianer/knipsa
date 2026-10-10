import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { leseDatei } from './pfade.js';

interface Dienst {
  readonly image?: string;
  readonly build?: { context?: string; dockerfile?: string };
  readonly ports?: string[];
  readonly volumes?: string[];
  readonly env_file?: string[];
  readonly environment?: Record<string, string>;
  readonly healthcheck?: { test?: string[] };
  readonly depends_on?: Record<string, { condition?: string }>;
}

interface Compose {
  readonly services: Record<string, Dienst>;
  readonly volumes?: Record<string, unknown>;
}

const quelle = leseDatei('deploy/docker-compose.yml');
const compose = parse(quelle) as Compose;
const server = compose.services.server;
const db = compose.services.db;

describe('deploy/docker-compose.yml', () => {
  it('beschreibt genau die Dienste server und db', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['db', 'server']);
  });

  it('baut den server aus dem Repo', () => {
    expect(server?.build?.dockerfile).toBe('deploy/Dockerfile');
    expect(server?.build?.context).toBe('..');
  });

  it('nimmt die env-Datei der Umgebung vom Host', () => {
    for (const dienst of [server, db]) {
      expect(dienst?.env_file).toEqual(['/home/kruianer/knipsa-env/${KNIPSA_ENV}.env']);
    }
  });
});

describe('Erreichbarkeit (nur Heim-WLAN)', () => {
  it('veroeffentlicht beim server genau einen Port, gebunden an die LAN-IP', () => {
    expect(server?.ports).toEqual(['192.168.2.200:${KNIPSA_PORT}:3000']);
  });

  it('bindet keinen Port an 0.0.0.0 und nagelt keinen Host-Port fest', () => {
    expect(quelle).not.toContain('0.0.0.0:');
    for (const port of server?.ports ?? []) {
      expect(port).toContain('${KNIPSA_PORT}');
    }
  });

  it('veroeffentlicht bei der Datenbank keinen Port am Host', () => {
    expect(db).toBeDefined();
    expect(db?.ports).toBeUndefined();
  });

  it('laesst den Server im Container auf 3000 lauschen', () => {
    expect(server?.environment?.SERVER_PORT).toBe('3000');
  });
});

describe('Datenbank', () => {
  it('nutzt pgvector mit festgenagelter Postgres-Hauptversion', () => {
    expect(db?.image).toMatch(/^pgvector\/pgvector:pg\d+$/);
  });

  it('legt die Daten in ein benanntes Volume, das Compose je Projekt trennt', () => {
    // Ab Postgres 18 muss das Volume unter /var/lib/postgresql liegen,
    // unter .../data verweigert das Image den Start.
    expect(db?.volumes).toEqual(['db-daten:/var/lib/postgresql']);
    expect(Object.keys(compose.volumes ?? {})).toEqual(['db-daten']);
  });

  it('setzt keinen festen container_name, damit dev und prod sich nicht in die Quere kommen', () => {
    expect(quelle).not.toContain('container_name');
  });

  it('wartet, bis die Datenbank gesund ist, bevor der Server startet', () => {
    expect(server?.depends_on?.db?.condition).toBe('service_healthy');
    expect(db?.healthcheck?.test?.[0]).toBe('CMD-SHELL');
  });
});

describe('Foto-Baum', () => {
  it('bindet FOTOS_ROOT im Container unter /fotos ein, nur lesend', () => {
    expect(server?.volumes).toEqual(['${FOTOS_ROOT}:/fotos:ro']);
    expect(server?.environment?.FOTOS_PFAD).toBe('/fotos');
  });

  it('nagelt keinen Pfad des Foto-Baums fest', () => {
    expect(quelle).not.toContain('/home/kruianer/knipsa-fotos');
    expect(quelle).not.toContain('/mnt/');
  });
});

describe('Secrets', () => {
  it('enthaelt keine Werte aus den env-Dateien', () => {
    const wertZuweisung = /(POSTGRES_PASSWORD|POSTGRES_USER|POSTGRES_DB|DATABASE_URL)\s*[:=]\s*\S/;
    const zeilen = quelle
      .split('\n')
      .filter((zeile) => !zeile.trim().startsWith('#'))
      // Der pg_isready-Healthcheck liest die Variablen im Container ($$VAR).
      .filter((zeile) => !zeile.includes('pg_isready'));

    for (const zeile of zeilen) {
      expect(zeile, zeile).not.toMatch(wertZuweisung);
    }
  });
});
