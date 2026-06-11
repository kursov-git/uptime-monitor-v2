interface ApiErrorLike {
    message?: unknown;
    response?: {
        data?: {
            error?: unknown;
            errors?: Array<{ message?: unknown }>;
        };
    };
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object') {
        const maybeError = error as ApiErrorLike;
        const firstValidationError = maybeError.response?.data?.errors?.[0]?.message;

        if (typeof firstValidationError === 'string') return firstValidationError;
        if (typeof maybeError.response?.data?.error === 'string') return maybeError.response.data.error;
        if (typeof maybeError.message === 'string') return maybeError.message;
    }

    return fallback;
}
