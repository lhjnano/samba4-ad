# IAM — Identity, Access Management & Audit

> Samba AD Manager implements an AWS IAM-inspired policy-based access control
> (PBAC) model with always-on audit logging. This document covers the
> architecture, configuration, and operational guide for IAM features.

---

## Overview

```
Request → AuthMiddleware → PBACMiddleware → AuditMiddleware → Route Handler
             |                  |                  |
         validates JWT     checks policy      logs write ops
         sets user         may return 403     always-on
```

| Layer | Component | When Active | Purpose |
|-------|-----------|-------------|---------|
| **Authentication** | `AuthMiddleware` | Always | Validates JWT, extracts user identity |
| **Authorization** | `PBACMiddleware` | When `PBAC_ENABLED=true` | Evaluates policy documents per request |
| **Audit** | `AuditMiddleware` | Always (independent of PBAC) | Records all write operations to audit trail |

---

## Authentication

### Current Implementation

- **Protocol**: LDAP simple bind with StartTLS
- **Token**: JWT (HS256, 8-hour expiry)
- **Login**: `POST /api/v1/auth/login` with username + password
- **Token refresh**: `POST /api/v1/auth/refresh`

### Configuration

```ini
# /etc/samba-ad-manager/env
APP_MODE=ldap                    # mock (dev) or ldap (production)
LDAP_HOST=127.0.0.1
LDAP_PORT=389
LDAP_BIND_DN=CN=Administrator,CN=Users,DC=CORP,DC=LOCAL
LDAP_BIND_PASSWORD=YourPassword
LDAP_SEARCH_BASE=DC=CORP,DC=LOCAL
```

### Future Authentication Phases

| Phase | Feature | Status |
|-------|---------|--------|
| IAM-4 | MFA (TOTP via Google Authenticator) | Planned |
| IAM-5 | Kerberos SSO (SPNEGO) | Planned |

---

## Authorization — PBAC Engine

### How It Works

Policy-Based Access Control (PBAC) uses JSON policy documents to define
permissions. The evaluation follows AWS IAM semantics:

1. **Default Deny** — nothing is allowed unless explicitly granted
2. **Explicit Deny wins** — a single `Deny` statement overrides all `Allow`
3. **Allow accumulation** — multiple `Allow` statements are combined

### Policy Document Format

```json
{
  "version": "2026-06-20",
  "statement": [
    {
      "sid": "AllowUserManagement",
      "effect": "Allow",
      "action": [
        "users:List", "users:Read", "users:Create", "users:Update",
        "users:ResetPassword", "users:SetStatus"
      ],
      "resource": ["*"]
    },
    {
      "sid": "DenyDeleteAdmin",
      "effect": "Deny",
      "action": ["users:Delete"],
      "resource": ["cn=Administrator,cn=Users,*"]
    }
  ]
}
```

### Action Taxonomy

Actions follow `{resource}:{operation}` naming:

| Resource | Operations |
|----------|-----------|
| `users` | List, Read, Create, Update, Delete, ResetPassword, SetStatus, Unlock |
| `groups` | List, Read, Create, Update, Delete, AddMember, RemoveMember |
| `computers` | List, Read, SetStatus, Reset, Delete |
| `ous` | List, Read, Create, Update, Delete, LinkGPO, UnlinkGPO |
| `gpos` | List, Read, Create, Delete, SetStatus, Link, Unlink |
| `dns` | ListZones, ListRecords, AddRecord, DeleteRecord |
| `policies` | Read, Update |
| `domain` | Read, GetInfo, GetFsmo, GetHealth |
| `logs` | Read |
| `settings` | Read, Update |
| `iam` | ListPolicies, CreatePolicy, AttachPolicy, DetachPolicy |

Wildcard `*` matches any action or resource:
- `users:*` — all user operations
- `*:Read` — read operations on all resources
- `*` on resource — all resources

### Resource Patterns

Resources use LDAP distinguished names with wildcards:

| Pattern | Matches |
|---------|---------|
| `*` | All resources |
| `ou=Sales,DC=corp,DC=local` | Exactly this OU |
| `ou=*,DC=corp,DC=local` | Any top-level OU |
| `cn=Administrator,cn=Users,*` | Administrator account in any domain |

### Built-in System Policies

Located in `/etc/samba-ad-manager/policies/system/`:

| Policy | Permissions | Intended For |
|--------|-------------|--------------|
| `super-admin.json` | Full access (`*`) | Domain Admins |
| `user-admin.json` | User/group management (no delete on Administrator) | Help Desk |
| `auditor.json` | Read-only on everything + logs | Auditors |
| `viewer.json` | Dashboard + domain info only | Default |

### Policy Assignment

Assignments map AD groups/users to policy files via
`/etc/samba-ad-manager/policies/assignments.json`:

```json
{
  "group_assignments": {
    "CN=Domain Admins,CN=Users,DC=corp,DC=local": ["system/super-admin.json"],
    "CN=Help Desk,CN=Users,DC=corp,DC=local": ["system/user-admin.json"],
    "CN=Domain Auditors,CN=Users,DC=corp,DC=local": ["system/auditor.json"]
  },
  "user_assignments": {},
  "default_policy": "system/viewer.json"
}
```

**Safety net**: Members of `Domain Admins` always get `super-admin.json`
even if `assignments.json` is not configured.

### Enabling PBAC

```ini
# /etc/samba-ad-manager/env
PBAC_ENABLED=true
PBAC_POLICY_DIR=/etc/samba-ad-manager/policies
PBAC_SUPER_ADMIN_GROUP=Domain Admins
PBAC_DEFAULT_POLICY=system/viewer.json
```

