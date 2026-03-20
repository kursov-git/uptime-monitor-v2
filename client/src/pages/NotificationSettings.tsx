import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api';

interface Settings {
    id: string;
    appBaseUrl: string | null;
    telegramEnabled: boolean;
    telegramBotToken: string | null;
    telegramChatId: string | null;
    zulipEnabled: boolean;
    zulipBotEmail: string | null;
    zulipApiKey: string | null;
    zulipServerUrl: string | null;
    zulipStream: string | null;
    zulipTopic: string | null;
    flappingFailCount: number;
    flappingIntervalSec: number;
    retentionDays: number;
}

export default function NotificationSettings() {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<Settings | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [testingTelegram, setTestingTelegram] = useState(false);
    const [testingZulip, setTestingZulip] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await notificationsApi.get('/settings');
            setSettings(res.data);
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        setMessage('');

        try {
            await notificationsApi.put('/settings', settings);
            setMessage('Settings saved');
            setTimeout(() => setMessage(''), 3000);
        } catch {
            setMessage('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const testTelegram = async () => {
        if (!settings?.telegramBotToken || !settings?.telegramChatId) return;
        setTestingTelegram(true);
        try {
            const res = await notificationsApi.post('/test/telegram', {
                botToken: settings.telegramBotToken,
                chatId: settings.telegramChatId,
            });
            alert(res.data.success ? 'Test message sent' : 'Failed to send');
        } catch {
            alert('Failed to send test message');
        } finally {
            setTestingTelegram(false);
        }
    };

    const testZulip = async () => {
        if (!settings?.zulipBotEmail || !settings?.zulipApiKey || !settings?.zulipServerUrl) return;
        setTestingZulip(true);
        try {
            const res = await notificationsApi.post('/test/zulip', {
                botEmail: settings.zulipBotEmail,
                apiKey: settings.zulipApiKey,
                serverUrl: settings.zulipServerUrl,
                stream: settings.zulipStream,
                topic: settings.zulipTopic,
            });
            alert(res.data.success ? 'Test message sent' : 'Failed to send');
        } catch {
            alert('Failed to send test message');
        } finally {
            setTestingZulip(false);
        }
    };

    const update = (field: keyof Settings, value: any) => {
        setSettings(prev => prev ? { ...prev, [field]: value } : prev);
    };

    if (!settings) {
        return (
            <div className="app-container page-container">
                <div className="empty-state" style={{ padding: 40 }}>
                    Loading...
                </div>
            </div>
        );
    }

    const summaryCards = [
        {
            label: 'Telegram',
            value: settings.telegramEnabled ? 'Enabled' : 'Disabled',
            tone: settings.telegramEnabled ? 'success' : 'muted',
        },
        {
            label: 'Zulip',
            value: settings.zulipEnabled ? 'Enabled' : 'Disabled',
            tone: settings.zulipEnabled ? 'success' : 'muted',
        },
        {
            label: 'Retention',
            value: `${settings.retentionDays}d`,
            tone: 'default',
        },
        {
            label: 'Flapping policy',
            value: `${settings.flappingFailCount} fails / ${settings.flappingIntervalSec}s`,
            tone: 'default',
        },
    ] as const;

    return (
        <div className="app-container page-container admin-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2 data-testid="settings-page-title">Notification Settings</h2>
                    <p>Configure delivery channels, alert deep links, and global runtime policies for notifications.</p>
                </div>
                <div className="admin-toolbar-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate('/settings/history')}
                        data-testid="settings-history-button"
                    >
                        History
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate('/')}
                        data-testid="settings-back-button"
                    >
                        ← Back
                    </button>
                </div>
            </div>

            <div className="dashboard-summary-cards">
                {summaryCards.map(card => (
                    <div className="dashboard-summary-card" key={card.label}>
                        <span>{card.label}</span>
                        <strong className={`admin-summary-value ${card.tone}`}>{card.value}</strong>
                    </div>
                ))}
            </div>

            {message && (
                <div className={message.includes('Failed') ? 'error-message' : 'admin-success-banner'}>
                    {message}
                </div>
            )}

            <div className="admin-grid">
                <div className="agents-section-card">
                    <div className="form-section-header">
                        <h3>Alert Links</h3>
                        <p>Control deep links embedded into Telegram and agent offline alerts.</p>
                    </div>
                    <div className="form-group">
                        <label>App Base URL</label>
                        <input
                            type="url"
                            value={settings.appBaseUrl || ''}
                            onChange={e => update('appBaseUrl', e.target.value)}
                            placeholder="https://ping-agent.ru"
                        />
                        <div className="help-text">
                            Leave empty if you do not want links in outbound messages.
                        </div>
                    </div>
                </div>

                <div className="agents-section-card">
                    <div className="form-section-header">
                        <h3>Delivery Policy</h3>
                        <p>Tune the default alerting behavior before notifications are emitted.</p>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Notify after consecutive failures</label>
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={settings.flappingFailCount}
                                onChange={e => update('flappingFailCount', parseInt(e.target.value))}
                            />
                        </div>
                        <div className="form-group">
                            <label>Or after downtime seconds</label>
                            <input
                                type="number"
                                min="10"
                                max="86400"
                                value={settings.flappingIntervalSec}
                                onChange={e => update('flappingIntervalSec', parseInt(e.target.value))}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Retention period (days)</label>
                        <input
                            type="number"
                            min="1"
                            max="365"
                            value={settings.retentionDays}
                            onChange={e => update('retentionDays', parseInt(e.target.value))}
                        />
                        <div className="help-text">
                            Check results older than this are automatically removed by retention.
                        </div>
                    </div>
                </div>

                <div className="agents-section-card">
                    <div className="form-section-header">
                        <h3>Telegram</h3>
                        <p>Send alerts to a bot-controlled Telegram chat.</p>
                    </div>

                    <label className="form-toggle-card">
                        <input
                            type="checkbox"
                            checked={settings.telegramEnabled}
                            onChange={e => update('telegramEnabled', e.target.checked)}
                        />
                        <div className="form-toggle-copy">
                            <strong>Enable Telegram delivery</strong>
                            <span>Messages are sent only when channel credentials are valid and the channel is enabled.</span>
                        </div>
                    </label>

                    <div className="form-group">
                        <label>Bot Token</label>
                        <input
                            type="text"
                            value={settings.telegramBotToken || ''}
                            onChange={e => update('telegramBotToken', e.target.value)}
                            placeholder="123456:ABC-DEF..."
                        />
                    </div>
                    <div className="form-group">
                        <label>Chat ID</label>
                        <input
                            type="text"
                            value={settings.telegramChatId || ''}
                            onChange={e => update('telegramChatId', e.target.value)}
                            placeholder="-1001234567890"
                        />
                    </div>
                    <div className="admin-inline-actions">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={testTelegram}
                            disabled={testingTelegram || !settings.telegramBotToken || !settings.telegramChatId}
                        >
                            {testingTelegram ? 'Sending...' : 'Send test'}
                        </button>
                    </div>
                </div>

                <div className="agents-section-card">
                    <div className="form-section-header">
                        <h3>Zulip</h3>
                        <p>Route alerts into a stream and topic in your Zulip workspace.</p>
                    </div>

                    <label className="form-toggle-card">
                        <input
                            type="checkbox"
                            checked={settings.zulipEnabled}
                            onChange={e => update('zulipEnabled', e.target.checked)}
                        />
                        <div className="form-toggle-copy">
                            <strong>Enable Zulip delivery</strong>
                            <span>Use this for team-visible alert streams and threaded follow-up.</span>
                        </div>
                    </label>

                    <div className="form-group">
                        <label>Server URL</label>
                        <input
                            type="url"
                            value={settings.zulipServerUrl || ''}
                            onChange={e => update('zulipServerUrl', e.target.value)}
                            placeholder="https://your-org.zulipchat.com"
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Bot Email</label>
                            <input
                                type="email"
                                value={settings.zulipBotEmail || ''}
                                onChange={e => update('zulipBotEmail', e.target.value)}
                                placeholder="bot@your-org.zulipchat.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>API Key</label>
                            <input
                                type="password"
                                value={settings.zulipApiKey || ''}
                                onChange={e => update('zulipApiKey', e.target.value)}
                                placeholder="API key"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Stream</label>
                            <input
                                type="text"
                                value={settings.zulipStream || ''}
                                onChange={e => update('zulipStream', e.target.value)}
                                placeholder="alerts"
                            />
                        </div>
                        <div className="form-group">
                            <label>Topic</label>
                            <input
                                type="text"
                                value={settings.zulipTopic || ''}
                                onChange={e => update('zulipTopic', e.target.value)}
                                placeholder="uptime-monitor"
                            />
                        </div>
                    </div>
                    <div className="admin-inline-actions">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={testZulip}
                            disabled={testingZulip || !settings.zulipBotEmail || !settings.zulipApiKey}
                        >
                            {testingZulip ? 'Sending...' : 'Send test'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="admin-page-footer">
                <div className="admin-page-footer-copy">
                    Save once after editing channels or runtime policy so worker, API, and notification history stay aligned.
                </div>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
