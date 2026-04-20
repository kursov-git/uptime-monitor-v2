import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Docker Compose Smoke', () => {
    it('uses /health endpoint for server healthcheck', () => {
        const composePath = path.resolve(__dirname, '../../../docker-compose.yml');
        const compose = fs.readFileSync(composePath, 'utf8');

        expect(compose).toContain('/health');
        expect(compose).toContain('node');
        expect(compose).toContain("fetch('http://127.0.0.1:3000/health')");
        expect(compose).not.toContain('http://localhost:3000/api/auth/me');
    });

    it('defines split runtime services', () => {
        const composePath = path.resolve(__dirname, '../../../docker-compose.split.yml');
        const compose = fs.readFileSync(composePath, 'utf8');

        expect(compose).toContain('SERVER_ROLE=api');
        expect(compose).toContain('SERVER_ROLE=worker');
        expect(compose).toContain('SERVER_ROLE=retention');
        expect(compose).toContain('SERVER_ROLE=agent-offline-monitor');
        expect(compose).toContain('DB_INIT_ON_START=true');
        expect(compose).toContain('DB_INIT_ON_START=false');
        expect(compose).toContain('condition: service_healthy');
        expect(compose).toContain('/health/runtime');
    });
});
