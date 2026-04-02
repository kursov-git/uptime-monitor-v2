/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TimeRangeFilter, {
    parseRelativeTimeExpression,
    parseAbsoluteTimeValue,
    resolveTimeInput,
} from '../components/TimeRangeFilter';

describe('TimeRangeFilter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-02T17:30:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('parses relative expressions for both now and now-offset values', () => {
        expect(parseRelativeTimeExpression('now')?.toISOString()).toBe('2026-04-02T17:30:00.000Z');
        expect(parseRelativeTimeExpression('now-24h')?.toISOString()).toBe('2026-04-01T17:30:00.000Z');
        expect(parseRelativeTimeExpression('now-15m')?.toISOString()).toBe('2026-04-02T17:15:00.000Z');
    });

    it('resolves absolute datetime-local input values', () => {
        expect(parseAbsoluteTimeValue('2026-04-02T20:15')?.getTime()).toBe(new Date('2026-04-02T20:15').getTime());
        expect(resolveTimeInput('absolute', '2026-04-02T20:15')?.getTime()).toBe(new Date('2026-04-02T20:15').getTime());
    });

    it('applies custom relative range values in both fields', () => {
        const onChange = vi.fn();

        render(
            <TimeRangeFilter
                value="now-24h"
                onChange={onChange}
            />
        );

        fireEvent.click(screen.getByTestId('time-range-trigger'));

        const toRelativeButton = screen.getAllByRole('button', { name: 'Relative' })[1];
        fireEvent.click(toRelativeButton);
        fireEvent.change(screen.getByTestId('time-range-from-input'), { target: { value: 'now-24h' } });
        fireEvent.change(screen.getByTestId('time-range-to-input'), { target: { value: 'now-1h' } });
        fireEvent.click(screen.getByTestId('time-range-apply'));

        expect(onChange).toHaveBeenCalledWith({
            from: new Date('2026-04-01T17:30:00.000Z'),
            to: new Date('2026-04-02T16:30:00.000Z'),
        });
    });

    it('shows reset control for zoomed absolute ranges', () => {
        const onResetZoom = vi.fn();

        render(
            <TimeRangeFilter
                value={{
                    from: new Date('2026-04-02T16:00:00.000Z'),
                    to: new Date('2026-04-02T17:00:00.000Z'),
                    label: 'Zoomed range',
                }}
                onChange={vi.fn()}
                canResetZoom
                onResetZoom={onResetZoom}
            />
        );

        fireEvent.click(screen.getByTestId('time-range-trigger'));
        fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));

        expect(onResetZoom).toHaveBeenCalledTimes(1);
    });

});
