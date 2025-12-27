# Debugging Rules

You can test the rule engine locally against exported logs without waiting for live data.

## Exporting Logs from Graph Explorer

1. Open the [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer)
2. Sign in with your M365 account (user icon in the top right corner)
3. Run one of these queries:

```
# Sign-in logs (GET)
https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=50

# Security alerts (GET)
https://graph.microsoft.com/v2.0/security/alerts_v2?$top=50
```

4. Copy the JSON response and save to `test-data/signins.json` (or similar)

The `test-data/` directory is gitignored to prevent committing sensitive logs.

## Running the Test Tool

```bash
npm run test-rules -- ./test-data/signins.json
```

For tenant-scoped rules, pass the tenant ID:

```bash
npm run test-rules -- ./test-data/signins.json --tenant 00000000-0000-0000-0000-000000000000
```

The tool will:
- Auto-detect the event source type (SignIn, SecurityAlert, or AuditLog)
- Evaluate each event against all enabled rules
- Print matches with rule name, severity, and conditions

## Debugging Tips

- **No matches?** Check that rules are enabled and match the detected source type
- **Tenant-scoped rules not matching?** Use `--tenant <id>` to test rules that have `tenantIds` specified
- **Wrong source type?** The tool detects source based on event structure, verify you're testing the correct type
