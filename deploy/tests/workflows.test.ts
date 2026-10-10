import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { leseDatei } from './pfade.js';

interface Schritt {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly 'continue-on-error'?: boolean;
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

/**
 * Qualitaetsschranke: Install, Lint, Typecheck und Tests laufen vor jedem
 * Schritt, der die laufende Umgebung anfasst. Schlaegt einer davon fehl,
 * bricht GitHub Actions den Job ab — die laufenden Container werden nicht
 * angefasst und bleiben erreichbar.
 */
describe.each(umgebungen)('$datei: kein Deploy bei roten Tests', ({ datei }) => {
  const { quelle, workflow } = lade(datei);
  const alle = schritte(workflow);

  function index(muster: RegExp): number {
    return alle.findIndex((schritt) => muster.test(schritt.run ?? ''));
  }

  const install = index(/pnpm install --frozen-lockfile/);
  const lint = index(/pnpm lint/);
  const typecheck = index(/pnpm typecheck/);
  const test = index(/pnpm -r test/);
  const up = index(/up -d --build/);

  it('hat alle Schranken und den Deploy-Schritt', () => {
    for (const [name, position] of Object.entries({ install, lint, typecheck, test, up })) {
      expect(position, name).toBeGreaterThanOrEqual(0);
    }
  });

  it('fuehrt Install, Lint, Typecheck und Tests vor dem Deploy aus', () => {
    expect(install).toBeLessThan(lint);
    expect(lint).toBeLessThan(typecheck);
    expect(typecheck).toBeLessThan(test);
    expect(test).toBeLessThan(up);
  });

  it('laesst keinen Schritt Fehler verschlucken', () => {
    for (const schritt of alle) {
      expect(schritt['continue-on-error'], schritt.name).not.toBe(true);
      expect(schritt.if, schritt.name).toBeUndefined();
      expect(schritt.run ?? '', schritt.name).not.toContain('|| true');
    }
  });

  it('stoppt die laufende Version nicht vorab', () => {
    // `up -d --build` baut zuerst und ersetzt die Container erst danach.
    // Ein `down`/`stop`/`rm` davor wuerde die alte Version abschalten,
    // auch wenn der neue Stand nicht hochkommt.
    expect(quelle).not.toMatch(/docker compose[^\n]*\b(down|stop|rm)\b/);
    expect(quelle).not.toMatch(/docker\s+(stop|rm|kill)\b/);
  });

  it('prueft die neue Version nach dem Start und bricht sonst ab', () => {
    const health = index(/health-check\.sh/);
    expect(health).toBeGreaterThan(up);
    expect(leseDatei('deploy/health-check.sh')).toContain('exit 1');
  });
});
