# Beacon Admin Portal

Web interface for managing Beacon clients and alert configuration.

## Development

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build
```

## Local Development with SWA CLI

To test with the Azure Static Web Apps CLI:

```bash
# Install SWA CLI globally
npm install -g @azure/static-web-apps-cli

# Start SWA CLI (runs on http://localhost:4280)
swa start http://localhost:5173 --api-location ../
```

## Configuration

The SPA requires the following environment variables (typically injected at build time or via a config file):

- `VITE_CLIENT_ID` - Azure AD App Registration Client ID (SPA)
- `VITE_TENANT_ID` - Azure AD Tenant ID
- `VITE_API_URL` - Function App URL (e.g., https://beacon-func-xxx.azurewebsites.net)

## Authentication

- Uses MSAL.js for Azure AD authentication
- Only users in the "Beacon Admins" security group can access the portal
- Tokens are validated by the Function App API

## API Endpoints

The admin portal calls these Function App endpoints:

- `GET/POST/PUT/DELETE /api/clients` - Manage client tenants
- `GET/PUT /api/alerts-config` - Manage alert configuration
- `GET /api/runs` - View polling run history
