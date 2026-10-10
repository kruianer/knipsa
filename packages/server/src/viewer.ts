import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Verzeichnis mit dem gebauten Viewer. Standard ist das dist-Verzeichnis
 * des Nachbarpakets (im Image `/app/packages/viewer/dist`), ueberschreibbar
 * ueber `VIEWER_VERZEICHNIS`.
 */
export function viewerVerzeichnis(env: NodeJS.ProcessEnv = process.env): string {
  return env.VIEWER_VERZEICHNIS ?? fileURLToPath(new URL('../../viewer/dist', import.meta.url));
}

/**
 * Liefert den gebauten Viewer als statische Dateien aus.
 *
 * Fehlt das Verzeichnis (z. B. in Tests ohne Build), bleibt der Server
 * ohne Viewer lauffaehig — die Health-Routen antworten weiter.
 */
export function registriereViewer(app: FastifyInstance, verzeichnis: string): void {
  if (!existsSync(verzeichnis)) {
    app.log.warn('Viewer-Verzeichnis fehlt, der Server liefert nur die Health-Routen');
    return;
  }

  void app.register(fastifyStatic, { root: verzeichnis, index: ['index.html'] });
}
