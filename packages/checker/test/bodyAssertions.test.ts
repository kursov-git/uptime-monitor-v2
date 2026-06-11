import { describe, expect, it } from 'vitest';
import { evaluateBodyAssertion } from '../src/bodyAssertions';

describe('evaluateBodyAssertion', () => {
    it('passes when no expected body is configured', () => {
        expect(evaluateBodyAssertion('anything', null, null, null)).toBeNull();
    });

    it('supports substring and regex assertions', () => {
        expect(evaluateBodyAssertion('service ready', 'ready', 'CONTAINS', null)).toBeNull();
        expect(evaluateBodyAssertion('service ready', '^service', 'REGEX', null)).toBeNull();
        expect(evaluateBodyAssertion('service ready', '[', 'REGEX', null)).toBe('Invalid regex: [');
    });

    it('supports JSON path equals and contains assertions', () => {
        const body = {
            data: {
                status: 'ready',
                items: [{ name: 'primary-api' }],
            },
        };

        expect(evaluateBodyAssertion(body, 'ready', 'JSON_PATH_EQUALS', 'data.status')).toBeNull();
        expect(evaluateBodyAssertion(body, 'primary', 'JSON_PATH_CONTAINS', 'data.items[0].name')).toBeNull();
    });

    it('returns actionable JSON path errors', () => {
        expect(evaluateBodyAssertion({ ok: true }, 'ready', 'JSON_PATH_EQUALS', null))
            .toBe('JSON path assertion requires a path');
        expect(evaluateBodyAssertion('not-json', 'ready', 'JSON_PATH_EQUALS', 'data.status'))
            .toBe('Response body is not valid JSON for JSON path assertion');
        expect(evaluateBodyAssertion({ data: {} }, 'ready', 'JSON_PATH_EQUALS', 'data.status'))
            .toBe('JSON path not found: data.status');
    });
});
