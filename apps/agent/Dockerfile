FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY apps/agent/package*.json ./apps/agent/
COPY packages/checker/package*.json ./packages/checker/
RUN npm ci

COPY apps/agent ./apps/agent
COPY packages/checker ./packages/checker

RUN npm --prefix apps/agent run build

CMD ["npm", "--prefix", "apps/agent", "run", "start"]
