# Configuring Alerts

Alert settings are stored in Azure Table Storage (`AlertsConfig` table).

## Using Azure Storage Explorer

1. Open Azure Storage Explorer
2. Navigate to **Storage Account → Tables → AlertsConfig**
3. Edit the existing `alerts` row:

| Field | Value |
|-------|-------|
| PartitionKey | `config` |
| RowKey | `alerts` |
| webhookUrl | Teams webhook URL |
| minimumSeverity | `Critical`, `High`, `Medium`, or `Low` |
| enabled | `true` or `false` |

## Getting a Teams Webhook URL

1. In Teams, go to the channel for alerts
2. Click **⋯ → Connectors → Incoming Webhook**
3. Name it "Beacon Alerts" and copy the URL

## Example

```
PartitionKey: config
RowKey: alerts
webhookUrl: https://outlook.office.com/webhook/...
minimumSeverity: Medium
enabled: true
```
