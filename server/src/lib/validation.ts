export interface ValidationError {
    field: string;
    message: string;
}

export interface CreateMonitorBody {
    name: string;
    url: string;
    method?: string;
    intervalSeconds?: number;
    timeoutSeconds?: number;
    expectedStatus?: number;
    expectedBody?: string;
    headers?: string;
    authMethod?: string;
    authUrl?: string;
    authPayload?: string;
    authTokenRegex?: string;
}

export function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
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
    const errors: ValidationError[] = [];

    if (!body.name || body.name.trim().length === 0) {
        errors.push({ field: 'name', message: 'Name is required' });
    }

    if (!body.url || !isValidUrl(body.url)) {
        errors.push({ field: 'url', message: 'Valid HTTP/HTTPS URL is required' });
    }

    if (body.intervalSeconds !== undefined) {
        if (body.intervalSeconds < 0.1 || body.intervalSeconds > 86400) {
            errors.push({ field: 'intervalSeconds', message: 'Interval must be between 0.1 and 86400 seconds' });
        }
    }

    if (body.timeoutSeconds !== undefined) {
        if (body.timeoutSeconds < 1 || body.timeoutSeconds > 300) {
            errors.push({ field: 'timeoutSeconds', message: 'Timeout must be between 1 and 300 seconds' });
        }
    }

    if (body.expectedStatus !== undefined) {
        if (body.expectedStatus < 100 || body.expectedStatus > 599) {
            errors.push({ field: 'expectedStatus', message: 'Expected status must be between 100 and 599' });
        }
    }

    if (body.headers && !isValidJson(body.headers)) {
        errors.push({ field: 'headers', message: 'Headers must be valid JSON' });
    }

    if (body.authMethod && !['NONE', 'BASIC', 'FORM_LOGIN', 'CSRF_FORM_LOGIN'].includes(body.authMethod)) {
        errors.push({ field: 'authMethod', message: 'Invalid authentication method' });
    }

    if ((body.authMethod === 'FORM_LOGIN' || body.authMethod === 'CSRF_FORM_LOGIN') && (!body.authUrl || !isValidUrl(body.authUrl))) {
        errors.push({ field: 'authUrl', message: 'Valid HTTP/HTTPS login URL is required for form login' });
    }

    if ((body.authMethod === 'FORM_LOGIN' || body.authMethod === 'CSRF_FORM_LOGIN') && !body.authPayload) {
        errors.push({ field: 'authPayload', message: 'Login payload is required for form login' });
    }

    if (body.authMethod === 'BASIC' && !body.authPayload) {
        errors.push({ field: 'authPayload', message: 'Credentials payload is required for BASIC auth' });
    }

    return errors;
}
