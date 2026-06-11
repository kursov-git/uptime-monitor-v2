import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from '../lib/apiErrors';

describe('apiErrors', () => {
    it('prioritizes validation errors, API errors, thrown messages, then fallback text', () => {
        expect(getApiErrorMessage({
            response: {
                data: {
                    errors: [{ message: 'URL is required' }],
                    error: 'API error',
                },
            },
            message: 'Thrown message',
        }, 'Fallback')).toBe('URL is required');

        expect(getApiErrorMessage({
            response: { data: { error: 'API error' } },
            message: 'Thrown message',
        }, 'Fallback')).toBe('API error');

        expect(getApiErrorMessage({ message: 'Thrown message' }, 'Fallback')).toBe('Thrown message');
        expect(getApiErrorMessage('boom', 'Fallback')).toBe('Fallback');
    });
});
