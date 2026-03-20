import { getBlockedTargetReasonFromUrl } from './networkGuards';

export interface ValidationError {
    field: string;
    message: string;
}

export interface CreateMonitorBody {
    name: string;
    serviceName?: string;
    type?: string;
    url: string;
    dnsRecordType?: string;
    agentId?: string | null;
    method?: string;
    intervalSeconds?: number;
    timeoutSeconds?: number;
    expectedStatus?: number;
    expectedBody?: string;
    requestBody?: string;
    bodyAssertionType?: string;
    bodyAssertionPath?: string;
    headers?: string;
    authMethod?: string;
    authUrl?: string;
    authPayload?: string;
    authTokenRegex?: string;
    sslExpiryEnabled?: boolean;
    sslExpiryThresholdDays?: number;
}

export function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function isValidTcpTarget(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'tcp:') {
            return false;
        }

        const port = Number.parseInt(parsed.port, 10);
        return Boolean(parsed.hostname) && Number.isInteger(port) && port >= 1 && port <= 65535;
    } catch {
        return false;
    }
}

function isValidDnsTarget(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'dns:' && Boolean(parsed.hostname);
    } catch {
        return false;
    }
}

export function isValidJson(str: string | undefined | null): boolean {
    if (!str) return true; // undefined/null is OK (optional field)
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

export function validateMonitorInput(body: CreateMonitorBody): ValidationError[] {
    return validateMonitorInputWithOptions(body, {});
}

export function validateMonitorInputWithOptions(
    body: CreateMonitorBody,
    options: { allowPrivateTargets?: boolean }
): ValidationError[] {
    const errors: ValidationError[] = [];
    const monitorType = String(body.type || 'HTTP').toUpperCase();
    const allowedMonitorTypes = ['HTTP', 'TCP', 'DNS'];
    const allowedDnsRecordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'];

    if (!body.name || body.name.trim().length === 0) {
        errors.push({ field: 'name', message: 'Name is required' });
    }

    if (body.serviceName !== undefined) {
        if (typeof body.serviceName !== 'string') {
            errors.push({ field: 'serviceName', message: 'Service name must be a string' });
        } else if (body.serviceName.trim().length > 80) {
            errors.push({ field: 'serviceName', message: 'Service name must be 80 characters or fewer' });
        }
    }

    if (!allowedMonitorTypes.includes(monitorType)) {
        errors.push({ field: 'type', message: 'Invalid monitor type' });
    }

    const hasValidTarget = monitorType === 'HTTP'
        ? isValidUrl(body.url)
        : monitorType === 'TCP'
            ? isValidTcpTarget(body.url)
            : isValidDnsTarget(body.url);

    if (!body.url || !hasValidTarget) {
        const message = monitorType === 'TCP'
            ? 'Valid TCP target is required (tcp://host:port)'
            : monitorType === 'DNS'
                ? 'Valid DNS target is required (dns://hostname)'
                : 'Valid HTTP/HTTPS URL is required';
        errors.push({ field: 'url', message });
    } else {
        const blockedReason = getBlockedTargetReasonFromUrl(body.url, {
            allowPrivateTargets: options.allowPrivateTargets,
        });
        if (blockedReason) {
            errors.push({ field: 'url', message: `Target URL is not allowed: ${blockedReason}` });
        }
    }

    if (body.dnsRecordType !== undefined && !allowedDnsRecordTypes.includes(String(body.dnsRecordType).toUpperCase())) {
        errors.push({ field: 'dnsRecordType', message: 'Invalid DNS record type' });
    }

    if (body.intervalSeconds !== undefined) {
        if (body.intervalSeconds < 0.1 || body.intervalSeconds > 86400) {
            errors.push({ field: 'intervalSeconds', message: 'Interval must be between 0.1 and 86400 seconds' });
        }
    }

    if (body.agentId !== undefined && body.agentId !== null) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(body.agentId)) {
            errors.push({ field: 'agentId', message: 'agentId must be a valid UUID' });
        }
    }

    if (body.timeoutSeconds !== undefined) {
        if (body.timeoutSeconds < 1 || body.timeoutSeconds > 300) {
            errors.push({ field: 'timeoutSeconds', message: 'Timeout must be between 1 and 300 seconds' });
        }
    }

    if (monitorType === 'HTTP' && body.expectedStatus !== undefined) {
        if (body.expectedStatus < 100 || body.expectedStatus > 599) {
            errors.push({ field: 'expectedStatus', message: 'Expected status must be between 100 and 599' });
        }
    }

    if (body.requestBody !== undefined && typeof body.requestBody !== 'string') {
        errors.push({ field: 'requestBody', message: 'Request body must be a string' });
    }

    if (body.sslExpiryThresholdDays !== undefined) {
        if (!Number.isInteger(body.sslExpiryThresholdDays) || body.sslExpiryThresholdDays < 1 || body.sslExpiryThresholdDays > 365) {
            errors.push({ field: 'sslExpiryThresholdDays', message: 'SSL expiry threshold must be an integer between 1 and 365 days' });
        }
    }

    if (body.sslExpiryEnabled && monitorType === 'HTTP') {
        try {
            const parsed = new URL(body.url);
            if (parsed.protocol !== 'https:') {
                errors.push({ field: 'sslExpiryEnabled', message: 'SSL expiry monitoring requires an HTTPS URL' });
            }
        } catch {
            // URL validity is handled above.
        }
    }

    if (monitorType === 'HTTP' && body.bodyAssertionType !== undefined) {
        const allowedAssertionTypes = ['NONE', 'AUTO', 'CONTAINS', 'REGEX', 'JSON_PATH_EQUALS', 'JSON_PATH_CONTAINS'];
        if (!allowedAssertionTypes.includes(body.bodyAssertionType)) {
            errors.push({ field: 'bodyAssertionType', message: 'Invalid body assertion type' });
        }
    }

    const assertionType = body.bodyAssertionType || 'AUTO';
    const hasExpectedBody = typeof body.expectedBody === 'string' && body.expectedBody.trim().length > 0;
    const hasAssertionPath = typeof body.bodyAssertionPath === 'string' && body.bodyAssertionPath.trim().length > 0;

    if (monitorType === 'HTTP' && assertionType === 'NONE') {
        if (hasAssertionPath) {
            errors.push({ field: 'bodyAssertionPath', message: 'Assertion path is only used for JSON path assertions' });
        }
    }

    if (monitorType === 'HTTP' && (assertionType === 'CONTAINS' || assertionType === 'REGEX' || assertionType === 'JSON_PATH_EQUALS' || assertionType === 'JSON_PATH_CONTAINS') && !hasExpectedBody) {
        errors.push({ field: 'expectedBody', message: 'Assertion value is required for the selected body assertion type' });
    }

    if (monitorType === 'HTTP' && (assertionType === 'JSON_PATH_EQUALS' || assertionType === 'JSON_PATH_CONTAINS') && !hasAssertionPath) {
        errors.push({ field: 'bodyAssertionPath', message: 'JSON path is required for the selected body assertion type' });
    }

    if (monitorType === 'HTTP' && (assertionType === 'CONTAINS' || assertionType === 'REGEX' || assertionType === 'AUTO') && hasAssertionPath) {
        errors.push({ field: 'bodyAssertionPath', message: 'Assertion path is only used for JSON path assertions' });
    }

    if (monitorType === 'HTTP' && body.headers && !isValidJson(body.headers)) {
        errors.push({ field: 'headers', message: 'Headers must be valid JSON' });
    }

    if (monitorType === 'HTTP' && body.headers && body.requestBody && isValidJson(body.headers)) {
        try {
            const parsedHeaders = JSON.parse(body.headers) as Record<string, string>;
            const contentType = Object.entries(parsedHeaders).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
            if (contentType && contentType.toLowerCase().includes('application/json') && !isValidJson(body.requestBody)) {
                errors.push({ field: 'requestBody', message: 'Request body must be valid JSON when Content-Type is application/json' });
            }
        } catch {
            // Header JSON validity is handled above.
        }
    }

    if (monitorType === 'HTTP' && body.authMethod && !['NONE', 'BASIC', 'FORM_LOGIN', 'CSRF_FORM_LOGIN'].includes(body.authMethod)) {
        errors.push({ field: 'authMethod', message: 'Invalid authentication method' });
    }

    if (monitorType === 'HTTP' && (body.authMethod === 'FORM_LOGIN' || body.authMethod === 'CSRF_FORM_LOGIN') && (!body.authUrl || !isValidUrl(body.authUrl))) {
        errors.push({ field: 'authUrl', message: 'Valid HTTP/HTTPS login URL is required for form login' });
    }

    if (monitorType === 'HTTP' && (body.authMethod === 'FORM_LOGIN' || body.authMethod === 'CSRF_FORM_LOGIN') && body.authUrl && isValidUrl(body.authUrl)) {
        const blockedReason = getBlockedTargetReasonFromUrl(body.authUrl, {
            allowPrivateTargets: options.allowPrivateTargets,
        });
        if (blockedReason) {
            errors.push({ field: 'authUrl', message: `Auth URL is not allowed: ${blockedReason}` });
        }
    }

    if (monitorType === 'HTTP' && (body.authMethod === 'FORM_LOGIN' || body.authMethod === 'CSRF_FORM_LOGIN') && !body.authPayload) {
        errors.push({ field: 'authPayload', message: 'Login payload is required for form login' });
    }

    if (monitorType === 'HTTP' && body.authMethod === 'BASIC' && !body.authPayload) {
        errors.push({ field: 'authPayload', message: 'Credentials payload is required for BASIC auth' });
    }

    return errors;
}
