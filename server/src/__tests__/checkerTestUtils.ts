import type { PerformCheckInput } from '../../../packages/checker/src';

export function checkInput(overrides: Partial<PerformCheckInput> = {}): PerformCheckInput {
    return {
        url: 'https://example.com/api',
        method: 'GET',
        timeoutSeconds: 5,
        expectedStatus: 200,
        expectedBody: null,
        headers: null,
        authMethod: 'NONE',
        authUrl: null,
        authPayload: null,
        authTokenRegex: null,
        ...overrides,
    };
}
