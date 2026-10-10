# Image des server-Dienstes: baut den Workspace und startet den Server.
# Kontext ist die Repo-Wurzel (siehe deploy/docker-compose.yml).
FROM node:24-slim

WORKDIR /app
ENV CI=true

# pnpm wird im Image installiert, nicht auf dem Host.
RUN npm install --global pnpm@12.10.1

# Erst die Manifeste: solange sie sich nicht aendern, bleibt die
# Install-Schicht im Cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/pipeline/package.json packages/pipeline/
COPY packages/server/package.json packages/server/
COPY packages/viewer/package.json packages/viewer/
COPY deploy/package.json deploy/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY deploy deploy

# Server, Pipeline, shared (tsc) und Viewer (Vite) bauen, danach die
# Bau-Abhaengigkeiten wieder entfernen.
RUN pnpm -r build \
  && pnpm install --frozen-lockfile --prod \
  && pnpm store prune

ENV NODE_ENV=production
EXPOSE 3000
USER node

# Migrationen laufen in start.js vor dem Listen.
CMD ["node", "packages/server/dist/start.js"]
