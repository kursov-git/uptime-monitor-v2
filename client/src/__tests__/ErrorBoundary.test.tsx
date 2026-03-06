/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// A component that intentionally throws an error
const BuggyComponent = () => {
    throw new Error('Test application crash');
    return <div>This will never render</div>;
};

const SafeComponent = () => <div>Safe Content</div>;

describe('ErrorBoundary', () => {
    // Spy on console.error to avoid spamming the test output with React's error logging
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
