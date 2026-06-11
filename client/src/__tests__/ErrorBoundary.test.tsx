/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// A component that intentionally throws an error
const BuggyComponent = () => {
    throw new Error('Test application crash');
    return <div>This will never render</div>;
};

const SafeComponent = () => <div>Safe Content</div>;

describe('ErrorBoundary', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    const suppressExpectedErrorEvent = (event: ErrorEvent) => {
        if (event.error instanceof Error && event.error.message === 'Test application crash') {
            event.preventDefault();
        }
    };

    beforeAll(() => {
        window.addEventListener('error', suppressExpectedErrorEvent);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterAll(() => {
        window.removeEventListener('error', suppressExpectedErrorEvent);
        consoleErrorSpy.mockRestore();
    });

    it('should render children when there is no error', () => {
        render(
            <ErrorBoundary>
                <SafeComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText('Safe Content')).toBeInTheDocument();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('should render the fallback UI when a child throws an error', () => {
        render(
            <ErrorBoundary>
                <BuggyComponent />
            </ErrorBoundary>
        );

        // React Error boundary catches it and displays fallback
        expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
        expect(screen.getByText(/Test application crash/)).toBeInTheDocument();
    });
});
