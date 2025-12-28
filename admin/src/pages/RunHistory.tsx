import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { RunHistoryEntry } from '../lib/types';
import { formatRelativeTime, formatDuration } from '../lib/utils';

export default function RunHistory() {
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    loadRuns();
  }, [limit]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadRuns, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, limit]);

  const loadRuns = async () => {
    try {
      if (!runs.length) setLoading(true);
      setError(null);
      const data = await api.runs.list(limit);
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status: RunHistoryEntry['status']) => {
    if (status === 'success') return 'badge-success';
    if (status === 'partial') return 'badge-warning';
    return 'badge-error';
  };

  const totalEvents = runs.reduce((sum, r) => sum + r.eventsProcessed, 0);
  const totalAlerts = runs.reduce((sum, r) => sum + r.alertsGenerated, 0);
  const avgDuration = runs.length
    ? Math.round(runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length)
    : 0;

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading run history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={loadRuns}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="history-page">
      <header className="page-header">
        <div>
          <h1>Run History</h1>
          <p className="page-description">Polling execution logs and statistics</p>
        </div>
        <div className="header-actions">
          <button
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Auto-refresh enabled (30s)' : 'Enable auto-refresh'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={autoRefresh ? 'spinning' : ''}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {autoRefresh ? 'Auto' : 'Auto'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadRuns}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{runs.length}</span>
          <span className="stat-label">Runs</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{totalEvents.toLocaleString()}</span>
          <span className="stat-label">Events</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{totalAlerts}</span>
          <span className="stat-label">Alerts</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <span className="stat-value">{formatDuration(avgDuration)}</span>
          <span className="stat-label">Avg Duration</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Execution Log</h2>
          <select
            className="input select limit-select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value="25">Last 25</option>
            <option value="50">Last 50</option>
            <option value="100">Last 100</option>
            <option value="200">Last 200</option>
          </select>
        </div>

        {runs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p>No runs recorded yet</p>
            <p className="empty-state-hint">Runs will appear here after the first poll executes</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Clients</th>
                  <th>Events</th>
                  <th>Alerts</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={i}>
                    <td>
                      <div className="time-cell">
                        <span className="time-relative">{formatRelativeTime(run.startTime)}</span>
                        <span className="time-absolute">
                          {new Date(run.startTime).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td>{formatDuration(run.durationMs)}</td>
                    <td>{run.clientsChecked}</td>
                    <td>{run.eventsProcessed.toLocaleString()}</td>
                    <td>
                      {run.alertsGenerated > 0 ? (
                        <span className="alerts-count">{run.alertsGenerated}</span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${getStatusClass(run.status)}`}
                        title={run.errorMessage}
                      >
                        <span className="dot" />
                        {run.status}
                      </span>
                      {run.errorMessage && (
                        <div className="error-tooltip" title={run.errorMessage}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .history-page {
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
        .header-actions {
          display: flex;
          gap: 0.5rem;
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
        .stats-bar {
          display: flex;
          align-items: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1rem 1.5rem;
          margin-bottom: 1rem;
          gap: 1.5rem;
        }
        .stat-item {
          display: flex;
          flex-direction: column;
        }
        .stat-item .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
        }
        .stat-item .stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-divider {
          width: 1px;
          height: 32px;
          background: var(--border-color);
        }
        .limit-select {
          width: 120px;
        }
        .time-cell {
          display: flex;
          flex-direction: column;
        }
        .time-relative {
          font-weight: 500;
        }
        .time-absolute {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .alerts-count {
          background: rgba(245, 158, 11, 0.15);
          color: var(--warning);
          padding: 0.125rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 500;
        }
        .text-muted {
          color: var(--text-muted);
        }
        .error-tooltip {
          display: inline-flex;
          margin-left: 0.5rem;
          color: var(--error);
          cursor: help;
        }
        .empty-state-hint {
          font-size: 0.8125rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
