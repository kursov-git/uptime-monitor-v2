import { describe, expect, it } from 'vitest';
import {
    applyBodyAssertionType,
    applyHttpMethod,
    applyMonitorTypeDefaults,
    buildInitialMonitorFormData,
    buildMonitorSubmitData,
    getMonitorFormErrorMessage,
    parseAuthPayloadFields,
} from '../lib/monitorFormModel';
import type { Monitor, MonitorFormData } from '../api';

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
    return {
        id: 'monitor-1',
        name: 'Auth API',
        serviceName: 'Authentication',
        type: 'HTTP',
        url: 'https://auth.example.com/health',
        dnsRecordType: 'A',
        agentId: null,
        agentName: 'cloudruvm1',
        method: 'GET',
        intervalSeconds: 60,
        timeoutSeconds: 30,
        expectedStatus: 200,
        expectedBody: null,
        requestBody: null,
        bodyAssertionType: 'NONE',
        bodyAssertionPath: null,
        headers: null,
        authMethod: 'NONE',
        authUrl: null,
        authPayload: null,
        authTokenRegex: null,
        sslExpiryEnabled: false,
        sslExpiryThresholdDays: 14,
        isActive: true,
        isPublic: false,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:00:00.000Z',
        lastCheck: null,
        flappingState: null,
        ...overrides,
    };
}

function baseForm(overrides: Partial<MonitorFormData> = {}): MonitorFormData {
    return {
        name: 'Auth API',
        serviceName: 'Authentication',
        type: 'HTTP',
        url: 'https://auth.example.com/health',
        dnsRecordType: 'A',
        agentId: '',
        method: 'POST',
        intervalSeconds: 60,
        timeoutSeconds: 30,
        expectedStatus: 200,
        expectedBody: 'ok',
        requestBody: '{"ping":true}',
        bodyAssertionType: 'CONTAINS',
        bodyAssertionPath: '',
        headers: '{"Content-Type":"application/json"}',
        authMethod: 'NONE',
        authUrl: '',
        authPayload: '',
        authTokenRegex: '',
        sslExpiryEnabled: true,
        sslExpiryThresholdDays: 10,
        ...overrides,
    };
}

describe('monitorFormModel helpers', () => {
    it('builds initial form state and auth fields from existing monitors', () => {
        const monitor = baseMonitor({
            expectedBody: 'ready',
            bodyAssertionType: 'AUTO',
            authMethod: 'FORM_LOGIN',
            authPayload: JSON.stringify({
                email: 'user@example.com',
                password: 'secret',
                tenantId: 'tenant-1',
            }),
        });

        expect(buildInitialMonitorFormData(monitor)).toEqual(expect.objectContaining({
            expectedBody: 'ready',
            bodyAssertionType: 'AUTO',
            authPayload: monitor.authPayload,
        }));
        expect(parseAuthPayloadFields(monitor)).toEqual({
            loginUser: 'user@example.com',
            loginPass: 'secret',
            loginExtra: JSON.stringify({ tenantId: 'tenant-1' }, null, 2),
        });
        expect(parseAuthPayloadFields(baseMonitor({
            authMethod: 'BASIC',
            authPayload: 'admin:pass:with:colons',
        }))).toEqual({
            loginUser: 'admin',
            loginPass: 'pass:with:colons',
            loginExtra: '',
        });
    });

    it('applies monitor type, method, and assertion defaults without UI state', () => {
        const httpForm = baseForm({
            authMethod: 'FORM_LOGIN',
            authUrl: 'https://auth.example.com/login',
            authPayload: '{"username":"admin"}',
            authTokenRegex: '"token":"([^"]+)"',
            bodyAssertionPath: 'data.status',
            bodyAssertionType: 'JSON_PATH_EQUALS',
        });

        expect(applyMonitorTypeDefaults(httpForm, 'TCP')).toEqual(expect.objectContaining({
            type: 'TCP',
            dnsRecordType: 'A',
            expectedBody: '',
            requestBody: '',
            bodyAssertionType: 'NONE',
            authMethod: 'NONE',
            sslExpiryEnabled: false,
        }));
        expect(applyHttpMethod(httpForm, 'GET')).toEqual(expect.objectContaining({
            method: 'GET',
            requestBody: '',
        }));
        expect(applyBodyAssertionType(httpForm, 'NONE')).toEqual(expect.objectContaining({
            bodyAssertionType: 'NONE',
            expectedBody: '',
            bodyAssertionPath: '',
        }));
    });

    it('normalizes submit payloads for HTTP auth and non-HTTP monitors', () => {
        const formLogin = buildMonitorSubmitData({
            formData: baseForm({
                authMethod: 'FORM_LOGIN',
                authUrl: 'https://auth.example.com/login',
                bodyAssertionType: 'JSON_PATH_CONTAINS',
                bodyAssertionPath: 'data.status',
            }),
            loginUser: 'user@example.com',
            loginPass: 'secret',
            loginExtra: '{"tenantId":"tenant-1"}',
        });

        expect(formLogin.ok).toBe(true);
        if (formLogin.ok) {
            expect(formLogin.data.agentId).toBeNull();
            expect(formLogin.data.method).toBe('POST');
            expect(formLogin.data.bodyAssertionPath).toBe('data.status');
            expect(JSON.parse(formLogin.data.authPayload)).toEqual({
                email: 'user@example.com',
                password: 'secret',
                tenantId: 'tenant-1',
            });
        }

        const dnsSubmit = buildMonitorSubmitData({
            formData: baseForm({
                type: 'DNS',
                expectedBody: '203.0.113.10',
                requestBody: '{"ignored":true}',
                headers: '{"ignored":"true"}',
                authMethod: 'BASIC',
            }),
            loginUser: 'admin',
            loginPass: 'secret',
            loginExtra: '',
        });

        expect(dnsSubmit.ok).toBe(true);
        if (dnsSubmit.ok) {
            expect(dnsSubmit.data).toEqual(expect.objectContaining({
                method: 'GET',
                authPayload: '',
                authMethod: 'NONE',
                headers: '',
                expectedBody: '203.0.113.10',
                requestBody: '',
                sslExpiryEnabled: false,
            }));
        }
    });

    it('returns typed validation and API errors for form submission', () => {
        expect(buildMonitorSubmitData({
            formData: baseForm({ authMethod: 'FORM_LOGIN' }),
            loginUser: 'admin',
            loginPass: 'secret',
            loginExtra: '{nope',
        })).toEqual({
            ok: false,
            error: 'Additional JSON Payload must be a valid JSON object',
        });

        expect(getMonitorFormErrorMessage({
            response: { data: { errors: [{ message: 'URL is required' }] } },
            message: 'fallback',
        })).toBe('URL is required');
        expect(getMonitorFormErrorMessage({ response: { data: { error: 'Forbidden' } } })).toBe('Forbidden');
        expect(getMonitorFormErrorMessage('boom')).toBe('Failed to save');
    });
});
