# Beacon

Beacon is an Azure Functions app that polls Microsoft 365 APIs for security events, evaluates them against configurable rules, and writes alerts to Azure Log Analytics. Designed for MSPs managing multiple Microsoft 365 tenants.

This is a self-hosted solution that lives in your own tenant. Every tenant you wish to monitor must consent to the app registration you create.

### Documentation
See the full documentation here: [beacon365.dev](https://beacon365.dev)