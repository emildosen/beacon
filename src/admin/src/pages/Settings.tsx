import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AlertsConfig } from '../lib/types';

const severityLevels: AlertsConfig['minimumSeverity'][] = ['Low', 'Medium', 'High', 'Critical'];

export default function Settings() {
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<AlertsConfig | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (config && originalConfig) {
      const changed =
        config.webhookUrl !== originalConfig.webhookUrl ||
        config.minimumSeverity !== originalConfig.minimumSeverity ||
        config.enabled !== originalConfig.enabled;
      setHasChanges(changed);
    }
  }, [config, originalConfig]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.alertsConfig.get();
      setConfig(data);
      setOriginalConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      const updated = await api.alertsConfig.update(config);
      setConfig(updated);
      setOriginalConfig(updated);
      setToast({ type: 'success', message: 'Settings saved' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (originalConfig) {
      setConfig({ ...originalConfig });
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading settings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <p>{error}</p>
        <button className="btn btn-secondary" onClick={loadConfig}>
          Retry
        </button>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-description">Configure alert notifications</p>
        </div>
      </header>

      <div className="card settings-card">
        <div className="setting-group">
          <div className="setting-header">
            <h3>Notifications</h3>
            <p>Configure how and when you receive alerts</p>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <label className="setting-label">Enable Notifications</label>
              <p className="setting-description">
                Send alerts to the configured webhook
              </p>
            </div>
            <button
              className={`toggle ${config.enabled ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              aria-pressed={config.enabled}
            />
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <label className="setting-label">Minimum Severity</label>
              <p className="setting-description">
                Only send alerts at or above this severity level
              </p>
            </div>
            <select
              className="input select severity-select"
              value={config.minimumSeverity}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minimumSeverity: e.target.value as AlertsConfig['minimumSeverity'],
                })
              }
            >
              {severityLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-row stacked">
            <div className="setting-info">
              <label className="setting-label">Teams Webhook URL</label>
              <p className="setting-description">
                Microsoft Teams incoming webhook URL for alert notifications
              </p>
            </div>
            <input
              type="url"
              className="input"
              placeholder="https://outlook.office.com/webhook/..."
              value={config.webhookUrl}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
            />
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={!hasChanges || saving}
          >
            Reset
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? <span className="spinner" /> : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="card info-card">
        <h3>Webhook Setup</h3>
        <p>To receive alerts in Microsoft Teams:</p>
        <ol>
          <li>Open Microsoft Teams and navigate to the channel where you want alerts</li>
          <li>Click the three dots (...) next to the channel name</li>
          <li>Select <strong>Connectors</strong> (or <strong>Workflows</strong> in newer Teams)</li>
          <li>Find <strong>Incoming Webhook</strong> and click <strong>Configure</strong></li>
          <li>Give it a name (e.g., "Beacon Alerts") and copy the webhook URL</li>
          <li>Paste the URL above and save</li>
        </ol>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.message}</div>
      )}

      <style>{`
        .settings-page {
          max-width: 700px;
        }
        .page-header {
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
        .settings-card {
          margin-bottom: 1rem;
        }
        .setting-group {
          margin-bottom: 1.5rem;
        }
        .setting-header {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-color);
        }
        .setting-header h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        .setting-header p {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }
        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 0;
          border-bottom: 1px solid var(--border-color);
        }
        .setting-row:last-child {
          border-bottom: none;
        }
        .setting-row.stacked {
          flex-direction: column;
          align-items: stretch;
          gap: 0.75rem;
        }
        .setting-info {
          flex: 1;
        }
        .setting-label {
          font-weight: 500;
          margin-bottom: 0.125rem;
          display: block;
        }
        .setting-description {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .severity-select {
          width: 140px;
        }
        .settings-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }
        .info-card {
          background: var(--bg-tertiary);
        }
        .info-card h3 {
          font-size: 0.9375rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
        }
        .info-card p {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin-bottom: 0.75rem;
        }
        .info-card ol {
          color: var(--text-secondary);
          font-size: 0.875rem;
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .info-card strong {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
