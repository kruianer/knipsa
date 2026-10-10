import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { leseDatei, repoWurzel } from './pfade.js';

const dockerfile = leseDatei('deploy/Dockerfile');

describe('deploy/Dockerfile', () => {
  it('baut auf node:24-slim auf', () => {
    expect(dockerfile).toMatch(/^FROM node:24-slim$/m);
  });

  it('bringt pnpm im Image mit, nicht auf dem Host', () => {
    expect(dockerfile).toMatch(/npm install --global pnpm@\d+\.\d+\.\d+/);
  });

  it('installiert mit dem Lockfile und baut alle Pakete', () => {
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('pnpm -r build');
  });

  it('startet den Server, der vor dem Listen migriert', () => {
    expect(dockerfile).toContain('CMD ["node", "packages/server/dist/start.js"]');
    expect(leseDatei('packages/server/src/start.ts')).toMatch(
      /await migriere\(db\)[\s\S]*await app\.listen/,
    );
  });

  it('laeuft nicht als root', () => {
    expect(dockerfile).toMatch(/^USER node$/m);
  });

  it('kopiert weder node_modules noch delivery ins Image', () => {
    const dockerignore = leseDatei('.dockerignore');
    expect(dockerignore).toContain('**/node_modules');
    expect(dockerignore).toContain('delivery');
  });
});

describe('deploy/health-check.sh', () => {
  it('ist ausfuehrbar', () => {
    expect(() =>
      accessSync(join(repoWurzel, 'deploy/health-check.sh'), constants.X_OK),
    ).not.toThrow();
  });

  it('bricht bei Fehlern ab und wiederholt mit Pause', () => {
    const skript = leseDatei('deploy/health-check.sh');
    expect(skript).toContain('set -euo pipefail');
    expect(skript).toMatch(/for \(\(versuch/);
    expect(skript).toContain('exit 1');
  });
});
