/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MonitorForm from '../components/MonitorForm';
import { agentsApi } from '../api';

describe('MonitorForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(agentsApi, 'get').mockResolvedValue({ data: [] } as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the modal open when clicking the overlay outside the form', async () => {
        const onCancel = vi.fn();

        render(
            <MonitorForm
                onSubmit={vi.fn().mockResolvedValue(undefined)}
                onCancel={onCancel}
            />
        );

        await waitFor(() => {
            expect(agentsApi.get).toHaveBeenCalledWith('/');
        });

        const nameInput = screen.getByPlaceholderText('My Website');
        fireEvent.change(nameInput, { target: { value: 'Auth monitor' } });

        fireEvent.click(screen.getByTestId('monitor-form-overlay'));

        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByPlaceholderText('My Website')).toHaveValue('Auth monitor');
        expect(screen.getByTestId('monitor-form-modal')).toBeInTheDocument();
    });

    it('shows request body only for methods that support payloads and clears it for GET/HEAD', async () => {
        render(
            <MonitorForm
                onSubmit={vi.fn().mockResolvedValue(undefined)}
                onCancel={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(agentsApi.get).toHaveBeenCalledWith('/');
        });

        expect(screen.queryByPlaceholderText('{"type":"event"} or key=value')).not.toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('GET'), { target: { value: 'POST' } });

        const requestBody = screen.getByPlaceholderText('{"type":"event"} or key=value');
        fireEvent.change(requestBody, { target: { value: '{"beep":"boop"}' } });
        expect(requestBody).toHaveValue('{"beep":"boop"}');

        fireEvent.change(screen.getByDisplayValue('POST'), { target: { value: 'GET' } });
        expect(screen.queryByPlaceholderText('{"type":"event"} or key=value')).not.toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('GET'), { target: { value: 'POST' } });
        expect(screen.getByPlaceholderText('{"type":"event"} or key=value')).toHaveValue('');
    });

    it('switches to DNS fields without HTTP-specific controls', async () => {
        render(
            <MonitorForm
                onSubmit={vi.fn().mockResolvedValue(undefined)}
                onCancel={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(agentsApi.get).toHaveBeenCalledWith('/');
        });

        fireEvent.change(screen.getByDisplayValue('HTTP / HTTPS'), { target: { value: 'DNS' } });

        expect(screen.getByPlaceholderText('dns://example.com')).toBeInTheDocument();
        expect(screen.getByDisplayValue('A')).toBeInTheDocument();
        expect(screen.getByText('Expected Answer Contains')).toBeInTheDocument();
        expect(screen.queryByText('Expected Status')).not.toBeInTheDocument();
        expect(screen.queryByText('Method')).not.toBeInTheDocument();
        expect(screen.queryByText('Monitor SSL certificate expiry')).not.toBeInTheDocument();
    });

    it('submits optional service name as part of monitor payload', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        render(
            <MonitorForm
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(agentsApi.get).toHaveBeenCalledWith('/');
        });

        fireEvent.change(screen.getByPlaceholderText('My Website'), { target: { value: 'Homepage' } });
        fireEvent.change(screen.getByPlaceholderText('Auth API'), { target: { value: 'Customer Portal' } });
        fireEvent.change(screen.getByPlaceholderText('https://example.com'), { target: { value: 'https://example.com/health' } });
        fireEvent.click(screen.getByTestId('monitor-form-submit'));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Homepage',
                serviceName: 'Customer Portal',
            }));
        });
    });
});
