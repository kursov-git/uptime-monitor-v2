import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, RotateCcw } from 'lucide-react';

export type TimeRangeValue =
    | string
    | { from: Date; to: Date; label?: string };

interface TimeRangeFilterProps {
    value: TimeRangeValue;
    onChange: (value: TimeRangeValue) => void;
    canResetZoom?: boolean;
    onResetZoom?: () => void;
}

type RangeFieldMode = 'relative' | 'absolute';

const QUICK_RANGES = [
    { value: 'now-15m', label: 'Last 15 minutes' },
    { value: 'now-1h', label: 'Last 1 hour' },
    { value: 'now-3h', label: 'Last 3 hours' },
    { value: 'now-6h', label: 'Last 6 hours' },
    { value: 'now-24h', label: 'Last 24 hours' },
    { value: 'now-7d', label: 'Last 7 days' },
];

const RELATIVE_RANGE_RE = /^now(?:-(\d+)([mhd]))?$/i;

function formatAbsoluteLabel(date: Date): string {
    return date.toISOString().replace('T', ' ').substring(0, 16);
}

function formatShortRangeLabel(from: Date, to: Date): string {
    const sameDay = from.toDateString() === to.toDateString();

    if (sameDay) {
        return `${from.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${from.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${to.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    return `${from.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${from.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${to.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${to.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDateTimeLocal(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

export function parseRelativeTimeExpression(value: string, nowMs: number = Date.now()): Date | null {
    const normalized = value.trim().toLowerCase();
    const match = normalized.match(RELATIVE_RANGE_RE);
    if (!match) return null;

    if (!match[1] || !match[2]) {
        return new Date(nowMs);
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];

    let deltaMs = 0;
    if (unit === 'm') deltaMs = amount * 60 * 1000;
    if (unit === 'h') deltaMs = amount * 60 * 60 * 1000;
    if (unit === 'd') deltaMs = amount * 24 * 60 * 60 * 1000;

    if (!deltaMs) return null;

    return new Date(nowMs - deltaMs);
}

export function parseAbsoluteTimeValue(value: string): Date | null {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

export function resolveTimeInput(mode: RangeFieldMode, value: string, nowMs: number = Date.now()): Date | null {
    if (mode === 'relative') {
        return parseRelativeTimeExpression(value, nowMs);
    }
    return parseAbsoluteTimeValue(value);
}

function getFieldStateFromValue(value: TimeRangeValue): {
    fromMode: RangeFieldMode;
    toMode: RangeFieldMode;
    fromInput: string;
    toInput: string;
} {
    if (typeof value === 'object') {
        return {
            fromMode: 'absolute',
            toMode: 'absolute',
            fromInput: formatDateTimeLocal(value.from),
            toInput: formatDateTimeLocal(value.to),
        };
    }

    return {
        fromMode: 'relative',
        toMode: 'relative',
        fromInput: value,
        toInput: 'now',
    };
}

function getFieldHelp(mode: RangeFieldMode, field: 'from' | 'to'): string {
    if (mode === 'absolute') {
        return 'Exact browser-local date and time.';
    }
    return field === 'from'
        ? 'Examples: now-15m, now-6h, now-7d'
        : 'Examples: now, now-5m, now-1h';
}

export const resolveTimeRangeLabel = (value: TimeRangeValue): string => {
    if (typeof value === 'string') {
        const found = QUICK_RANGES.find((r) => r.value === value);
        return found ? found.label : value;
    }
    if (value.label) return value.label;
    return formatShortRangeLabel(value.from, value.to);
};

export const computeAbsoluteRange = (value: TimeRangeValue): { from: number | null; to: number | null } => {
    if (typeof value === 'object') {
        return { from: value.from.getTime(), to: value.to.getTime() };
    }

    const to = Date.now();
    const fromDate = parseRelativeTimeExpression(value, to);
    if (!fromDate) return { from: null, to: null };

    return { from: fromDate.getTime(), to };
};

export default function TimeRangeFilter({ value, onChange, canResetZoom = false, onResetZoom }: TimeRangeFilterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [fromMode, setFromMode] = useState<RangeFieldMode>('relative');
    const [toMode, setToMode] = useState<RangeFieldMode>('relative');
    const [fromInput, setFromInput] = useState('now-24h');
    const [toInput, setToInput] = useState('now');
    const [validationError, setValidationError] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    useEffect(() => {
        const next = getFieldStateFromValue(value);
        setFromMode(next.fromMode);
        setToMode(next.toMode);
        setFromInput(next.fromInput);
        setToInput(next.toInput);
        setValidationError('');
    }, [value, isOpen]);

    const handleQuickRange = (range: string) => {
        onChange(range);
        setValidationError('');
        setIsOpen(false);
    };

    const applyRange = () => {
        const nowMs = Date.now();
        const fromDate = resolveTimeInput(fromMode, fromInput, nowMs);
        const toDate = resolveTimeInput(toMode, toInput, nowMs);

        if (!fromDate || !toDate) {
            setValidationError('Use a valid relative expression like now-24h or choose an exact date and time.');
            return;
        }

        if (fromDate.getTime() >= toDate.getTime()) {
            setValidationError('From must be earlier than To.');
            return;
        }

        setValidationError('');
        onChange({ from: fromDate, to: toDate });
        setIsOpen(false);
    };

    const displayLabel = resolveTimeRangeLabel(value);

    return (
        <div className="time-range-container" ref={containerRef}>
            <button
                className="time-range-trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                data-testid="time-range-trigger"
            >
                <Clock size={16} className="strok-current" />
                <span>{displayLabel}</span>
            </button>

            {isOpen && (
                <div className="time-range-popover">
                    <div className="time-range-panel">
                        <div className="time-range-section-header">
                            <div>
                                <h3>Custom range</h3>
                                <p>Use relative expressions or exact timestamps. Drag on the chart to zoom instantly.</p>
                            </div>
                            {canResetZoom && onResetZoom && (
                                <button
                                    type="button"
                                    className="time-range-reset"
                                    onClick={() => {
                                        onResetZoom();
                                        setIsOpen(false);
                                    }}
                                >
                                    <RotateCcw size={14} />
                                    Reset zoom
                                </button>
                            )}
                        </div>

                        <div className="time-range-grid">
                            <div className="time-input-group">
                                <div className="time-input-header">
                                    <label htmlFor="time-range-from">From</label>
                                    <div className="time-mode-toggle">
                                        <button
                                            type="button"
                                            className={fromMode === 'relative' ? 'active' : ''}
                                            onClick={() => setFromMode('relative')}
                                        >
                                            Relative
                                        </button>
                                        <button
                                            type="button"
                                            className={fromMode === 'absolute' ? 'active' : ''}
                                            onClick={() => setFromMode('absolute')}
                                        >
                                            Absolute
                                        </button>
                                    </div>
                                </div>
                                <div className="time-input-wrapper">
                                    {fromMode === 'relative' ? <Clock size={14} className="input-icon" /> : <Calendar size={14} className="input-icon" />}
                                    <input
                                        id="time-range-from"
                                        type={fromMode === 'absolute' ? 'datetime-local' : 'text'}
                                        value={fromInput}
                                        onChange={(e) => setFromInput(e.target.value)}
                                        placeholder={fromMode === 'absolute' ? undefined : 'now-24h'}
                                        data-testid="time-range-from-input"
                                    />
                                </div>
                                <div className="time-input-help">{getFieldHelp(fromMode, 'from')}</div>
                            </div>

                            <div className="time-input-group">
                                <div className="time-input-header">
                                    <label htmlFor="time-range-to">To</label>
                                    <div className="time-mode-toggle">
                                        <button
                                            type="button"
                                            className={toMode === 'relative' ? 'active' : ''}
                                            onClick={() => setToMode('relative')}
                                        >
                                            Relative
                                        </button>
                                        <button
                                            type="button"
                                            className={toMode === 'absolute' ? 'active' : ''}
                                            onClick={() => setToMode('absolute')}
                                        >
                                            Absolute
                                        </button>
                                    </div>
                                </div>
                                <div className="time-input-wrapper">
                                    {toMode === 'relative' ? <Clock size={14} className="input-icon" /> : <Calendar size={14} className="input-icon" />}
                                    <input
                                        id="time-range-to"
                                        type={toMode === 'absolute' ? 'datetime-local' : 'text'}
                                        value={toInput}
                                        onChange={(e) => setToInput(e.target.value)}
                                        placeholder={toMode === 'absolute' ? undefined : 'now'}
                                        data-testid="time-range-to-input"
                                    />
                                </div>
                                <div className="time-input-help">{getFieldHelp(toMode, 'to')}</div>
                            </div>
                        </div>

                        {validationError && (
                            <div className="time-range-error" role="alert">
                                {validationError}
                            </div>
                        )}

                        <div className="time-range-presets">
                            {QUICK_RANGES.map((range) => (
                                <button
                                    key={range.value}
                                    type="button"
                                    className={`quick-range-chip ${value === range.value ? 'active' : ''}`}
                                    onClick={() => handleQuickRange(range.value)}
                                >
                                    {range.label}
                                </button>
                            ))}
                        </div>

                        <div className="time-range-bottom">
                            <div className="time-range-hint">
                                Drag across the response-time chart to zoom into an exact window.
                            </div>
                            <div className="time-range-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsOpen(false)}>
                                    Close
                                </button>
                                <button className="btn btn-primary apply-btn" onClick={applyRange} data-testid="time-range-apply">
                                    Apply time range
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
