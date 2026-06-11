import type { Monitor, MonitorFormData } from '../api';
import { getApiErrorMessage } from './apiErrors';

export interface AuthPayloadFields {
    loginUser: string;
    loginPass: string;
    loginExtra: string;
}

export type MonitorSubmitResult =
    | { ok: true; data: MonitorFormData }
    | { ok: false; error: string };

export interface MonitorFormMode {
    isHttpMonitor: boolean;
    isDnsMonitor: boolean;
    isTcpMonitor: boolean;
    currentHttpMethod: string;
    showRequestBody: boolean;
}

export function buildInitialMonitorFormData(monitor?: Monitor): MonitorFormData {
    const monitorType = monitor?.type || 'HTTP';

    return {
        name: monitor?.name || '',
        serviceName: monitor?.serviceName || '',
        type: monitorType,
        url: monitor?.url || '',
        dnsRecordType: monitor?.dnsRecordType || 'A',
        agentId: monitor?.agentId || '',
        method: monitor?.method || 'GET',
        intervalSeconds: monitor?.intervalSeconds || 60,
        timeoutSeconds: monitor?.timeoutSeconds || 30,
        expectedStatus: monitor?.expectedStatus || 200,
        expectedBody: monitor?.expectedBody || '',
        requestBody: monitor?.requestBody || '',
        bodyAssertionType: monitor?.bodyAssertionType || (monitor?.expectedBody ? 'AUTO' : 'NONE'),
        bodyAssertionPath: monitor?.bodyAssertionPath || '',
        headers: monitor?.headers || '',
        authMethod: monitor?.authMethod || 'NONE',
        authUrl: monitor?.authUrl || '',
        authPayload: monitor?.authPayload || '',
        authTokenRegex: monitor?.authTokenRegex || '',
        sslExpiryEnabled: monitor?.sslExpiryEnabled || false,
        sslExpiryThresholdDays: monitor?.sslExpiryThresholdDays || 14,
    };
}

export function parseAuthPayloadFields(monitor?: Monitor): AuthPayloadFields {
    if (!monitor?.authPayload) {
        return { loginUser: '', loginPass: '', loginExtra: '' };
    }

    if (monitor.authMethod === 'BASIC') {
        const parts = monitor.authPayload.split(':');
        return {
            loginUser: parts[0] || '',
            loginPass: parts.slice(1).join(':') || '',
            loginExtra: '',
        };
    }

    try {
        const payload = JSON.parse(monitor.authPayload) as Record<string, unknown>;
        const rest = { ...payload };
        delete rest.username;
        delete rest.email;
        delete rest.login;
        delete rest.password;

        return {
            loginUser: String(payload.username || payload.email || payload.login || ''),
            loginPass: String(payload.password || ''),
            loginExtra: Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '',
        };
    } catch {
        return { loginUser: '', loginPass: '', loginExtra: '' };
    }
}

export function getTargetLabel(type: MonitorFormData['type']): string {
    if (type === 'TCP') return 'TCP Target';
    if (type === 'DNS') return 'DNS Target';
    return 'URL';
}

export function getTargetPlaceholder(type: MonitorFormData['type']): string {
    if (type === 'TCP') return 'tcp://db.example.com:5432';
    if (type === 'DNS') return 'dns://example.com';
    return 'https://example.com';
}

export function getTargetHelpText(type: MonitorFormData['type']): string {
    if (type === 'TCP') return 'Use tcp://host:port to verify that a TCP socket accepts connections.';
    if (type === 'DNS') return 'Use dns://hostname to resolve a DNS record from the assigned executor.';
    return 'Use a full HTTP or HTTPS URL.';
}

export function getMonitorFormMode(formData: MonitorFormData): MonitorFormMode {
    const isHttpMonitor = formData.type === 'HTTP';
    const isDnsMonitor = formData.type === 'DNS';
    const isTcpMonitor = formData.type === 'TCP';
    const currentHttpMethod = String(formData.method || 'GET').toUpperCase();

    return {
        isHttpMonitor,
        isDnsMonitor,
        isTcpMonitor,
        currentHttpMethod,
        showRequestBody: isHttpMonitor && !['GET', 'HEAD'].includes(currentHttpMethod),
    };
}

export function applyMonitorTypeDefaults(
    previous: MonitorFormData,
    nextType: MonitorFormData['type'],
): MonitorFormData {
    if (nextType === 'TCP') {
        return {
            ...previous,
            type: nextType,
            dnsRecordType: 'A',
            method: 'GET',
            expectedStatus: 200,
            expectedBody: '',
            requestBody: '',
            bodyAssertionType: 'NONE',
            bodyAssertionPath: '',
            headers: '',
            authMethod: 'NONE',
            authUrl: '',
            authPayload: '',
            authTokenRegex: '',
            sslExpiryEnabled: false,
            sslExpiryThresholdDays: 14,
        };
    }

    if (nextType === 'DNS') {
        return {
            ...previous,
            type: nextType,
            method: 'GET',
            expectedStatus: 200,
            requestBody: '',
            bodyAssertionType: 'NONE',
            bodyAssertionPath: '',
            headers: '',
            authMethod: 'NONE',
            authUrl: '',
            authPayload: '',
            authTokenRegex: '',
            sslExpiryEnabled: false,
            sslExpiryThresholdDays: 14,
        };
    }

    return {
        ...previous,
        type: nextType,
        method: previous.method || 'GET',
    };
}

