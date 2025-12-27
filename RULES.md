### Example rule
Rule path and filename acts as the 'ID'.

```json
  {
    "name": "Admin role assigned",
    "description": "User added to an administrative role",
    "severity": "high",
    "enabled": true,

    "mitre": {
      "tactic": "Persistence",
      "technique": "T1098",
      "subtechnique": "T1098.001"
    },

    "source": "AuditLog",
    "conditions": {
      "match": "all",
      "rules": [
        { "field": "Operation", "operator": "equals", "value": "Add member to role" },
        { "field": "ModifiedProperties.Role.NewValue", "operator": "contains", "value": "Admin" }
      ]
    },

    "exceptions": [
      { "field": "InitiatedBy.User.UserPrincipalName", "operator": "equals", "value": "automation@contoso.com" }
    ],

    "meta": {
      "author": "ed",
      "created": "2025-12-15",
      "references": ["https://learn.microsoft.com/..."]
    }
  }
```