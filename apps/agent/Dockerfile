FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY apps/agent/package*.json ./apps/agent/
COPY packages/checker/package*.json ./packages/checker/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci --workspace apps/agent --workspace packages/checker --workspace packages/shared --include-workspace-root=false

COPY apps/agent ./apps/agent
COPY packages/checker ./packages/checker
COPY packages/shared ./packages/shared

RUN npm --prefix packages/shared run build
RUN npm --prefix packages/checker run build
RUN npm --prefix apps/agent run build

FROM node:20-alpine AS runtime
WORKDIR /app

COPY package*.json ./
COPY apps/agent/package*.json ./apps/agent/
COPY packages/checker/package*.json ./packages/checker/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci --omit=dev --workspace apps/agent --workspace packages/checker --workspace packages/shared --include-workspace-root=false

COPY --from=build /app/apps/agent/dist ./apps/agent/dist
COPY --from=build /app/packages/checker/dist ./packages/checker/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

USER node
CMD ["node", "apps/agent/dist/index.js"]
