# Security Policy

> This document defines the security baseline for Samba 4 AD Manager. **Required reading for all contributors.**

---

## 1. Secrets Management

### 1.1 Absolute Rules
```
🚫 Secrets (AD admin password, LDAP bind DN/password, API keys) must never be hardcoded in source code.
🚫 .env files must never be committed to git.
🚫 Secrets must never be shared in plain text via Slack, email, or chat.
```

### 1.2 Production Secret Management

```bash
# systemd service environment file (chmod 600 required)
sudo nano /etc/samba4-ad/backend.env
# Contents:
# LDAP_BIND_DN=CN=Administrator,CN=Users,DC=example,DC=lan
# LDAP_PASSWORD=<strong-password>
# JWT_SECRET=<random-64-char-hex>
# ADMIN_PASSWORD=<strong-password>

# Set permissions
sudo chmod 600 /etc/samba4-ad/backend.env
sudo chown samba4-ad:samba4-ad /etc/samba4-ad/backend.env
```

```ini
# Load environment file in systemd service
# /etc/systemd/system/samba4-ad-backend.service
[Service]
EnvironmentFile=/etc/samba4-ad/backend.env
```

### 1.3 Local Development
```bash
# .env file (local dev only, included in .gitignore)
LDAP_BIND_DN=CN=Administrator,CN=Users,DC=test,DC=lan
LDAP_PASSWORD=dev-only-password
JWT_SECRET=dev-only-secret-change-in-production
```

### 1.4 Secret Rotation
| Secret Type | Rotation Cycle | Owner |
|------------|---------------|-------|
| AD Domain Admin password | Quarterly | Security Officer |
| LDAP service account password | Semi-annually | Tech Lead |
| JWT signing key | Monthly (auto) | System |
| nginx TLS certificate | Let's Encrypt auto-renew (90 days) | System |
| SSH access key | Semi-annually | Security Officer |

### 1.5 Secret Leak Response
**On discovering a leak:**
1. Immediately revoke the leaked secret (change AD password, revoke key)
2. Issue new secret and replace
3. Clean git history with `git filter-branch` or BFG
4. Report to Security Officer
5. Write Postmortem (impact analysis)

---

## 2. Vulnerability Management

### 2.1 Dependency Scanning
```bash
# Python dependency audit (auto-run in CI on every PR)
pip-audit

# Node.js dependency audit
npm audit --audit-level=moderate

# Severity criteria
CRITICAL → Fix immediately (blocks deployment)
HIGH     → Fix within 24 hours
MODERATE → Fix within 1 week
LOW      → Next sprint
```

### 2.2 Responsible Disclosure

**If you discover a vulnerability:**
1. Do **not** post a public GitHub Issue — create a Private Security Advisory
2. Or email `security@[domain]`
3. Acknowledgment within 48 hours
4. Fix or mitigation plan within 90 days

---

## 3. PII & Data Protection

### 3.1 Data Classification
| Level | Data | Storage | Encryption | Access |
|-------|------|---------|------------|--------|
| **L1 Critical** | AD admin password, krb5 keytab | systemd EnvironmentFile | File permission 600 | Security Officer |
| **L2 Sensitive** | User name, email, department, title | Samba AD LDAP | NTLMv2/Kerberos | Maintainer+ |
| **L3 Internal** | Login history, group memberships | Samba AD LDAP | at-rest (NTFS ACL) | Contributor+ |
| **L4 Public** | Domain name, OU structure | Samba AD LDAP | — | Everyone |

### 3.2 PII Handling Rules
- **Minimum collection**: Collect only data needed for AD management
- **Purpose limitation**: Use only for the collected purpose (identity management)
- **Retention period**: AD user accounts retained for 90 days after deactivation, then deleted
- **Anonymization**: Remove identifying information from statistical/analytical data
- **Right to deletion**: Deactivate and delete AD account on user request

### 3.3 Logging Rules
```python
# ❌ NEVER log these
logger.info("user password", {"password": password})          # Password
logger.info("ldap bind", {"bind_dn": dn, "password": pwd})    # LDAP password
logger.info("user data", {"email": email, "phone": phone})    # PII

# ✅ Safe logging
logger.info("user created", {"username": username})           # ID only
logger.error("ldap operation failed", {
    "operation": "add_user",
    "error_code": error.code,
    # Only LDAP error codes in errorMessage
})
```

