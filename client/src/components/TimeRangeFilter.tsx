import React, { useState, useEffect, useRef } from 'react';
import { Clock, Calendar, Search, Copy, Check } from 'lucide-react';

export type TimeRangeValue =
    | string // quick range like 'now-5m'
    | { from: Date; to: Date; label?: string }; // absolute range

interface TimeRangeFilterProps {
    value: TimeRangeValue;
    onChange: (value: TimeRangeValue) => void;
}

const QUICK_RANGES = [
    { value: 'now-5m', label: 'Last 5 minutes' },
    { value: 'now-15m', label: 'Last 15 minutes' },
    { value: 'now-30m', label: 'Last 30 minutes' },
    { value: 'now-1h', label: 'Last 1 hour' },
    { value: 'now-3h', label: 'Last 3 hours' },
    { value: 'now-6h', label: 'Last 6 hours' },
    { value: 'now-12h', label: 'Last 12 hours' },
    { value: 'now-24h', label: 'Last 24 hours' },
    { value: 'now-2d', label: 'Last 2 days' },
    { value: 'now-7d', label: 'Last 7 days' }
];

// Helper to resolve range string to label
export const resolveTimeRangeLabel = (value: TimeRangeValue): string => {
    if (typeof value === 'string') {
        const found = QUICK_RANGES.find(r => r.value === value);
        return found ? found.label : value;
    }
    if (value.label) return value.label;

    const formatDate = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 16);
    return `${formatDate(value.from)} to ${formatDate(value.to)}`;
};

export const computeAbsoluteRange = (value: TimeRangeValue): { from: number | null, to: number | null } => {
    if (typeof value === 'object') {
        return { from: value.from.getTime(), to: value.to.getTime() };
    }

    const to = new Date().getTime();
    const match = value.match(/^now-(\d+)([mhd])$/);
    if (!match) return { from: null, to: null };

    const amount = parseInt(match[1], 10);
    const unit = match[2];

    let ms = 0;
    if (unit === 'm') ms = amount * 60 * 1000;
    else if (unit === 'h') ms = amount * 60 * 60 * 1000;
    else if (unit === 'd') ms = amount * 24 * 60 * 60 * 1000;

    return { from: to - ms, to };
};

export default function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Local state for the absolute range inputs
    const [absFrom, setAbsFrom] = useState('');
    const [absTo, setAbsTo] = useState('now');

    const containerRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

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

    const handleQuickRange = (range: string) => {
        onChange(range);
        setIsOpen(false);
    };

    const applyAbsoluteRange = () => {
        try {
            // Very basic parsing for demo purposes - assuming 'YYYY-MM-DDTHH:mm'
            // Grafana supports "now" or "now-5m" in these fields too, but we'll stick to dates or "now"
            let toDate = new Date();
            if (absTo !== 'now') {
                toDate = new Date(absTo);
            }

            const fromDate = new Date(absFrom);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                onChange({ from: fromDate, to: toDate });
                setIsOpen(false);
            } else {
                alert("Invalid date format. Please use the date picker.");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const filteredRanges = QUICK_RANGES.filter(r =>
        r.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayLabel = resolveTimeRangeLabel(value);

    // Prefill the 'from' value based on existing selection if it's absolute
    useEffect(() => {
        if (typeof value === 'object') {
            // local ISO string roughly
            const offsetFrom = new Date(value.from.getTime() - value.from.getTimezoneOffset() * 60000);
            setAbsFrom(offsetFrom.toISOString().slice(0, 16));

            const offsetTo = new Date(value.to.getTime() - value.to.getTimezoneOffset() * 60000);
            setAbsTo(offsetTo.toISOString().slice(0, 16));
        } else {
            setAbsTo('now');
            setAbsFrom(value);
        }
    }, [value, isOpen]);

    const copyUrl = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="time-range-container" ref={containerRef}>
            <button
                className="time-range-trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <Clock size={16} className="strok-current" />
                <span>{displayLabel}</span>
            </button>

            {isOpen && (
                <div className="time-range-popover">
                    <div className="time-range-layout">

                        {/* Left Col: Absolute Ranges */}
                        <div className="time-range-absolute">
                            <h3>Absolute time range</h3>

                            <div className="time-input-group">
                                <label>From</label>
                                <div className="time-input-wrapper">
                                    <input
                                        type={absFrom.startsWith('now') ? 'text' : 'datetime-local'}
                                        value={absFrom}
                                        onChange={e => setAbsFrom(e.target.value)}
                                    />
                                    {!absFrom.startsWith('now') && <Calendar size={14} className="input-icon" />}
                                </div>
                            </div>

                            <div className="time-input-group">
                                <label>To</label>
                                <div className="time-input-wrapper">
                                    <input
                                        type={absTo === 'now' ? 'text' : 'datetime-local'}
                                        value={absTo}
                                        onChange={e => setAbsTo(e.target.value)}
                                    />
                                    {absTo !== 'now' && <Calendar size={14} className="input-icon" />}
                                </div>
                            </div>

                            <div className="time-range-actions">
                                <button className="icon-btn" onClick={copyUrl} title="Copy link to clipboard">
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                                <button className="btn btn-primary apply-btn" onClick={applyAbsoluteRange}>
                                    Apply time range
                                </button>
                            </div>

                            <div className="time-range-hint">
                                <p>
                                    Set a custom absolute time range to analyze a specific window.
                                </p>
                            </div>
                        </div>

                        {/* Right Col: Quick Ranges */}
                        <div className="time-range-quick">
                            <div className="time-range-search">
                                <Search size={14} />
                                <input
                                    type="text"
                                    placeholder="Search quick ranges"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <div className="quick-ranges-list">
                                {filteredRanges.map(range => (
                                    <button
                                        key={range.value}
                                        className={`quick-range-item ${value === range.value ? 'active' : ''}`}
                                        onClick={() => handleQuickRange(range.value)}
                                    >
                                        {range.label}
                                    </button>
                                ))}
                                {filteredRanges.length === 0 && (
                                    <div className="quick-range-empty">No matching ranges</div>
                                )}
                            </div>
                        </div>

                    </div>

                    <div className="time-range-footer">
                        <span className="browser-time">
                            <strong>Browser Time</strong> {new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).format(new Date())}
                        </span>
                        <span className="utc-offset">
                            UTC{new Date().getTimezoneOffset() < 0 ? '+' : '-'}{Math.abs(new Date().getTimezoneOffset() / 60).toString().padStart(2, '0')}:00
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
