import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { leseDatei } from './pfade.js';

interface Schritt {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, string>;
}

interface Workflow {
  readonly name: string;
  readonly on: {
    push?: { branches?: string[] };
    workflow_dispatch?: null;
  };
  readonly concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  readonly jobs: Record<
    string,
    { 'runs-on'?: string[]; env?: Record<string, string>; steps?: Schritt[] }
  >;
}

const umgebungen = [
  { datei: '.github/workflows/deploy-dev.yml', env: 'dev', branch: 'dev', port: '8098' },
  { datei: '.github/workflows/deploy-prod.yml', env: 'prod', branch: 'main', port: '8099' },
] as const;

function lade(datei: string): { quelle: string; workflow: Workflow } {
  const quelle = leseDatei(datei);
  return { quelle, workflow: parse(quelle) as Workflow };
}

function schritte(workflow: Workflow): Schritt[] {
  const job = Object.values(workflow.jobs)[0];
  return job?.steps ?? [];
}

describe.each(umgebungen)('$datei', ({ datei, env, branch, port }) => {
  const { quelle, workflow } = lade(datei);
  const job = Object.values(workflow.jobs)[0];
  const alle = schritte(workflow);
  const befehle = alle.map((schritt) => schritt.run ?? '').join('\n');

  it(`laeuft bei Push auf ${branch} und per Hand`, () => {
    expect(workflow.on.push?.branches).toEqual([branch]);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('laeuft auf dem Runner des Beelink', () => {
    expect(job?.['runs-on']).toEqual(['self-hosted', 'knipsa']);
  });

  it('serialisiert Deploys je Umgebung, ohne laufende abzubrechen', () => {
    expect(workflow.concurrency?.group).toBe(`knipsa-${env}`);
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(false);
  });

  it('bringt Node 24 und pnpm selbst mit, statt sie auf dem Host zu erwarten', () => {
    const node = alle.find((schritt) => schritt.uses?.startsWith('actions/setup-node'));
    const pnpm = alle.find((schritt) => schritt.uses?.startsWith('pnpm/action-setup'));

    expect(node?.with?.['node-version-file']).toBe('.nvmrc');
    expect(pnpm).toBeDefined();
    expect(befehle).not.toMatch(/npm install\s+(--global|-g)/);
  });

  it('startet die Container mit Projektname und env-Datei der Umgebung', () => {
    expect(job?.env?.KNIPSA_ENV).toBe(env);
    expect(job?.env?.COMPOSE_PROJEKT).toBe(`knipsa-${env}`);
    expect(befehle).toContain('docker compose -p "$COMPOSE_PROJEKT"');
    expect(befehle).toContain('--env-file "$HOME/knipsa-env/${KNIPSA_ENV}.env"');
    expect(befehle).toContain('-f deploy/docker-compose.yml');
    expect(befehle).toContain('up -d --build --remove-orphans');
  });

  it('prueft nach dem Start /health/ready der LAN-URL', () => {
    expect(job?.env?.READY_URL).toBe(`http://192.168.2.200:${port}/health/ready`);
    expect(befehle).toContain('./deploy/health-check.sh "$READY_URL"');
  });

  it('raeumt alte Images auf und zeigt den Zustand', () => {
    expect(befehle).toContain('docker image prune -f');
    expect(befehle).toMatch(/-f deploy\/docker-compose\.yml ps/);
  });

  it('liest keine Secrets aus GitHub und gibt keine env-Werte aus', () => {
    expect(quelle).not.toContain('secrets.');
    expect(quelle).not.toMatch(/\bcat\b.*knipsa-env/);
    expect(quelle).not.toMatch(/\becho\b.*knipsa-env/);
    expect(quelle).not.toContain('POSTGRES_PASSWORD');
  });

  it('fasst die andere Umgebung nicht an', () => {
    const andere = env === 'dev' ? 'prod' : 'dev';
    expect(quelle).not.toContain(`knipsa-${andere}`);
    expect(quelle).not.toContain(`knipsa-env/${andere}.env`);
  });
});
