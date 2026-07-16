"use client";

import { useEffect, useState, type FormEvent } from 'react';
import { Badge, surfaceCard } from '@/components/ui';
import { cn } from '@/lib/utils';

type User = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
};

type SupabaseStatus = {
  configured: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
};

export function UserManagementPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Viewer');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [status, setStatus] = useState<SupabaseStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function fetchSettingsAndUsers() {
    try {
      setFetchLoading(true);
      const configRes = await fetch('/api/settings/supabase');
      if (configRes.ok) {
        const configData = await configRes.json();
        setStatus(configData);
      }

      const usersRes = await fetch('/api/admin/users');
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        if (usersData.ok) {
          setUsers(usersData.users);
        }
      }
    } catch (err) {
      console.error('Failed to load user management details', err);
    } finally {
      setFetchLoading(false);
    }
  }

  useEffect(() => {
    fetchSettingsAndUsers();
  }, []);

  function startEdit(user: User) {
    setEditingUser(user);
    setEmail(user.email);
    setFullName(user.full_name ?? '');
    setPhone(user.phone ?? '');
    setPassword('');
    setRole(user.role);
    setMessage('');
    setErrorMsg('');
  }

  function cancelEdit() {
    setEditingUser(null);
    setEmail('');
    setFullName('');
    setPhone('');
    setPassword('');
    setRole('Viewer');
    setMessage('');
    setErrorMsg('');
  }

  async function handleCreateOrUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setErrorMsg('');

    if (!editingUser) {
      if (!email || !password || !role) {
        setErrorMsg('Email, password, and role are required.');
        setLoading(false);
        return;
      }
    } else {
      if (!role) {
        setErrorMsg('Role is required.');
        setLoading(false);
        return;
      }
    }

    try {
      const url = '/api/admin/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const body = editingUser
          ? {
              userId: editingUser.user_id,
              full_name: fullName,
              phone,
              role,
              password: password || undefined,
            }
          : {
              email,
              password,
              full_name: fullName,
              phone,
              role,
            };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? `Unable to ${editingUser ? 'update' : 'create'} user.`);
      }

      setMessage(editingUser ? 'User updated successfully!' : `User created successfully! Role: ${role}`);
      cancelEdit();
      fetchSettingsAndUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : `Unable to ${editingUser ? 'update' : 'create'} user.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    setLoading(true);
    setMessage('');
    setErrorMsg('');

    try {
      const response = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to delete user.');
      }

      setMessage('User deleted successfully.');
      fetchSettingsAndUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to delete user.');
    } finally {
      setLoading(false);
    }
  }

  const isSupabaseConfigured = status?.configured ?? false;
  const isServiceRoleKeyMissing = isSupabaseConfigured && !status?.hasServiceRoleKey;

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <Badge tone={isSupabaseConfigured ? 'accent' : 'default'}>
          {isSupabaseConfigured ? 'Supabase Auth' : 'Local DB Demo'}
        </Badge>
      </div>

      {isServiceRoleKeyMissing && (
        <div className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-4 text-xs text-warning leading-relaxed font-medium">
          <b className="text-text font-bold">Missing Admin Permissions:</b> Supabase connection is active, but the <b className="text-text font-bold">Service Role Key</b> has not been saved.
          Creating and listing auth users programmatically requires administrative authorization.
          Please enter the service role key in the connection panel above to unlock user management features.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Create / Edit User Form */}
        <form onSubmit={handleCreateOrUpdateUser} className="space-y-4 rounded-xl border border-line bg-panel2/10 p-5 lg:col-span-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text pb-1 border-b border-line/30">
            {editingUser ? 'Edit User Profile' : 'Create New User'}
          </h4>
          
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Full Name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Abdullah Ahmed"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Phone Number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+966..."
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">
              Email Address {editingUser ? '' : '*'}
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="abdullah@detasad.com"
              required={!editingUser}
              disabled={Boolean(editingUser)}
              className={cn(inputClass, "disabled:opacity-50 disabled:cursor-not-allowed")}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">
              Password {editingUser ? '(leave blank to keep unchanged)' : '*'}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editingUser ? 'Leave blank to keep unchanged' : '••••••••'}
              required={!editingUser}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted">Attached Role *</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={selectClass}
            >
              <option value="Admin">Admin</option>
              <option value="Cost Controller">Cost Controller</option>
              <option value="Project Manager">Project Manager</option>
              <option value="Viewer">Viewer</option>
            </select>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading || (isSupabaseConfigured && isServiceRoleKeyMissing)}
              className="flex-1 rounded-lg bg-accent text-white px-4 py-2.5 text-xs font-semibold shadow hover:bg-accent-hover active:scale-[0.98] transition disabled:opacity-50 disabled:hover:bg-accent"
            >
              {loading ? (editingUser ? 'Saving...' : 'Creating...') : (editingUser ? 'Save Changes' : 'Create User')}
            </button>
            {editingUser && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-xs font-semibold text-text hover:bg-panel2/80 transition"
              >
                Cancel
              </button>
            )}
          </div>

          {message && <p className="text-center text-xs font-semibold text-success bg-success/5 border border-success/15 py-2 px-3 rounded-lg mt-2">{message}</p>}
          {errorMsg && <p className="text-center text-xs font-semibold text-danger bg-danger/5 border border-danger/15 py-2 px-3 rounded-lg mt-2">{errorMsg}</p>}
        </form>

        {/* Users List Table */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Active System Users</h4>
          {fetchLoading ? (
            <div className="text-center py-12 text-xs font-semibold text-muted">Loading user accounts...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-xs font-semibold text-muted border border-dashed border-line rounded-xl">
              No users found. Create your first user profile using the form.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-panel2/10 shadow-sm">
              <table className="w-full border-collapse text-left text-xs text-text">
                <thead>
                  <tr className="border-b border-line bg-panel2/40">
                    <th className="px-4 py-3.5 font-bold uppercase tracking-[0.12em] text-muted/90">User Details</th>
                    <th className="px-4 py-3.5 font-bold uppercase tracking-[0.12em] text-muted/90">System Role</th>
                    <th className="px-4 py-3.5 font-bold uppercase tracking-[0.12em] text-muted/90">Created</th>
                    <th className="px-4 py-3.5 font-bold uppercase tracking-[0.12em] text-muted/90 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {users.map((user) => (
                    <tr key={user.user_id} className="hover:bg-panel2/20 transition-colors">
                      <td className="px-4 py-3.5 align-middle">
                        <div className="font-bold text-text">{user.full_name || 'No Name'}</div>
                        <div className="text-[11px] text-muted mt-0.5">{user.email}</div>
                        {user.phone ? <div className="text-[11px] text-muted">{user.phone}</div> : null}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <Badge
                          tone={
                            user.role === 'Admin'
                              ? 'accent'
                              : user.role === 'Cost Controller'
                                ? 'warning'
                                : user.role === 'Project Manager'
                                  ? 'success'
                                  : 'default'
                          }
                        >
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-[11px] font-semibold text-muted">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 align-middle text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(user)}
                            disabled={loading}
                            className="rounded-lg border border-line bg-panel/60 px-2.5 py-1.5 text-xs font-semibold text-text hover:bg-panel2/80 transition disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user.user_id)}
                            disabled={loading}
                            className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 transition disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none placeholder:text-muted/45 focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm";
const selectClass = "w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-text outline-none focus:border-accent focus:ring-1 focus:ring-accent transition shadow-sm cursor-pointer [&>option]:bg-bg [&>option]:text-text";