---

## 4. Authentication & Authorization

### 4.1 Authentication
- **Admin Web UI**: JWT (HS256, 1-hour expiry, 7-day refresh token)
- **Backend → LDAP**: Service account binding (TLS required)
- **API Client**: Bearer Token (JWT)
- **SSH**: Public key authentication (password login disabled)

### 4.2 Authorization (RBAC)
```
Domain Admin    → Full AD management (users, groups, OUs, GPOs, domain settings)
Helpdesk        → User management (create/modify/disable), password reset
Read-Only       → View only (dashboard, reports)
Service Account → LDAP binding only (API server → AD DC)
```

### 4.3 API Security
- **Rate Limiting** on all endpoints (nginx `limit_req`)
- CORS: Only allowed domains (production frontend domain)
- HTTPS enforced (nginx TLS, HSTS)
- `Content-Security-Policy` header required
- LDAP connections require **StartTLS or LDAPS**

---

## 5. Infrastructure Security

### 5.1 Samba AD DC Server
- **OS**: Ubuntu 22.04 LTS (regular security updates)
- **Firewall**: UFW — only required ports open
  ```
  53/tcp,udp    # DNS
  88/tcp,udp    # Kerberos
  135/tcp       # RPC
  139/tcp       # NetBIOS
  389/tcp,udp   # LDAP
  445/tcp       # SMB
  464/tcp,udp   # Kerberos kpasswd
  636/tcp       # LDAPS
  3268/tcp      # Global Catalog
  3269/tcp      # Global Catalog SSL
  ```
- **SSH**: Public key auth only, root login disabled, non-standard port recommended

### 5.2 LDAP Communication Security
- LDAP traffic encryption: **LDAPS (636) or StartTLS** required
- Plaintext LDAP (389) only within local network (not recommended)
- Use service account for LDAP binding (do not use Administrator directly)

### 5.3 FastAPI Backend Security
- Run uvicorn/gunicorn as non-root user (systemd service)
- Per-request timeout: 30 seconds (prevent LDAP query overload)
- File upload limit: 10MB
- `X-Forwarded-For` header trust only when behind nginx

### 5.4 nginx Reverse Proxy
- TLS 1.2+ enforced (1.3 recommended)
- HSTS, X-Frame-Options, X-Content-Type-Options headers
- WebSocket proxy (for FastAPI real-time communication)
- Static file serving (React build output)

---

## 6. AD Domain Security Best Practices

### 6.1 Account Policy
- Password complexity: minimum 12 chars, upper/lower/number/special
- Password max age: 90 days
- Account lockout threshold: 5 failed attempts → 30-minute lockout
- Service account passwords: 30+ chars (when set to never expire)

### 6.2 Group Policy (GPO) Security Recommendations
- Consider renaming the "Administrator" account
- Restrict local admin group (Restricted Groups GPO)
- Centrally manage Windows Firewall policy
- Manage PowerShell execution policy

### 6.3 Backup
- AD database backup: daily automatic (samba-tool backup)
- SysVol backup: daily automatic
- Backup verification: weekly restore test

---

## 7. Security Checklist (For PR Authors)

Before submitting a PR:

- [ ] No hardcoded secrets/keys/passwords
- [ ] `.env` file not included in commit
- [ ] User input validation (Pydantic schema)
- [ ] LDAP injection prevention (ldap3 parameterized queries)
- [ ] XSS prevention (React default escaping + DOMPurify)
- [ ] Authentication/authorization checked on all endpoints
- [ ] Rate limiting applied (new APIs)
- [ ] No sensitive info in error messages
- [ ] No PII in logs
- [ ] Dependency security scan passed (`pip-audit`, `npm audit`)
- [ ] License compatibility checked for new dependencies

---

## 8. Contact

| Role | Contact | Purpose |
|------|---------|---------|
| Security Officer | `security@[domain]` | Vulnerability reports, security inquiries |
| GitHub Security Advisory | Private advisory | Vulnerability reports (GitHub) |

> Never post security-related inquiries to public channels (Issues, Discussions).
