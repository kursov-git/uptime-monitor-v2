FROM node:20-alpine AS build
WORKDIR /app

# Copy root package.json for workspace resolution
COPY package*.json ./

# Copy shared packages
COPY packages ./packages

# Copy client folder
COPY client ./client

# Install dependencies for workspaces
RUN npm install

# Build shared workspace types consumed by the client TS build
RUN npm --prefix packages/shared run build

# Move into client and build
WORKDIR /app/client
RUN npm run build

FROM nginx:alpine
# Copy built dist from the workspace client
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /opt/uptime-monitor/nginx/https.conf.template
COPY client/nginx.http.conf.template /opt/uptime-monitor/nginx/http.conf.template
COPY client/scripts/render-nginx-config.sh /usr/local/bin/render-nginx-config.sh
COPY client/scripts/watch-certificates.sh /usr/local/bin/watch-certificates.sh
COPY client/docker-entrypoint.d/40-configure-ssl.sh /docker-entrypoint.d/40-configure-ssl.sh
RUN chmod +x \
    /usr/local/bin/render-nginx-config.sh \
    /usr/local/bin/watch-certificates.sh \
    /docker-entrypoint.d/40-configure-ssl.sh

EXPOSE 80
EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]
