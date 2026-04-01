# Debugging Rules

You can test the rule engine locally against real logs without waiting for live alerts.

## Downloading Logs

Use `download-logs` to fetch the same audit logs the poller checks, for the last hour:

```bash
npm run download-logs -- <tenant-id>
```

This downloads all 5 event sources (audit events, directory audits, sign-ins, security alerts, risk detections) and saves them as separate JSON files in `test-data/`.

Requires `CLIENT_ID` and `CLIENT_SECRET` in `local.settings.json`.

The `test-data/` directory is gitignored to prevent committing sensitive logs.

## Running the Test Tool

Run rules against the downloaded logs:

```bash
npm run test-rules -- ./test-data/audit-events.json
npm run test-rules -- ./test-data/directory-audits.json
npm run test-rules -- ./test-data/sign-ins.json
```

For tenant-scoped rules, pass the tenant ID:

```bash
npm run test-rules -- ./test-data/audit-events.json --tenant 00000000-0000-0000-0000-000000000000
```

The tool will:
- Auto-detect the event source type (SignIn, SecurityAlert, or AuditLog)
- Evaluate each event against all enabled rules
- Print matches with rule name, severity, and conditions

## Debugging Tips

- **No matches?** Check that rules are enabled and match the detected source type
- **Tenant-scoped rules not matching?** Use `--tenant <id>` to test rules that have `tenantIds` specified
- **Wrong source type?** The tool detects source based on event structure, verify you're testing the correct type
