import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Client, RunHistoryEntry } from '../lib/types';
import { formatRelativeTime, formatDuration } from '../lib/utils';

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [clientsData, runsData] = await Promise.all([
        api.clients.list(),
        api.runs.list(10),
      ]);
      setClients(clientsData);
      setRuns(runsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const healthyClients = clients.filter((c) => c.status === 'success').length;
  const lastRun = runs[0];
  const totalAlerts = runs.slice(0, 10).reduce((sum, r) => sum + r.alertsGenerated, 0);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={loadData}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>Dashboard</h1>
        <button className="btn btn-secondary btn-sm" onClick={loadData}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          Refresh
        </button>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon clients-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 21a8 8 0 0 0-16 0" />
              <circle cx="10" cy="8" r="4" />
              <circle cx="18" cy="8" r="3" />
              <path d="M22 21a6 6 0 0 0-6-6" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{clients.length}</span>
            <span className="stat-label">Total Clients</span>
          </div>
          <div className="stat-meta">
            <span className={healthyClients === clients.length ? 'text-success' : 'text-warning'}>
              {healthyClients} healthy
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon time-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">
              {lastRun ? formatRelativeTime(lastRun.startTime) : 'Never'}
            </span>
            <span className="stat-label">Last Poll</span>
          </div>
          {lastRun && (
            <div className="stat-meta">
              <span className={`badge badge-${lastRun.status === 'success' ? 'success' : lastRun.status === 'partial' ? 'warning' : 'error'}`}>
                <span className="dot" />
                {lastRun.status}
              </span>
            </div>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-icon alerts-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalAlerts}</span>
            <span className="stat-label">Recent Alerts</span>
          </div>
          <div className="stat-meta">
            <span className="text-muted">Last 10 runs</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon events-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="stat-content">
            <span className="stat-value">
              {runs.slice(0, 10).reduce((sum, r) => sum + r.eventsProcessed, 0).toLocaleString()}
            </span>
            <span className="stat-label">Events Processed</span>
          </div>
          <div className="stat-meta">
            <span className="text-muted">Last 10 runs</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Client Status</h2>
          </div>
          {clients.length === 0 ? (
            <div className="empty-state">
              <p>No clients configured</p>
            </div>
          ) : (
            <div className="client-list">
              {clients.slice(0, 5).map((client) => (
                <div key={client.tenantId} className="client-row">
                  <div className="client-info">
                    <span className="client-name">{client.name}</span>
                    {client.lastPoll && (
                      <span className="client-poll">
                        Last poll: {formatRelativeTime(client.lastPoll)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`badge badge-${
                      client.status === 'success' ? 'success' :
                      client.status === 'auditLogDisabled' || client.status === 'appNotConsented' ? 'warning' :
                      client.status ? 'error' : 'neutral'
                    }`}
                    title={client.statusMessage}
                  >
                    <span className="dot" />
                    {client.status || 'pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Runs</h2>
          </div>
          {runs.length === 0 ? (
            <div className="empty-state">
              <p>No runs yet</p>
            </div>
          ) : (
            <div className="runs-list">
              {runs.slice(0, 5).map((run, i) => (
                <div key={i} className="run-row">
                  <div className="run-info">
                    <span className="run-time">{formatRelativeTime(run.startTime)}</span>
                    <span className="run-duration">{formatDuration(run.durationMs)}</span>
                  </div>
                  <div className="run-stats">
                    <span>{run.eventsProcessed} events</span>
                    <span>{run.alertsGenerated} alerts</span>
                  </div>
                  <span
                    className={`badge badge-${run.status === 'success' ? 'success' : run.status === 'partial' ? 'warning' : 'error'}`}
                    title={run.errorMessage}
                  >
                    <span className="dot" />
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .dashboard {
          max-width: 1000px;
        }
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
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
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .stat-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .clients-icon {
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent);
        }
        .time-icon {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }
        .alerts-icon {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
        }
        .events-icon {
          background: rgba(239, 68, 68, 0.15);
          color: var(--error);
        }
        .stat-value {
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1;
        }
        .stat-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .stat-meta {
          font-size: 0.8125rem;
        }
        .text-success {
          color: var(--success);
        }
        .text-warning {
          color: var(--warning);
        }
        .text-muted {
          color: var(--text-muted);
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
          gap: 1rem;
        }
        .client-list, .runs-list {
          display: flex;
          flex-direction: column;
        }
        .client-row, .run-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border-color);
        }
        .client-row:last-child, .run-row:last-child {
          border-bottom: none;
        }
        .client-info, .run-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }
        .client-name {
          font-weight: 500;
        }
        .client-poll, .run-duration {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .run-time {
          font-weight: 500;
        }
        .run-stats {
          display: flex;
          gap: 1rem;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
