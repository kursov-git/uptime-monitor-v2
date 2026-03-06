import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api';

interface Settings {
    id: string;
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
            setMessage('✅ Settings saved');
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setMessage('❌ Failed to save settings');
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
            alert(res.data.success ? '✅ Test message sent!' : '❌ Failed to send');
        } catch {
            alert('❌ Failed to send test message');
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
            alert(res.data.success ? '✅ Test message sent!' : '❌ Failed to send');
        } catch {
            alert('❌ Failed to send test message');
        } finally {
            setTestingZulip(false);
        }
    };

    const update = (field: keyof Settings, value: any) => {
        setSettings(prev => prev ? { ...prev, [field]: value } : prev);
    };

    if (!settings) {
        return <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Loading...</div>;
    }

    return (
        <div>
            <div className="section-header" style={{ marginBottom: 24 }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Global Notification Settings</h2>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/')}>
                        ← Back to Dashboard
                    </button>
                </div>
                <button className="btn btn-secondary" onClick={() => navigate('/settings/history')}>
                    📋 View History
                </button>
            </div>
            {message && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                    {message}
                </div>
            )}

            {/* Telegram Section */}
            <div className="settings-section">
                <h3>
                    📬 Telegram
                    <label className="toggle" style={{ marginLeft: 'auto' }}>
                        <input
                            type="checkbox"
                            checked={settings.telegramEnabled}
                            onChange={e => update('telegramEnabled', e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </h3>
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
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={testTelegram}
                    disabled={testingTelegram || !settings.telegramBotToken || !settings.telegramChatId}
                >
                    {testingTelegram ? 'Sending...' : '🧪 Test'}
                </button>
            </div>

            {/* Zulip Section */}
            <div className="settings-section">
                <h3>
                    💬 Zulip
                    <label className="toggle" style={{ marginLeft: 'auto' }}>
                        <input
                            type="checkbox"
                            checked={settings.zulipEnabled}
                            onChange={e => update('zulipEnabled', e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                    </label>
                </h3>
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
                <button
                    className="btn btn-secondary btn-sm"
                    onClick={testZulip}
                    disabled={testingZulip || !settings.zulipBotEmail || !settings.zulipApiKey}
                >
                    {testingZulip ? 'Sending...' : '🧪 Test'}
                </button>
            </div>

            {/* Flapping & Retention Section */}
            <div className="settings-section">
                <h3>🛡️ Flapping Protection & Retention</h3>
                <div className="form-row">
                    <div className="form-group">
                        <label>Notify after N consecutive failures</label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={settings.flappingFailCount}
                            onChange={e => update('flappingFailCount', parseInt(e.target.value))}
                        />
                    </div>
                    <div className="form-group">
                        <label>Or after N seconds of downtime</label>
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
                    <label>Retention period (days) — auto-delete check results older than this</label>
                    <input
                        type="number"
                        min="1"
                        max="365"
                        value={settings.retentionDays}
                        onChange={e => update('retentionDays', parseInt(e.target.value))}
                    />
                </div>
            </div>

            {/* Save */}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 8 }}>
                {saving ? 'Saving...' : '💾 Save Settings'}
            </button>
        </div>
    );
}
