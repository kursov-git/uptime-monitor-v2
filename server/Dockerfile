FROM node:20-slim AS build
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy root configurations and workspace definitions
COPY package*.json ./

# Copy packages
COPY packages ./packages

# Copy server code
COPY server ./server

# Install all workspace dependencies
RUN npm ci

WORKDIR /app/server
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
RUN apt-get update && apt-get install -y openssl gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Only copy what's needed to run the server
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package*.json ./server/
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/docker-entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh
RUN mkdir -p /data && chown -R node:node /app /data

WORKDIR /app/server
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
