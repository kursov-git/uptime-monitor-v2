import { useState, useEffect, useCallback } from 'react';
import { usersApi, User } from '../api';

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'ADMIN' | 'VIEWER'>('VIEWER');
    const [error, setError] = useState('');
    const [passwordModal, setPasswordModal] = useState<User | null>(null);
    const [changePassword, setChangePassword] = useState('');

    const fetchUsers = useCallback(async () => {
        try {
            const res = await usersApi.get('/');
            setUsers(res.data);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await usersApi.post('/', {
                username: newUsername,
                password: newPassword,
                role: newRole,
            });
            setNewUsername('');
            setNewPassword('');
            setNewRole('VIEWER');
            setShowCreateForm(false);
            await fetchUsers();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create user');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await usersApi.delete(`/${id}`);
            await fetchUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete user');
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordModal) return;

        try {
            await usersApi.patch(`/${passwordModal.id}/password`, {
                password: changePassword,
            });
            setPasswordModal(null);
            setChangePassword('');
            alert('Password changed successfully');
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to change password');
        }
    };

    const adminCount = users.filter(user => user.role === 'ADMIN').length;
    const viewerCount = users.filter(user => user.role === 'VIEWER').length;
    const apiKeyCount = users.filter(user => user.apiKey && !user.apiKey.revokedAt).length;

    return (
        <div className="app-container page-container admin-page">
            <div className="dashboard-toolbar">
                <div className="dashboard-toolbar-copy">
                    <h2 data-testid="users-page-title">Users</h2>
                    <p>Manage operator accounts, assign viewer access, and rotate credentials without leaving the control plane.</p>
                </div>
                <div className="admin-toolbar-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(true)}>
                        + Create User
                    </button>
                </div>
            </div>

            <div className="dashboard-summary-cards">
                <div className="dashboard-summary-card">
                    <span>Total users</span>
                    <strong>{users.length}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Admins</span>
                    <strong className="admin-summary-value success">{adminCount}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>Viewers</span>
                    <strong>{viewerCount}</strong>
                </div>
                <div className="dashboard-summary-card">
                    <span>API keys</span>
                    <strong>{apiKeyCount}</strong>
                </div>
            </div>

            <div className="agents-section-card">
                <div className="section-header">
                    <h2>Access Directory</h2>
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Created</th>
                                <th>API Key</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="admin-entity-primary">
                                            <strong>{user.username}</strong>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${user.role === 'ADMIN' ? 'up' : 'paused'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <span className={`admin-inline-badge ${user.apiKey && !user.apiKey.revokedAt ? 'success' : 'muted'}`}>
                                            {user.apiKey && !user.apiKey.revokedAt ? 'Active' : 'None'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="admin-row-actions">
                                            <button
                                                className="btn btn-icon btn-sm btn-secondary"
                                                onClick={() => setPasswordModal(user)}
                                                title="Change password"
                                            >
                                                🔒
                                            </button>
                                            <button
                                                className="btn btn-icon btn-sm btn-danger"
                                                onClick={() => handleDelete(user.id)}
                                                title="Delete user"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {users.length === 0 && (
                    <div className="empty-state" style={{ padding: '28px 20px' }}>
                        <p>No users created yet</p>
                    </div>
                )}
            </div>

            {showCreateForm && (
                <div className="modal-overlay">
                    <div className="modal monitor-form-modal" onClick={e => e.stopPropagation()}>
                        <div className="app-modal-header">
                            <div>
                                <div className="app-modal-kicker">Access Control</div>
                                <h2>Create User</h2>
                                <p className="app-modal-subtitle">Create a new operator account with either full admin access or read-only viewer access.</p>
                            </div>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreateForm(false)}>
                                Cancel
                            </button>
                        </div>
                        {error && <div className="error-message">{error}</div>}
                        <form onSubmit={handleCreate}>
                            <div className="form-sections">
                                <div className="form-section-card">
                                    <div className="form-section-header">
                                        <h3>Identity</h3>
                                        <p>Use a stable username that maps clearly to an operator.</p>
                                    </div>
                                    <div className="form-group">
                                        <label>Username</label>
                                        <input
                                            type="text"
                                            value={newUsername}
                                            onChange={e => setNewUsername(e.target.value)}
                                            placeholder="username"
                                            required
                                            minLength={3}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Password</label>
                                        <input
                                            type="password"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            minLength={6}
                                        />
                                    </div>
                                </div>

                                <div className="form-section-card">
                                    <div className="form-section-header">
                                        <h3>Role</h3>
                                        <p>Viewer accounts can read dashboards and history but cannot mutate operators or configuration.</p>
                                    </div>
                                    <div className="form-group">
                                        <label>Role</label>
                                        <select value={newRole} onChange={e => setNewRole(e.target.value as 'ADMIN' | 'VIEWER')}>
                                            <option value="VIEWER">Viewer</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="app-modal-footer modal-actions">
                                <div className="modal-footer-spacer" />
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">Create User</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {passwordModal && (
                <div className="modal-overlay">
                    <div className="modal monitor-form-modal modal-compact" onClick={e => e.stopPropagation()}>
                        <div className="app-modal-header">
                            <div>
                                <div className="app-modal-kicker">Credential Rotation</div>
                                <h2>Change Password</h2>
                                <p className="app-modal-subtitle">Issue a new password for {passwordModal.username}. Existing browser sessions will be revoked.</p>
                            </div>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPasswordModal(null)}>
                                Cancel
                            </button>
                        </div>
                        <form onSubmit={handleChangePassword}>
                            <div className="form-section-card">
                                <div className="form-group">
                                    <label>New Password</label>
                                    <input
                                        type="password"
                                        value={changePassword}
                                        onChange={e => setChangePassword(e.target.value)}
                                        placeholder="New password"
                                        required
                                        minLength={6}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="app-modal-footer modal-actions">
                                <div className="modal-footer-spacer" />
                                <button type="button" className="btn btn-secondary" onClick={() => setPasswordModal(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">Change Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
