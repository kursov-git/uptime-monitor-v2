import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Docker Compose Smoke', () => {
    it('uses /health endpoint for server healthcheck', () => {
        const composePath = path.resolve(__dirname, '../../../docker-compose.yml');
        const compose = fs.readFileSync(composePath, 'utf8');

        expect(compose).toContain('http://localhost:3000/health');
        expect(compose).not.toContain('http://localhost:3000/api/auth/me');
    });
});
