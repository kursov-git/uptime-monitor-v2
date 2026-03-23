import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const nginxTemplates = [
    path.join(repoRoot, 'client/nginx.conf'),
    path.join(repoRoot, 'client/nginx.http.conf.template'),
];

describe('edge config', () => {
    it.each(nginxTemplates)('restricts /health and /health/runtime in %s', (templatePath) => {
        const template = fs.readFileSync(templatePath, 'utf8');

        expect(template).toContain('location = /health {');
        expect(template).toContain('proxy_pass http://server:3000/health;');
        expect(template).toContain('location = /health/runtime {');
        expect(template).toContain('proxy_pass http://server:3000/health/runtime;');

        const healthSection = template.slice(
            template.indexOf('location = /health {'),
            template.indexOf('location = /health/runtime {')
        );
        const runtimeSection = template.slice(template.indexOf('location = /health/runtime {'));

        expect(healthSection).toContain('include /etc/nginx/snippets/runtime-health-allowlist.conf;');
        expect(runtimeSection).toContain('include /etc/nginx/snippets/runtime-health-allowlist.conf;');
    });

    it.each(nginxTemplates)('hardens SSE proxying in %s', (templatePath) => {
        const template = fs.readFileSync(templatePath, 'utf8');

        expect(template).toContain('location = /api/agent/stream {');
        expect(template).toContain('location = /api/monitors/stream {');
        expect(template).toContain('proxy_buffering off;');
        expect(template).toContain('proxy_cache off;');
        expect(template).toContain('proxy_read_timeout 1h;');
        expect(template).toContain('proxy_send_timeout 1h;');
        expect(template).toContain('add_header X-Accel-Buffering "no" always;');
    });
});
