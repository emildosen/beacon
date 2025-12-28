# Adding Clients

Clients are managed in Azure Table Storage (`Clients` table).

## Using Azure Storage Explorer

1. Open Azure Storage Explorer
2. Navigate to **Storage Account → Tables → Clients**
3. Click **Add Entity**
4. Fill in the fields:

| Field | Value |
|-------|-------|
| PartitionKey | `client` |
| RowKey | Tenant ID (GUID) |
| name | Client display name |

Leave `lastPoll`, `status`, and `statusMessage` empty — they're updated automatically.

## Example

```
PartitionKey: client
RowKey: d5d11700-4c7c-463f-83e3-c6f26e4502c8
name: Contoso Corp
```

::: tip
The placeholder row (`00000000-0000-0000-0000-000000000000`) is for schema visibility. Don't delete it.
:::
