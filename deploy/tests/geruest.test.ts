import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { leseDatei, leseJson, repoWurzel } from './pfade.js';

interface PaketJson {
  readonly name?: string;
  readonly packageManager?: string;
  readonly engines?: Record<string, string>;
  readonly scripts?: Record<string, string>;
}

const wurzelPaket = leseJson<PaketJson>('package.json');

describe('Repo-Geruest', () => {
  it('ist ein pnpm-Workspace mit den Paketen aus delivery/stack.md', () => {
    const workspace = parse(leseDatei('pnpm-workspace.yaml')) as { packages: string[] };

    expect(workspace.packages).toContain('packages/*');
    expect(workspace.packages).toContain('deploy');

    for (const paket of ['shared', 'pipeline', 'server', 'viewer']) {
      expect(existsSync(join(repoWurzel, 'packages', paket, 'package.json'))).toBe(true);
    }
  });

  it('haelt Node 24 in .nvmrc und engines fest', () => {
    expect(leseDatei('.nvmrc').trim()).toBe('24');
    expect(wurzelPaket.engines?.node).toBe('>=24 <25');
    expect(leseDatei('.npmrc')).toContain('engine-strict=true');
  });

  it('legt pnpm als Paketmanager fest', () => {
    expect(wurzelPaket.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });

  it('bietet die Befehle aus delivery/stack.md an', () => {
    for (const befehl of ['lint', 'format', 'typecheck']) {
      expect(wurzelPaket.scripts?.[befehl]).toBeTypeOf('string');
    }
  });

  it('gibt jedem Paket build, typecheck und test', () => {
    const paketeMitBuild = ['shared', 'pipeline', 'server', 'viewer'];

    for (const paket of paketeMitBuild) {
      const json = leseJson<PaketJson>(`packages/${paket}/package.json`);
      expect(json.scripts?.build, `${paket}: build`).toBeTypeOf('string');
      expect(json.scripts?.typecheck, `${paket}: typecheck`).toBeTypeOf('string');
      expect(json.scripts?.test, `${paket}: test`).toBeTypeOf('string');
    }
  });

  it('haelt Abhaengigkeiten der Pakete auf die Workspace-Version', () => {
    const server = leseJson<{ dependencies?: Record<string, string> }>(
      'packages/server/package.json',
    );
    expect(server.dependencies?.['@knipsa/shared']).toBe('workspace:*');
  });
});
