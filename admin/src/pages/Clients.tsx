import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Client } from '../lib/types';
import { formatRelativeTime, isValidGuid } from '../lib/utils';

interface FormData {
  tenantId: string;
  name: string;
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<FormData>({ tenantId: '', name: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.clients.list();
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setFormData({ tenantId: '', name: '' });
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (client: Client) => {
    setFormData({ tenantId: client.tenantId, name: client.name });
    setFormError(null);
    setEditingClient(client);
  };

  const closeModals = () => {
    setShowAddModal(false);
    setEditingClient(null);
    setDeletingClient(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }

    if (showAddModal && !isValidGuid(formData.tenantId)) {
      setFormError('Invalid tenant ID format (must be a GUID)');
      return;
    }

    try {
      setSaving(true);
      if (editingClient) {
        await api.clients.update(editingClient.tenantId, { name: formData.name.trim() });
        setToast({ type: 'success', message: 'Client updated' });
      } else {
        await api.clients.create({
          tenantId: formData.tenantId.trim(),
          name: formData.name.trim(),
        });
        setToast({ type: 'success', message: 'Client added' });
      }
      closeModals();
      await loadClients();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingClient) return;

    try {
      setSaving(true);
      await api.clients.delete(deletingClient.tenantId);
      setToast({ type: 'success', message: 'Client deleted' });
      closeModals();
      await loadClients();
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadgeClass = (status?: Client['status']) => {
    if (!status) return 'badge-neutral';
    if (status === 'success') return 'badge-success';
    if (status === 'auditLogDisabled' || status === 'appNotConsented') return 'badge-warning';
    return 'badge-error';
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading clients...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={loadClients}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="clients-page">
      <header className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="page-description">Manage monitored M365 tenants</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Client
        </button>
      </header>

      <div className="card">
        {clients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 21a8 8 0 0 0-16 0" />
                <circle cx="10" cy="8" r="4" />
                <circle cx="18" cy="8" r="3" />
                <path d="M22 21a6 6 0 0 0-6-6" />
              </svg>
            </div>
            <p>No clients configured yet</p>
            <button className="btn btn-primary" onClick={openAddModal}>
              Add your first client
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tenant ID</th>
                  <th>Last Poll</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.tenantId}>
                    <td className="client-name-cell">{client.name}</td>
                    <td className="tenant-id-cell">
                      <code>{client.tenantId}</code>
                    </td>
                    <td>
                      {client.lastPoll ? formatRelativeTime(client.lastPoll) : '-'}
                    </td>
                    <td>
                      <span
                        className={`badge ${getStatusBadgeClass(client.status)}`}
                        title={client.statusMessage}
                      >
                        <span className="dot" />
                        {client.status || 'pending'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEditModal(client)}
                        title="Edit"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeletingClient(client)}
                        title="Delete"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showAddModal || editingClient) && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingClient ? 'Edit Client' : 'Add Client'}
              </h2>
              <button className="modal-close" onClick={closeModals}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              {!editingClient && (
                <div className="form-group">
                  <label className="form-label">Tenant ID</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={formData.tenantId}
                    onChange={(e) => setFormData({ ...formData, tenantId: e.target.value })}
                    disabled={saving}
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Contoso Corp"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={saving}
                />
              </div>
              {formError && <p className="form-error">{formError}</p>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModals} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : editingClient ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingClient && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Client</h2>
              <button className="modal-close" onClick={closeModals}>
                &times;
              </button>
            </div>
            <p className="delete-warning">
              Are you sure you want to delete <strong>{deletingClient.name}</strong>? This action cannot be undone.
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={closeModals} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}

      <style>{`
        .clients-page {
          max-width: 1000px;
        }
        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .page-description {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        .loading-state, .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 4rem;
          color: var(--text-secondary);
        }
        .client-name-cell {
          font-weight: 500;
        }
        .tenant-id-cell code {
          font-size: 0.75rem;
          background: var(--bg-tertiary);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .actions-cell {
          text-align: right;
          white-space: nowrap;
        }
        .form-error {
          color: var(--error);
          font-size: 0.875rem;
          margin-top: -0.5rem;
          margin-bottom: 1rem;
        }
        .delete-warning {
          color: var(--text-secondary);
          margin-bottom: 1.5rem;
        }
        .delete-warning strong {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
