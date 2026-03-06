import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error in React tree:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--bg-color)',
                    padding: '20px'
                }}>
                    <div className="card" style={{ maxWidth: 500, textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>💥</div>
                        <h1 style={{ marginBottom: 16 }}>Something went wrong.</h1>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
                            An unexpected error occurred in the application. The engineering team has been notified.
                        </p>
                        {this.state.error && (
                            <div style={{
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                padding: '12px',
                                borderRadius: '8px',
                                marginBottom: '24px',
                                textAlign: 'left',
                                fontSize: '0.85rem',
                                overflowX: 'auto'
                            }}>
                                <code>{this.state.error.message}</code>
                            </div>
                        )}
                        <button className="btn btn-primary" onClick={this.handleReload}>
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
