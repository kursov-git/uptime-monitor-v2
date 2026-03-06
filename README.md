# Uptime Monitor

Self-hosted uptime monitoring service with a modern dashboard.

## Features

- **Monitor HTTP endpoints** with configurable intervals and timeouts
- **Status validation** — expected status code and response body (regex/substring)
- **Advanced Authentication** — Basic auth, JSON Form Login, and `CSRF_FORM_LOGIN` support
- **Custom headers** for authenticated endpoints
- **Pause/Resume** individual monitors
- **Notifications** via Telegram and Zulip with flapping protection
- **Advanced Flapping Diagnostics** in the UI with detailed state tooltips
- **Per-monitor notification overrides**
- **User management** with Admin/Viewer roles
- **API key authentication** for read-only access
- **Audit logging** of all administrative actions
- **Automatic data retention** cleanup
- **Dark theme UI** with responsive design
- **Docker deployment** ready

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Fastify + TypeScript |
| Database | SQLite via Prisma ORM |
| Frontend | React 18 + Vite |
| Deployment | Docker + Docker Compose + Nginx |

## Quick Start

### Local Development

```bash
# Server
cd server
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev

# Client (separate terminal)
cd client
npm install
npm run dev
```

Server runs on `http://localhost:3000`, client on `http://localhost:5173`.

### Docker (Local)

```bash
cp .env.example .env
# Set JWT_SECRET and ADMIN_PASSWORD in .env
docker compose up -d --build
```

Application will be available at `http://localhost`.

### Production Deployment (VPS)

Requires one-time SSH key setup:

```bash
# Generate key and copy to server
ssh-keygen -t ed25519 -f ~/.ssh/uptime_deploy
ssh-copy-id -i ~/.ssh/uptime_deploy root@YOUR_SERVER_IP

# Add to ~/.ssh/config:
# Host uptime
#     HostName YOUR_SERVER_IP
#     User root
#     IdentityFile ~/.ssh/uptime_deploy
```

Then deploy with one command:

```bash
bash deploy.sh
```

The `.env` file on the server is preserved across deploys. Set `ADMIN_PASSWORD` on the server before the first deploy.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/monitors` | JWT/Key | List monitors |
| GET | `/api/monitors/:id` | JWT/Key | Monitor details |
| GET | `/api/monitors/:id/stats` | JWT/Key | Check history |
| POST | `/api/monitors` | Admin | Create monitor |
| PUT | `/api/monitors/:id` | Admin | Update monitor |
| PATCH | `/api/monitors/:id/toggle` | Admin | Pause/Resume |
| DELETE | `/api/monitors/:id` | Admin | Delete monitor |
| GET | `/api/users` | Admin | List users |
| POST | `/api/users` | Admin | Create user |
| DELETE | `/api/users/:id` | Admin | Delete user |
| PATCH | `/api/users/:id/password` | Admin | Change password |
| GET | `/api/apikeys/me` | JWT | Get API key |
| POST | `/api/apikeys/generate` | JWT | Generate key |
| DELETE | `/api/apikeys/revoke` | JWT | Revoke key |
| GET | `/api/audit` | Admin | Audit log |
| GET | `/api/notifications/settings` | Admin | Get settings |
| PUT | `/api/notifications/settings` | Admin | Update settings |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes (production) | auto | JWT signing secret |
| `ADMIN_PASSWORD` | No | random | Initial admin password |
| `DATABASE_URL` | No | `file:./prisma/dev.db` | SQLite path |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Allowed origins |
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
