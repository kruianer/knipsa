import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { repoWurzel } from './pfade.js';

const ausfuehren = promisify(execFile);
const skript = join(repoWurzel, 'deploy/health-check.sh');

let server: Server | undefined;

afterEach(async () => {
  if (server !== undefined) {
    await new Promise((fertig) => server?.close(fertig));
    server = undefined;
  }
});

/** Startet einen Server, der fuer /health/ready den gegebenen Code liefert. */
async function starteServer(code: number): Promise<string> {
  server = createServer((anfrage, antwort) => {
    if (anfrage.url === '/health/ready') {
      antwort.writeHead(code, { 'content-type': 'application/json' });
      antwort.end(JSON.stringify(code === 200 ? { datenbank: 'ok', fotos: 'ok' } : {}));
      return;
    }
    antwort.writeHead(404).end();
  });

  await new Promise<void>((fertig) => server?.listen(0, '127.0.0.1', fertig));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/health/ready`;
}

describe('deploy/health-check.sh', () => {
  it('ist gruen, sobald ready mit 200 antwortet', async () => {
    const url = await starteServer(200);

    const { stdout } = await ausfuehren(skript, [url, '3', '1']);

    expect(stdout).toContain('HTTP 200');
  });

  it('ist rot, wenn ready dauerhaft 503 meldet', async () => {
    const url = await starteServer(503);

    await expect(ausfuehren(skript, [url, '2', '1'])).rejects.toMatchObject({ code: 1 });
  });

  it('ist rot, wenn gar niemand antwortet', async () => {
    // Port 1 ist zu: der Deploy-Schritt schlaegt fehl, statt gruen zu melden.
    await expect(
      ausfuehren(skript, ['http://127.0.0.1:1/health/ready', '2', '1']),
    ).rejects.toMatchObject({ code: 1 });
  });

  it('verlangt eine URL', async () => {
    await expect(ausfuehren(skript, [])).rejects.toMatchObject({ code: 1 });
  });
});
