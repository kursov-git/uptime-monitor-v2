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
});
