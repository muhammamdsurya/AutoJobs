# The server only serves the apps and runs the worker: applying happens in users' browsers, so no Chromium here.
# One image for web, admin and worker (monorepo: npm workspaces). Stage 1 builds; the final image keeps only what runs
# (production dependencies, the builds, the source the worker and migrations run from) and runs as the unprivileged
# "node" user (uid 1000).
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev && rm -rf apps/*/.next/cache

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 3001
CMD ["npm", "start"]