export function applyHttpMethod(previous: MonitorFormData, nextMethod: string): MonitorFormData {
    return {
        ...previous,
        method: nextMethod,
        requestBody: ['GET', 'HEAD'].includes(nextMethod) ? '' : previous.requestBody,
    };
}

export function applyBodyAssertionType(
    previous: MonitorFormData,
    nextType: MonitorFormData['bodyAssertionType'],
): MonitorFormData {
    return {
        ...previous,
        bodyAssertionType: nextType,
        expectedBody: nextType === 'NONE' ? '' : previous.expectedBody,
        bodyAssertionPath: nextType === 'JSON_PATH_EQUALS' || nextType === 'JSON_PATH_CONTAINS'
            ? previous.bodyAssertionPath
            : '',
    };
}

export function getAssertionHelpText(assertionType: MonitorFormData['bodyAssertionType']): string {
    if (assertionType === 'AUTO') {
        return 'Backward-compatible mode: tries regex first, then falls back to substring matching.';
    }
    if (assertionType === 'CONTAINS') {
        return 'Marks the check down if the response body does not contain the provided text.';
    }
    if (assertionType === 'REGEX') {
        return 'Marks the check down if the response body does not match the provided regular expression.';
    }
    if (assertionType === 'JSON_PATH_EQUALS') {
        return 'Parses the response as JSON and compares the selected path to the expected value.';
    }
    if (assertionType === 'JSON_PATH_CONTAINS') {
        return 'Parses the response as JSON and checks whether the selected path contains the expected fragment.';
    }

    return '';
}

export function buildMonitorSubmitData({
    formData,
    loginUser,
    loginPass,
    loginExtra,
}: {
    formData: MonitorFormData;
    loginUser: string;
    loginPass: string;
    loginExtra: string;
}): MonitorSubmitResult {
    const { isHttpMonitor, isDnsMonitor, currentHttpMethod, showRequestBody } = getMonitorFormMode(formData);

    let constructedPayload = formData.authPayload;
    if (formData.authMethod === 'BASIC') {
        constructedPayload = `${loginUser}:${loginPass}`;
    } else if (formData.authMethod === 'FORM_LOGIN' || formData.authMethod === 'CSRF_FORM_LOGIN') {
        let extraFields: Record<string, unknown> = {};
        if (loginExtra.trim() !== '') {
            try {
                extraFields = JSON.parse(loginExtra) as Record<string, unknown>;
            } catch {
                return { ok: false, error: 'Additional JSON Payload must be a valid JSON object' };
            }
        }
        const loginKey = loginUser.includes('@') ? 'email' : 'username';
        constructedPayload = JSON.stringify({
            [loginKey]: loginUser,
            password: loginPass,
            ...extraFields,
        });
    }

    const normalizedAssertionType = isHttpMonitor ? (formData.bodyAssertionType || 'NONE') : 'NONE';
    const normalizedExpectedBody = isHttpMonitor
        ? (normalizedAssertionType === 'NONE' ? '' : formData.expectedBody)
        : isDnsMonitor
            ? formData.expectedBody
            : '';
    const normalizedRequestBody = showRequestBody ? formData.requestBody : '';
    const normalizedAssertionPath = (
        isHttpMonitor && (normalizedAssertionType === 'JSON_PATH_EQUALS' || normalizedAssertionType === 'JSON_PATH_CONTAINS')
    )
        ? formData.bodyAssertionPath
        : '';

    return {
        ok: true,
        data: {
            ...formData,
            agentId: formData.agentId || null,
            method: isHttpMonitor ? currentHttpMethod : 'GET',
            authPayload: isHttpMonitor ? constructedPayload : '',
            bodyAssertionType: normalizedAssertionType,
            expectedBody: normalizedExpectedBody,
            requestBody: normalizedRequestBody,
            bodyAssertionPath: normalizedAssertionPath,
            headers: isHttpMonitor ? formData.headers : '',
            authMethod: isHttpMonitor ? formData.authMethod : 'NONE',
            authUrl: isHttpMonitor ? formData.authUrl : '',
            authTokenRegex: isHttpMonitor ? formData.authTokenRegex : '',
            sslExpiryEnabled: isHttpMonitor ? formData.sslExpiryEnabled : false,
            sslExpiryThresholdDays: isHttpMonitor ? formData.sslExpiryThresholdDays : 14,
        },
    };
}

export function getMonitorFormErrorMessage(error: unknown): string {
    return getApiErrorMessage(error, 'Failed to save');
}
