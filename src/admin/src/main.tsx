import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { initializeAuth, getMsalInstance } from './lib/auth';
import App from './App';
import './index.css';

initializeAuth()
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <MsalProvider instance={getMsalInstance()}>
          <App />
        </MsalProvider>
      </StrictMode>
    );
  })
  .catch((error) => {
    console.error('Failed to initialize auth:', error);
    document.getElementById('root')!.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ef4444;">
        <h1>Configuration Error</h1>
        <p>Failed to load authentication configuration.</p>
        <p style="font-size: 0.875rem; color: #888;">${error.message}</p>
      </div>
    `;
  });
