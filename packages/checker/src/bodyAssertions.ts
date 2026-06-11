function getJsonPathValue(input: unknown, path: string): unknown {
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.').map((part) => part.trim()).filter(Boolean);

    let current: unknown = input;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        if (Array.isArray(current) && /^\d+$/.test(part)) {
            current = current[Number.parseInt(part, 10)];
            continue;
        }

        if (typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
            continue;
        }

        return undefined;
    }

    return current;
}

export function evaluateBodyAssertion(
    body: unknown,
    expectedBody: string | null,
    bodyAssertionType: string | null | undefined,
    bodyAssertionPath: string | null | undefined
): string | null {
    const assertionType = bodyAssertionType || (expectedBody ? 'AUTO' : 'NONE');
    if (assertionType === 'NONE' || !expectedBody) {
        return null;
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

    if (assertionType === 'CONTAINS') {
        return bodyStr.includes(expectedBody) ? null : `Body does not contain: ${expectedBody}`;
    }

    if (assertionType === 'REGEX') {
        try {
            const regex = new RegExp(expectedBody);
            return regex.test(bodyStr) ? null : `Body does not match regex: ${expectedBody}`;
        } catch {
            return `Invalid regex: ${expectedBody}`;
        }
    }

    if (assertionType === 'JSON_PATH_EQUALS' || assertionType === 'JSON_PATH_CONTAINS') {
        const path = bodyAssertionPath?.trim();
        if (!path) {
            return 'JSON path assertion requires a path';
        }

        if (typeof body !== 'object' || body === null) {
            return 'Response body is not valid JSON for JSON path assertion';
        }

        const value = getJsonPathValue(body, path);
        if (value === undefined) {
            return `JSON path not found: ${path}`;
        }

        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        if (assertionType === 'JSON_PATH_EQUALS') {
            return valueStr === expectedBody ? null : `JSON path ${path} expected ${expectedBody}, got ${valueStr}`;
        }

        return valueStr.includes(expectedBody) ? null : `JSON path ${path} does not contain: ${expectedBody}`;
    }

    try {
        const regex = new RegExp(expectedBody);
        return regex.test(bodyStr) ? null : `Body does not match pattern: ${expectedBody}`;
    } catch {
        return bodyStr.includes(expectedBody) ? null : `Body does not contain: ${expectedBody}`;
    }
}
