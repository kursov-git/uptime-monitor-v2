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
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