When `PBAC_ENABLED=false` (default), all authenticated users have full
access — backward compatible with pre-PBAC behavior.

### IAM API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/iam/policies` | GET | List all loaded policies |
| `/api/v1/iam/assignments` | GET | View group/user → policy mappings |
| `/api/v1/iam/eval` | POST | Evaluate permission for current user |

**Example**: Check if current user can delete users:

```bash
POST /api/v1/iam/eval
{"action": "users:Delete", "resource": "*"}

Response:
{"allowed": true, "matched_policy": "system/super-admin.json"}
```

---

## Audit Logging

### Design Principles

1. **Always on** — independent of PBAC; runs even when PBAC is disabled
2. **Never fails** — audit logging is best-effort; never blocks requests
3. **Append-only** — entries cannot be modified or deleted via API
4. **Configurable retention** — default 90 days, auto-purged periodically
5. **Structured** — JSON entries with typed fields, queryable via API

### What Gets Audited

| Event | Action | Severity |
|-------|--------|----------|
| Login success | `auth:LoginSuccess` | info |
| Login failure | `auth:LoginFailed` | warning |
| User created | `users:Create` | info |
| User deleted | `users:Delete` | critical |
| Password reset | `users:ResetPassword` | critical |
| Status changed | `users:SetStatus` | warning |
| Group member modified | `groups:ModifyMember` | info |
| Computer removed | `computers:Delete` | warning |
| DNS record modified | `dns:ModifyRecord` | info |
| GPO created/deleted | `gpos:Create` / `gpos:Delete` | info / warning |
| Policy changed | `policies:Update` | critical |
| Domain provisioned | `setup:Provision` | critical |

Read operations (GET) are **not** audited to reduce noise.

### Audit Entry Schema

```json
{
  "audit": true,
  "timestamp": "2026-06-21T00:30:00.123456+00:00",
  "actor": "Administrator",
  "actor_ip": "192.168.61.39",
  "action": "users:Delete",
  "resource_type": "user",
  "resource_id": "/api/v1/users/Q049dGVzdHVzZXI...",
  "decision": "ALLOW",
  "before": null,
  "after": null,
  "severity": "critical",
  "detail": "HTTP 204"
}
```

### Configuration

```ini
# /etc/samba-ad-manager/env
AUDIT_LOG_PATH=/var/log/samba-ad-manager/audit.log
AUDIT_RETENTION_DAYS=90
```

| Setting | Default | Description |
|---------|---------|-------------|
| `AUDIT_LOG_PATH` | `/var/log/samba-ad-manager/audit.log` | Audit log file path |
| `AUDIT_RETENTION_DAYS` | `90` | Days to retain entries (auto-purge) |

**Compliance retention recommendations**:

| Standard | Recommended |
|----------|-------------|
| SOC 2 / ISO 27001 / PCI DSS | `365` |
| GDPR (data minimization) | `90` |
| Internal default | `90` |

### Querying Audit Logs

```bash
# All critical events
GET /api/v1/logs/audit?severity=critical

# All actions by a specific user
GET /api/v1/logs/audit?actor=helpdesk01

# All user deletions
GET /api/v1/logs/audit?action=users:Delete

# Full-text search
GET /api/v1/logs/audit?q=ResetPassword
```

### Log Rotation (optional)

For high-volume environments, add `/etc/logrotate.d/samba-ad-manager-audit`:

```
/var/log/samba-ad-manager/audit.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

---

## Configuration Summary

All IAM settings in `/etc/samba-ad-manager/env`:

```ini
# Authentication
APP_MODE=ldap
LDAP_HOST=127.0.0.1
LDAP_PORT=389
LDAP_BIND_DN=CN=Administrator,CN=Users,DC=CORP,DC=LOCAL
LDAP_BIND_PASSWORD=YourPassword
LDAP_SEARCH_BASE=DC=CORP,DC=LOCAL

# Authorization (PBAC)
PBAC_ENABLED=false
PBAC_POLICY_DIR=/etc/samba-ad-manager/policies
PBAC_SUPER_ADMIN_GROUP=Domain Admins
PBAC_DEFAULT_POLICY=system/viewer.json

# Audit (always-on)
AUDIT_LOG_PATH=/var/log/samba-ad-manager/audit.log
AUDIT_RETENTION_DAYS=90
```

---

## File Locations

| Path | Description |
|------|-------------|
| `/etc/samba-ad-manager/env` | Main configuration |
| `/etc/samba-ad-manager/policies/system/` | Built-in policy JSON files |
| `/etc/samba-ad-manager/policies/custom/` | User-created policies |
| `/etc/samba-ad-manager/policies/assignments.json` | Group/user → policy mapping |
| `/var/log/samba-ad-manager/audit.log` | Audit trail (append-only) |

---

## Source Code Reference

| File | Description |
|------|-------------|
| `backend/src/core/auth.py` | JWT authentication, `verify_credentials()` |
| `backend/src/core/pbac.py` | Policy engine (`PolicyEngine`, wildcard matching) |
| `backend/src/core/pbac_middleware.py` | HTTP middleware for PBAC enforcement |
| `backend/src/core/audit.py` | Audit logger (file persistence, retention) |
| `backend/src/core/audit_middleware.py` | HTTP middleware for audit logging |
| `backend/src/core/config.py` | IAM-related settings |
| `backend/src/api/auth.py` | Login/refresh endpoints with audit |
| `backend/src/api/iam.py` | IAM API (policy list, evaluation) |
| `backend/src/api/logs.py` | Logs + audit query endpoints |
| `policies/system/` | Built-in policy templates |
