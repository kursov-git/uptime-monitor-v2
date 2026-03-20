import { useEffect, useState } from 'react';
import { Agent, Monitor, MonitorFormData, agentsApi } from '../api';

interface MonitorFormProps {
    monitor?: Monitor;
    onSubmit: (data: MonitorFormData) => Promise<void>;
    onCancel: () => void;
    onToggle?: () => void;
}

export default function MonitorForm({ monitor, onSubmit, onCancel, onToggle }: MonitorFormProps) {
    const monitorType = monitor?.type || 'HTTP';
    const [agents, setAgents] = useState<Agent[]>([]);
    const [formData, setFormData] = useState<MonitorFormData>({
        name: monitor?.name || '',
        serviceName: monitor?.serviceName || '',
        type: monitorType,
        url: monitor?.url || '',
        dnsRecordType: monitor?.dnsRecordType || 'A',
        agentId: monitor?.agentId || '',
        method: monitor?.method || 'GET',
        intervalSeconds: monitor?.intervalSeconds || 60,
        timeoutSeconds: monitor?.timeoutSeconds || 30,
        expectedStatus: monitor?.expectedStatus || 200,
        expectedBody: monitor?.expectedBody || '',
        requestBody: monitor?.requestBody || '',
        bodyAssertionType: monitor?.bodyAssertionType || (monitor?.expectedBody ? 'AUTO' : 'NONE'),
        bodyAssertionPath: monitor?.bodyAssertionPath || '',
        headers: monitor?.headers || '',
        authMethod: monitor?.authMethod || 'NONE',
        authUrl: monitor?.authUrl || '',
        authPayload: monitor?.authPayload || '',
        authTokenRegex: monitor?.authTokenRegex || '',
        sslExpiryEnabled: monitor?.sslExpiryEnabled || false,
        sslExpiryThresholdDays: monitor?.sslExpiryThresholdDays || 14,
    });
    const [loginUser, setLoginUser] = useState(() => {
        if (!monitor?.authPayload) return '';
        if (monitor.authMethod === 'BASIC') return monitor.authPayload.split(':')[0] || '';
        try { const p = JSON.parse(monitor.authPayload); return p.username || p.email || p.login || ''; } catch { return ''; }
    });
    const [loginPass, setLoginPass] = useState(() => {
        if (!monitor?.authPayload) return '';
        if (monitor.authMethod === 'BASIC') {
            const parts = monitor.authPayload.split(':');
            return parts.slice(1).join(':') || '';
        }
        try { const p = JSON.parse(monitor.authPayload); return p.password || ''; } catch { return ''; }
    });
    const [loginExtra, setLoginExtra] = useState(() => {
        if (!monitor?.authPayload) return '';
        if (monitor.authMethod === 'BASIC') return '';
        try {
            const p = JSON.parse(monitor.authPayload);
            const rest = { ...p };
            delete rest.username;
            delete rest.email;
            delete rest.login;
            delete rest.password;
            return Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '';
        } catch { return ''; }
    });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const isHttpMonitor = formData.type === 'HTTP';
    const isDnsMonitor = formData.type === 'DNS';
    const isTcpMonitor = formData.type === 'TCP';
    const currentHttpMethod = String(formData.method || 'GET').toUpperCase();
    const showRequestBody = isHttpMonitor && !['GET', 'HEAD'].includes(currentHttpMethod);

    const getTargetLabel = () => {
        if (isTcpMonitor) return 'TCP Target';
        if (isDnsMonitor) return 'DNS Target';
        return 'URL';
    };

    const getTargetPlaceholder = () => {
        if (isTcpMonitor) return 'tcp://db.example.com:5432';
        if (isDnsMonitor) return 'dns://example.com';
        return 'https://example.com';
    };

    const applyMonitorTypeDefaults = (nextType: MonitorFormData['type']) => {
        setFormData(prev => {
            if (nextType === 'TCP') {
                return {
                    ...prev,
                    type: nextType,
                    dnsRecordType: 'A',
                    method: 'GET',
                    expectedStatus: 200,
                    expectedBody: '',
                    requestBody: '',
                    bodyAssertionType: 'NONE',
                    bodyAssertionPath: '',
                    headers: '',
                    authMethod: 'NONE',
                    authUrl: '',
                    authPayload: '',
                    authTokenRegex: '',
                    sslExpiryEnabled: false,
                    sslExpiryThresholdDays: 14,
                };
            }

            if (nextType === 'DNS') {
                return {
                    ...prev,
                    type: nextType,
                    method: 'GET',
                    expectedStatus: 200,
                    requestBody: '',
                    bodyAssertionType: 'NONE',
                    bodyAssertionPath: '',
                    headers: '',
                    authMethod: 'NONE',
                    authUrl: '',
                    authPayload: '',
                    authTokenRegex: '',
                    sslExpiryEnabled: false,
                    sslExpiryThresholdDays: 14,
                };
            }

            return {
                ...prev,
                type: nextType,
                method: prev.method || 'GET',
            };
        });
    };

    useEffect(() => {
        const loadAgents = async () => {
            try {
                const res = await agentsApi.get<Agent[]>('/');
                setAgents(res.data);
            } catch {
                // Ignore if user has no access or API disabled.
            }
        };
        loadAgents();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        let constructedPayload = formData.authPayload;
        if (formData.authMethod === 'BASIC') {
            constructedPayload = `${loginUser}:${loginPass}`;
        } else if (formData.authMethod === 'FORM_LOGIN' || formData.authMethod === 'CSRF_FORM_LOGIN') {
            let extraObj = {};
            if (loginExtra.trim() !== '') {
                try {
                    extraObj = JSON.parse(loginExtra);
                } catch {
                    setError('Additional JSON Payload must be a valid JSON object');
                    return;
                }
            }
            const loginKey = loginUser.includes('@') ? 'email' : 'username';
            constructedPayload = JSON.stringify({
                [loginKey]: loginUser,
                password: loginPass,
                ...extraObj
            });
        }

        setSubmitting(true);

        try {
            const normalizedAssertionType = isHttpMonitor ? (formData.bodyAssertionType || 'NONE') : 'NONE';
            const normalizedExpectedBody = isHttpMonitor
                ? (normalizedAssertionType === 'NONE' ? '' : formData.expectedBody)
                : isDnsMonitor
                    ? formData.expectedBody
                    : '';
            const normalizedRequestBody = showRequestBody ? formData.requestBody : '';
            const normalizedAssertionPath = (
                isHttpMonitor && (normalizedAssertionType === 'JSON_PATH_EQUALS' || normalizedAssertionType === 'JSON_PATH_CONTAINS')
            )
                ? formData.bodyAssertionPath
                : '';

            await onSubmit({
                ...formData,
                agentId: formData.agentId || null,
                method: isHttpMonitor ? currentHttpMethod : 'GET',
                authPayload: isHttpMonitor ? constructedPayload : '',
                bodyAssertionType: normalizedAssertionType,
                expectedBody: normalizedExpectedBody,
                requestBody: normalizedRequestBody,
                bodyAssertionPath: normalizedAssertionPath,
                headers: isHttpMonitor ? formData.headers : '',
                authMethod: isHttpMonitor ? formData.authMethod : 'NONE',
                authUrl: isHttpMonitor ? formData.authUrl : '',
                authTokenRegex: isHttpMonitor ? formData.authTokenRegex : '',
                sslExpiryEnabled: isHttpMonitor ? formData.sslExpiryEnabled : false,
                sslExpiryThresholdDays: isHttpMonitor ? formData.sslExpiryThresholdDays : 14,
            });
        } catch (err: any) {
            const msg = err.response?.data?.errors?.[0]?.message
                || err.response?.data?.error
                || err.message
                || 'Failed to save';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const update = (field: keyof MonitorFormData, value: string | number | boolean | null) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="modal-overlay" data-testid="monitor-form-overlay">
            <div className="modal" onClick={e => e.stopPropagation()} data-testid="monitor-form-modal">
                <h2>{monitor ? 'Edit Monitor' : 'New Monitor'}</h2>

                {monitor && !monitor.isActive && (
                    <div className="warning-message">
                        ⚠️ This monitor is currently paused. Checks are not running.
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => update('name', e.target.value)}
                            placeholder="My Website"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Service (optional)</label>
                        <input
                            type="text"
                            value={formData.serviceName}
                            onChange={e => update('serviceName', e.target.value)}
                            placeholder="Auth API"
                        />
                        <div className="help-text">
                            Monitors with the same service name are grouped together in the dashboard and public status page.
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Monitor Type</label>
                        <select
                            value={formData.type}
                            onChange={e => applyMonitorTypeDefaults(e.target.value as MonitorFormData['type'])}
                        >
                            <option value="HTTP">HTTP / HTTPS</option>
                            <option value="TCP">TCP Port</option>
                            <option value="DNS">DNS Record</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>{getTargetLabel()}</label>
                        <input
                            type="text"
                            value={formData.url}
                            onChange={e => update('url', e.target.value)}
                            placeholder={getTargetPlaceholder()}
                            required
                        />
                        <div className="help-text">
                            {isHttpMonitor && 'Use a full HTTP or HTTPS URL.'}
                            {isTcpMonitor && 'Use tcp://host:port to verify that a TCP socket accepts connections.'}
                            {isDnsMonitor && 'Use dns://hostname to resolve a DNS record from the assigned executor.'}
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Executor</label>
                            <select
                                value={formData.agentId || ''}
                                onChange={e => update('agentId', e.target.value)}
                            >
                                <option value="">Builtin Worker</option>
                                {agents.map(agent => (
                                    <option key={agent.id} value={agent.id}>
                                        {agent.name} ({agent.status})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {isHttpMonitor && (
                        <div className="form-group">
                            <label>Method</label>
                            <select
                                value={formData.method}
                                onChange={e => {
                                    const nextMethod = e.target.value;
                                    setFormData(prev => ({
                                        ...prev,
                                        method: nextMethod,
                                        requestBody: ['GET', 'HEAD'].includes(nextMethod) ? '' : prev.requestBody,
                                    }));
                                }}
                            >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                                <option value="HEAD">HEAD</option>
                                <option value="PATCH">PATCH</option>
                            </select>
                        </div>
                        )}

                        {isDnsMonitor && (
                        <div className="form-group">
                            <label>Record Type</label>
                            <select
                                value={formData.dnsRecordType}
                                onChange={e => update('dnsRecordType', e.target.value)}
                            >
                                <option value="A">A</option>
                                <option value="AAAA">AAAA</option>
                                <option value="CNAME">CNAME</option>
                                <option value="MX">MX</option>
                                <option value="TXT">TXT</option>
                                <option value="NS">NS</option>
                            </select>
                        </div>
                        )}

                        <div className="form-group">
                            <label>Interval (seconds)</label>
                            <input
                                type="number"
                                min="0.1"
                                max="86400"
                                step="0.1"
                                value={formData.intervalSeconds}
                                onChange={e => update('intervalSeconds', parseFloat(e.target.value))}
                            />
                        </div>

                        <div className="form-group">
                            <label>Timeout (seconds)</label>
                            <input
                                type="number"
                                min="1"
                                max="300"
                                step="1"
                                value={formData.timeoutSeconds}
                                onChange={e => update('timeoutSeconds', parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    {isHttpMonitor && (
                    <div className="form-row">
                        <div className="form-group">
                            <label>Expected Status</label>
                            <input
                                type="number"
                                min="100"
                                max="599"
                                value={formData.expectedStatus}
                                onChange={e => update('expectedStatus', parseInt(e.target.value))}
                            />
                        </div>

                        <div className="form-group">
                            <label>Assertion Mode</label>
                            <select
                                value={formData.bodyAssertionType}
                                onChange={e => {
                                    const nextType = e.target.value as MonitorFormData['bodyAssertionType'];
                                    setFormData(prev => ({
                                        ...prev,
                                        bodyAssertionType: nextType,
                                        expectedBody: nextType === 'NONE' ? '' : prev.expectedBody,
                                        bodyAssertionPath: nextType === 'JSON_PATH_EQUALS' || nextType === 'JSON_PATH_CONTAINS'
                                            ? prev.bodyAssertionPath
                                            : '',
                                    }));
                                }}
                            >
                                <option value="NONE">None</option>
                                <option value="AUTO">Auto: regex or contains</option>
                                <option value="CONTAINS">Contains text</option>
                                <option value="REGEX">Regex match</option>
                                <option value="JSON_PATH_EQUALS">JSON path equals</option>
                                <option value="JSON_PATH_CONTAINS">JSON path contains</option>
                            </select>
                        </div>
                    </div>
                    )}

                    {isHttpMonitor && formData.bodyAssertionType !== 'NONE' && (
                        <div className="form-row">
                            {(formData.bodyAssertionType === 'JSON_PATH_EQUALS' || formData.bodyAssertionType === 'JSON_PATH_CONTAINS') && (
                                <div className="form-group">
                                    <label>JSON Path</label>
                                    <input
                                        type="text"
                                        value={formData.bodyAssertionPath}
                                        onChange={e => update('bodyAssertionPath', e.target.value)}
                                        placeholder="data.status or items[0].name"
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label>
                                    {formData.bodyAssertionType === 'REGEX' && 'Expected Regex'}
                                    {formData.bodyAssertionType === 'CONTAINS' && 'Expected Text'}
                                    {formData.bodyAssertionType === 'AUTO' && 'Expected Body'}
                                    {formData.bodyAssertionType === 'JSON_PATH_EQUALS' && 'Expected JSON Value'}
                                    {formData.bodyAssertionType === 'JSON_PATH_CONTAINS' && 'Expected JSON Fragment'}
                                </label>
                                <input
                                    type="text"
                                    value={formData.expectedBody}
                                    onChange={e => update('expectedBody', e.target.value)}
                                    placeholder="optional"
                                />
                            </div>
                        </div>
                    )}

                    {isHttpMonitor && formData.bodyAssertionType !== 'NONE' && (
                        <div className="help-text" style={{ marginBottom: 16 }}>
                            {formData.bodyAssertionType === 'AUTO' && 'Backward-compatible mode: tries regex first, then falls back to substring matching.'}
                            {formData.bodyAssertionType === 'CONTAINS' && 'Marks the check down if the response body does not contain the provided text.'}
                            {formData.bodyAssertionType === 'REGEX' && 'Marks the check down if the response body does not match the provided regular expression.'}
                            {formData.bodyAssertionType === 'JSON_PATH_EQUALS' && 'Parses the response as JSON and compares the selected path to the expected value.'}
                            {formData.bodyAssertionType === 'JSON_PATH_CONTAINS' && 'Parses the response as JSON and checks whether the selected path contains the expected fragment.'}
                        </div>
                    )}

                    {isDnsMonitor && (
                        <div className="form-group">
                            <label>Expected Answer Contains</label>
                            <input
                                type="text"
                                value={formData.expectedBody}
                                onChange={e => update('expectedBody', e.target.value)}
                                placeholder="optional"
                            />
                            <div className="help-text">
                                Optional substring match against the resolved DNS answers.
                            </div>
                        </div>
                    )}

                    {isHttpMonitor && (
                    <div className="form-group">
                        <label>Custom Headers (JSON)</label>
                        <textarea
                            value={formData.headers}
                            onChange={e => update('headers', e.target.value)}
                            placeholder='{"Authorization": "Bearer ..."}'
                            rows={3}
                        />
                    </div>
                    )}

                    {showRequestBody && (
                        <div className="form-group">
                            <label>Request Body</label>
                            <textarea
                                value={formData.requestBody}
                                onChange={e => update('requestBody', e.target.value)}
                                placeholder='{"type":"event"} or key=value'
                                rows={5}
                            />
                            <div className="help-text">
                                Sent as raw request body for {formData.method}. Set Content-Type explicitly in Custom Headers.
                            </div>
                        </div>
                    )}

                    {isHttpMonitor && (
                    <div className="form-group" style={{ marginTop: '1rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={formData.sslExpiryEnabled}
                                onChange={e => update('sslExpiryEnabled', e.target.checked)}
                            />
                            Monitor SSL certificate expiry
                        </label>
                        <div className="help-text" style={{ marginTop: 8, marginBottom: 12 }}>
                            Sends a warning when the HTTPS certificate is close to expiry without marking the monitor DOWN while the endpoint still responds.
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Warn When ≤ Days</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="365"
                                    step="1"
                                    value={formData.sslExpiryThresholdDays}
                                    disabled={!formData.sslExpiryEnabled}
                                    onChange={e => update('sslExpiryThresholdDays', parseInt(e.target.value, 10))}
                                />
                            </div>
                        </div>
                    </div>
                    )}

                    {isHttpMonitor && (
                    <div className="form-group" style={{ marginTop: '1rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
                        <label>Authentication Settings (Multi-Step)</label>
                        <select
                            value={formData.authMethod}
                            onChange={e => update('authMethod', e.target.value)}
                            style={{ marginBottom: '1rem' }}
                        >
                            <option value="NONE">None</option>
                            <option value="BASIC">Basic Auth</option>
                            <option value="FORM_LOGIN">Form Login</option>
                            <option value="CSRF_FORM_LOGIN">CSRF Form Login (Django/Spring)</option>
                        </select>

                        {(formData.authMethod === 'FORM_LOGIN' || formData.authMethod === 'CSRF_FORM_LOGIN') && (
                            <div className="form-group">
                                <label>Login URL</label>
                                <input
                                    type="url"
                                    value={formData.authUrl}
                                    onChange={e => update('authUrl', e.target.value)}
                                    placeholder="https://example.com/api/login"
                                />
                            </div>
                        )}

                        {formData.authMethod !== 'NONE' && (
                            <>
                                <div className="form-group">
                                    <label>Login / Username <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="text"
                                        value={loginUser}
                                        onChange={e => setLoginUser(e.target.value)}
                                        placeholder={formData.authMethod === 'BASIC' ? 'admin' : 'user@example.com'}
                                        required
                                    />
                                    <div className="help-text">
                                        Your login credential. If you enter an email (contains '@'), we will send it as <code>"email"</code> in the JSON payload, otherwise as <code>"username"</code>.
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Password <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="password"
                                        value={loginPass}
                                        onChange={e => setLoginPass(e.target.value)}
                                        placeholder="Enter your password"
                                        required
                                    />
                                    <div className="help-text">
                                        The password for the account. Sent as <code>"password"</code> in the JSON payload.
                                    </div>
                                </div>

                                {(formData.authMethod === 'FORM_LOGIN' || formData.authMethod === 'CSRF_FORM_LOGIN') && (
                                    <div className="form-group">
                                        <label>Additional JSON Payload <span>(Optional)</span></label>
                                        <textarea
                                            value={loginExtra}
                                            onChange={e => setLoginExtra(e.target.value)}
                                            placeholder='{"tenantId": "123", "rememberMe": true}'
                                            rows={2}
                                        />
                                        <div className="help-text">
                                            Any additional fields required by your login endpoint. Must be valid JSON format.
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {(formData.authMethod === 'FORM_LOGIN' || formData.authMethod === 'CSRF_FORM_LOGIN') && (
                            <div className="form-group">
                                <label>Token Extraction Regex (Optional, for Bearer Tokens)</label>
                                <input
                                    type="text"
                                    value={formData.authTokenRegex}
                                    onChange={e => update('authTokenRegex', e.target.value)}
                                    placeholder='"token":"([^"]+)"'
                                />
                            </div>
                        )}
                    </div>
                    )}

                    <div className="modal-actions">
                        {monitor && onToggle && (
                            <button
                                type="button"
                                className={`btn ${monitor.isActive ? 'btn-warning' : 'btn-success'}`}
                                onClick={onToggle}
                            >
                                {monitor.isActive ? '⏸ Pause' : '▶️ Resume'}
                            </button>
                        )}
                        <div style={{ flex: 1 }} />
                        <button type="button" className="btn btn-secondary" onClick={onCancel} data-testid="monitor-form-cancel">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting} data-testid="monitor-form-submit">
                            {submitting ? 'Saving...' : (monitor ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
