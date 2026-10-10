import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Wurzel des Repos, von `deploy/tests/` aus zwei Ebenen hoch. */
export const repoWurzel = fileURLToPath(new URL('../..', import.meta.url));

export function leseDatei(relativerPfad: string): string {
  return readFileSync(new URL(`../../${relativerPfad}`, import.meta.url), 'utf8');
}

export function leseJson<T>(relativerPfad: string): T {
  return JSON.parse(leseDatei(relativerPfad)) as T;
}
