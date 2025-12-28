import { useState } from 'react';
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from '@azure/msal-react';
import { loginRequest } from './lib/auth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Settings from './pages/Settings';
import RunHistory from './pages/RunHistory';

type Page = 'dashboard' | 'clients' | 'settings' | 'history';

function App() {
  const { instance } = useMsal();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  const handleLogin = () => {
    instance.loginRedirect(loginRequest);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'clients':
        return <Clients />;
      case 'settings':
        return <Settings />;
      case 'history':
        return <RunHistory />;
    }
  };

  return (
    <>
      <AuthenticatedTemplate>
        <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
          {renderPage()}
        </Layout>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <div className="login-container">
          <div className="login-card">
            <div className="login-logo">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <h1>Beacon Admin</h1>
            <p>Sign in to manage your M365 security monitoring</p>
            <button className="btn btn-primary login-btn" onClick={handleLogin}>
              Sign in with Microsoft
            </button>
          </div>
        </div>
        <style>{`
          .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }
          .login-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 2.5rem;
            text-align: center;
            max-width: 360px;
            width: 100%;
          }
          .login-logo {
            color: var(--accent);
            margin-bottom: 1.5rem;
          }
          .login-card h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
          }
          .login-card p {
            color: var(--text-secondary);
            font-size: 0.875rem;
            margin-bottom: 2rem;
          }
          .login-btn {
            width: 100%;
            padding: 0.75rem 1.5rem;
          }
        `}</style>
      </UnauthenticatedTemplate>
    </>
  );
}

export default App;
