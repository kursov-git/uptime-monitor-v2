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

    return (
        <div>
            <div className="section-header">
                <h2>Users ({users.length})</h2>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(true)}>
                    ＋ Create User
                </button>
            </div>

            {/* Users Table */}
            <div className="card">
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
                                    <td style={{ fontWeight: 600 }}>{user.username}</td>
                                    <td>
                                        <span className={`status-badge ${user.role === 'ADMIN' ? 'up' : 'paused'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        {user.apiKey && !user.apiKey.revokedAt
                                            ? <span style={{ color: 'var(--color-success)', fontSize: '0.85rem' }}>Active</span>
                                            : <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>None</span>
                                        }
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4 }}>
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
            </div>

            {/* Create User Modal */}
            {showCreateForm && (
                <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>Create User</h2>
                        {error && <div className="error-message">{error}</div>}
                        <form onSubmit={handleCreate}>
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
                            <div className="form-group">
                                <label>Role</label>
                                <select value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                                    <option value="VIEWER">Viewer</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {passwordModal && (
                <div className="modal-overlay" onClick={() => setPasswordModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h2>Change Password — {passwordModal.username}</h2>
                        <form onSubmit={handleChangePassword}>
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
                            <div className="modal-actions">
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
