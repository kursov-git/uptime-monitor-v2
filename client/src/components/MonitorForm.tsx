import { useEffect, useState } from 'react';
import { Agent, Monitor, MonitorFormData, agentsApi } from '../api';
import {
    applyBodyAssertionType,
    applyHttpMethod,
    applyMonitorTypeDefaults,
    buildInitialMonitorFormData,
    buildMonitorSubmitData,
    getAssertionHelpText,
    getMonitorFormMode,
    getMonitorFormErrorMessage,
    getTargetHelpText,
    getTargetLabel,
    getTargetPlaceholder,
    parseAuthPayloadFields,
} from '../lib/monitorFormModel';

interface MonitorFormProps {
    monitor?: Monitor;
    onSubmit: (data: MonitorFormData) => Promise<void>;
    onCancel: () => void;
    onToggle?: () => void;
}

export default function MonitorForm({ monitor, onSubmit, onCancel, onToggle }: MonitorFormProps) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [formData, setFormData] = useState<MonitorFormData>(() => buildInitialMonitorFormData(monitor));
    const initialAuthFields = parseAuthPayloadFields(monitor);
    const [loginUser, setLoginUser] = useState(initialAuthFields.loginUser);
    const [loginPass, setLoginPass] = useState(initialAuthFields.loginPass);
    const [loginExtra, setLoginExtra] = useState(initialAuthFields.loginExtra);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const {
        isHttpMonitor,
        isDnsMonitor,
        showRequestBody,
    } = getMonitorFormMode(formData);

    useEffect(() => {
        const loadAgents = async () => {
            try {
                const res = await agentsApi.get('/');
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

        const submitData = buildMonitorSubmitData({ formData, loginUser, loginPass, loginExtra });
        if (!submitData.ok) {
            setError(submitData.error);
            return;
        }

        setSubmitting(true);

        try {
            await onSubmit(submitData.data);
        } catch (err: unknown) {
            setError(getMonitorFormErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const update = (field: keyof MonitorFormData, value: string | number | boolean | null) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const modalTitle = monitor ? 'Edit Monitor' : 'New Monitor';
    const modalSubtitle = monitor
        ? 'Update target, execution, and validation settings without losing current history.'
        : 'Create a new synthetic check with grouped execution, assertion, and security settings.';

    const assertionHelpText = getAssertionHelpText(formData.bodyAssertionType);

    return (
        <div className="modal-overlay" data-testid="monitor-form-overlay">
            <div className="modal monitor-form-modal" onClick={e => e.stopPropagation()} data-testid="monitor-form-modal">
                <div className="app-modal-header">
                    <div>
                        <div className="app-modal-kicker">Monitor Configuration</div>
                        <h2>{modalTitle}</h2>
                        <p className="app-modal-subtitle">{modalSubtitle}</p>
                    </div>
                    {monitor && (
                        <div className={`monitor-form-status-chip ${monitor.isActive ? 'active' : 'paused'}`}>
                            {monitor.isActive ? 'Active monitor' : 'Paused monitor'}
                        </div>
                    )}
                </div>

                {monitor && !monitor.isActive && (
                    <div className="warning-message">
                        ⚠️ This monitor is currently paused. Checks are not running.
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-sections">
                        <section className="form-section-card">
                            <div className="form-section-header">
                                <div>
                                    <h3>Identity</h3>
                                    <p>Name, grouping, monitor type, and target.</p>
                                </div>
                            </div>
                            <div className="form-section-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Name</label>
                                        <input
                                            data-testid="monitor-name-input"
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
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Monitor Type</label>
                                        <select
                                            value={formData.type}
                                            onChange={e => setFormData(prev => applyMonitorTypeDefaults(prev, e.target.value as MonitorFormData['type']))}
                                        >
                                            <option value="HTTP">HTTP / HTTPS</option>
                                            <option value="TCP">TCP Port</option>
                                            <option value="DNS">DNS Record</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>{getTargetLabel(formData.type)}</label>
                                        <input
                                            data-testid="monitor-url-input"
                                            type="text"
                                            value={formData.url}
                                            onChange={e => update('url', e.target.value)}
                                            placeholder={getTargetPlaceholder(formData.type)}
                                            required
                                        />
                                        <div className="help-text">
                                            {getTargetHelpText(formData.type)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="form-section-card">
                            <div className="form-section-header">
                                <div>
                                    <h3>Execution</h3>
                                    <p>Choose where and how frequently the check runs.</p>
                                </div>
                            </div>
                            <div className="form-section-body">
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
                                                onChange={e => setFormData(prev => applyHttpMethod(prev, e.target.value))}
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
                                </div>

                                <div className="form-row">
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
                            </div>
                        </section>

                        {(isHttpMonitor || isDnsMonitor) && (
                            <section className="form-section-card">
                                <div className="form-section-header">
                                    <div>
                                        <h3>Validation</h3>
                                        <p>Define what counts as a successful result.</p>
                                    </div>
                                </div>
                                <div className="form-section-body">
                                    {isHttpMonitor && (
                                        <>
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
                                                        onChange={e => setFormData(prev => applyBodyAssertionType(prev, e.target.value as MonitorFormData['bodyAssertionType']))}
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

                                            {formData.bodyAssertionType !== 'NONE' && (
                                                <>
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

                                                    <div className="form-note">
                                                        {assertionHelpText}
                                                    </div>
                                                </>
                                            )}
                                        </>
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
                                </div>
                            </section>
                        )}

                        {isHttpMonitor && (
                            <section className="form-section-card">
                                <div className="form-section-header">
                                    <div>
                                        <h3>Request Details</h3>
                                        <p>Headers and raw body for body-capable synthetic checks.</p>
                                    </div>
                                </div>
                                <div className="form-section-body">
                                    <div className="form-group">
                                        <label>Custom Headers (JSON)</label>
                                        <textarea
                                            value={formData.headers}
                                            onChange={e => update('headers', e.target.value)}
                                            placeholder='{"Authorization": "Bearer ..."}'
                                            rows={3}
                                        />
                                    </div>

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
                                </div>
                            </section>
                        )}

                        {isHttpMonitor && (
                            <section className="form-section-card">
                                <div className="form-section-header">
                                    <div>
                                        <h3>HTTPS Certificate</h3>
                                        <p>Optional expiry monitoring that warns without marking the endpoint down.</p>
                                    </div>
                                </div>
                                <div className="form-section-body">
                                    <label className="form-toggle-card">
                                        <input
                                            type="checkbox"
                                            checked={formData.sslExpiryEnabled}
                                            onChange={e => update('sslExpiryEnabled', e.target.checked)}
                                        />
                                        <div className="form-toggle-copy">
                                            <strong>Monitor SSL certificate expiry</strong>
                                            <span>Send a warning when the HTTPS certificate is close to expiry while the endpoint still responds successfully.</span>
                                        </div>
                                    </label>

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
                            </section>
                        )}

                        {isHttpMonitor && (
                            <section className="form-section-card">
                                <div className="form-section-header">
                                    <div>
                                        <h3>Authentication</h3>
                                        <p>Optional login/bootstrap flow before the actual monitor request.</p>
                                    </div>
                                </div>
                                <div className="form-section-body">
                                    <div className="form-group">
                                        <label>Authentication Settings (Multi-Step)</label>
                                        <select
                                            value={formData.authMethod}
                                            onChange={e => update('authMethod', e.target.value)}
                                        >
                                            <option value="NONE">None</option>
                                            <option value="BASIC">Basic Auth</option>
                                            <option value="FORM_LOGIN">Form Login</option>
                                            <option value="CSRF_FORM_LOGIN">CSRF Form Login (Django/Spring)</option>
                                        </select>
                                    </div>

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
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Login / Username <span className="required-mark">*</span></label>
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
                                                    <label>Password <span className="required-mark">*</span></label>
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
                                            </div>

                                            {(formData.authMethod === 'FORM_LOGIN' || formData.authMethod === 'CSRF_FORM_LOGIN') && (
                                                <>
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

                                                    <div className="form-group">
                                                        <label>Token Extraction Regex (Optional, for Bearer Tokens)</label>
                                                        <input
                                                            type="text"
                                                            value={formData.authTokenRegex}
                                                            onChange={e => update('authTokenRegex', e.target.value)}
                                                            placeholder='"token":"([^"]+)"'
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="modal-actions app-modal-footer">
                        {monitor && onToggle && (
                            <button
                                type="button"
                                className={`btn ${monitor.isActive ? 'btn-warning' : 'btn-success'}`}
                                onClick={onToggle}
                            >
                                {monitor.isActive ? '⏸ Pause' : '▶️ Resume'}
                            </button>
                        )}
                        <div className="modal-footer-spacer" />
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
