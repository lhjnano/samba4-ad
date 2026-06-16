# Incident Response

> Manual to follow during production incidents. **Stay calm, follow the document, document everything.**

---

## 1. Severity Classification

| Level | Definition | Examples | Target Recovery | Escalation |
|-------|-----------|----------|----------------|------------|
| **SEV-1** | AD DC total outage | Domain login fails, LDAP unresponsive, AD database corruption | 30 min | Project Lead + page everyone |
| **SEV-2** | Core function outage | User creation fails, GPO deployment fails, admin UI inaccessible | 2 hours | Tech Lead |
| **SEV-3** | Partial outage | Specific OU search error, chart data missing, slow response | 4 hours | Assigned Maintainer |
| **SEV-4** | Minor issue | UI breakage, alignment error, minor display issue | 1 business day | Assigned person |

---

## 2. Response Process

### 2.1 SEV-1 / SEV-2 (Emergency)

```
Detection (alert/report)
  │
  ▼  (within 1 min)
① Create incident channel (#incident-YYYYMMDD)
  │ — All communication in this channel only
  │ — Start voice/video call
  │
  ▼  (within 5 min)
② Situation Assessment
  │ — Check Samba AD DC service status
  │ — Check FastAPI backend health
  │ — Assess impact scope (domain users, joined computers)
  │
  ▼  (within 10 min)
③ Initial Action Decision
  │ — Recent deploy caused it? → Immediate rollback
  │ — AD DC itself failed? → Restart Samba service / reboot VM
  │ — LDAP connection issue? → Check network/TLS certificate
  │ — User notification needed? → Notify admin group
  │
  ▼
④ Recovery Work
  │ — Create hotfix branch
  │ — Code review may be skipped (SEV-1 only, post-review required)
  │ — Deploy + verify
  │
  ▼  (after recovery)
⑤ Resolution Confirmation
  │ — Health check passes
  │ — Core functions verified (user search, group lookup, OU tree)
  │ — Post "✅ Resolved" in incident channel
  │
  ▼  (within 48 hours)
⑥ Write Postmortem
```

### 2.2 Rollback-First Principle
> **Restore service before finding the root cause.**

1. Did a recent deployment cause this? → **Immediate rollback**
2. Is an AD migration (schema change) involved? → **Restore from backup**
3. Is the Samba service down? → **Restart service / reboot VM**

---

## 3. Diagnostic Toolkit

### 3.1 Samba AD DC Status
```bash
# Samba service status
sudo systemctl status samba-ad-dc

# Domain controller info
sudo samba-tool domain info 127.0.0.1

# FSMO role check
sudo samba-tool fsmo show

# AD database integrity check
sudo samba-tool dbcheck

# SysVol replication status (multi-DC)
sudo samba-tool drs showrepl
```

### 3.2 FastAPI Backend Status
```bash
# Health check
curl -s http://localhost:8000/health | python -m json.tool

# systemd service status
sudo systemctl status samba4-ad-backend

# Backend logs (real-time)
sudo journalctl -u samba4-ad-backend -f

# nginx status
sudo systemctl status nginx
sudo nginx -t
```

### 3.3 LDAP Diagnostics
```bash
# LDAP connection test
ldapsearch -x -H ldaps://dc01.example.lan \
  -D "CN=Administrator,CN=Users,DC=example,DC=lan" \
  -W -b "DC=example,DC=lan" "(objectClass=domainDNS)"

# LDAP response time measurement
time ldapsearch -x -H ldaps://dc01.example.lan \
  -D "CN=svc-ldap,CN=Users,DC=example,DC=lan" \
  -W -b "DC=example,DC=lan" -s sub "(objectClass=user)" dn | tail -1

# Port connectivity check
nc -zv dc01.example.lan 636  # LDAPS
nc -zv dc01.example.lan 389  # LDAP
nc -zv dc01.example.lan 88   # Kerberos
```

### 3.4 Kerberos Diagnostics
```bash
# Ticket acquisition test
kinit Administrator@EXAMPLE.LAN

# Ticket check
klist

# Keytab check
klist -k /etc/krb5.keytab
```

### 3.5 System Resources
```bash
# CPU/Memory
htop

# Disk usage (AD database location)
df -h /var/lib/samba/

# Memory usage
free -h

# Network connections
ss -tlnp | grep -E '(389|636|88|445|53|135|139|464|3268|3269)'
```

---

## 4. Common Incident Scenarios

### 4.1 AD DC Unresponsive (SEV-1)

```
Symptom: Domain login fails, LDAP timeout
Possible causes:
  1. Samba service down → sudo systemctl restart samba-ad-dc
  2. Disk full → check df -h, clean logs
  3. Memory exhaustion → check free -h, check OOM (dmesg | grep oom)
  4. AD database corruption → restore from backup
Actions:
  1. sudo systemctl restart samba-ad-dc
  2. If fails: sudo samba-tool dbcheck --fix
  3. If fails: restore from backup (see §5)
  4. If power cycle needed: reboot VM
```

### 4.2 LDAP Authentication Failure (SEV-2)

```
Symptom: FastAPI login fails, "LDAP bind failed" error
Possible causes:
  1. Service account password expired/changed → verify and update password
  2. TLS certificate expired → check with openssl s_client -connect dc01:636
  3. Network firewall → check UFW rules
  4. Service account locked (cumulative failed logins) → unlock account
Actions:
  1. Check service account password: /etc/samba4-ad/backend.env
  2. Check account lockout: samba-tool user list (check status)
  3. Check TLS certificate: sudo openssl s_client -connect 127.0.0.1:636
```

### 4.3 FastAPI Backend Down (SEV-2)

```
Symptom: Admin UI shows 502 Bad Gateway
Possible causes:
  1. uvicorn/gunicorn process crash → check systemd auto-restart
  2. LDAP connection pool exhaustion → restart backend
  3. Python dependency issue → rebuild virtualenv
Actions:
  1. sudo systemctl restart samba4-ad-backend
  2. Check logs: sudo journalctl -u samba4-ad-backend -n 100
  3. If dependency issue: cd backend && pip install -e ".[dev]" && sudo systemctl restart samba4-ad-backend
```

---

## 5. AD Backup and Recovery

### 5.1 Backup
```bash
# AD database online backup
sudo samba-tool domain backup online --targetdir=/backup/ \
  --server=dc01

# SysVol backup
sudo tar -czf /backup/sysvol-$(date +%Y%m%d).tar.gz /var/lib/samba/sysvol/

# Full Samba directory backup (after stopping service)
sudo systemctl stop samba-ad-dc
sudo tar -czf /backup/samba-full-$(date +%Y%m%d).tar.gz /var/lib/samba/
sudo systemctl start samba-ad-dc
```

### 5.2 Recovery
```bash
# Restore domain from backup (single DC)
sudo systemctl stop samba-ad-dc
sudo rm -rf /var/lib/samba/private/*
sudo rm -rf /var/lib/samba/sysvol/*
sudo samba-tool domain backup restore \
  --backup-file=/backup/samba-full-YYYYMMDD.tar.gz \
  --newserver=dc01 --targetdir=/var/lib/samba
sudo systemctl start samba-ad-dc
```

---

## 6. Communication

### 6.1 Internal Communication
- **Incident channel** (Slack/Discord): `#incident-YYYYMMDD`
- Record all decisions in the channel
- Maintain timeline: "14:32 — Samba restarted", "14:35 — LDAP verified normal"

### 6.2 Admin Communication
| Stage | Action | Tool |
|-------|--------|------|
| On detection | Notify admin group ("Investigating AD DC issue") | Internal messenger |
| After 15 min | Announce impact scope | Internal messenger + email |
| After recovery | Resolution notice + apology | Email |

---

## 7. Postmortem

### 7.1 Timing
- **SEV-1/SEV-2**: Within 48 hours of recovery
- **SEV-3**: Within 1 week of recovery
- **SEV-4**: As needed

### 7.2 Postmortem Template

```markdown
# Postmortem: [Incident Title]

**Date:** 2024-XX-XX
**Severity:** SEV-X
**Impact:** [Number of affected users/functions]
**Recovery Time:** [Incident duration]
**Author:** [Name]

## Summary
[1-2 sentence summary]

## Timeline
- HH:MM — Incident detected via [detection method]
- HH:MM — Incident channel created
- HH:MM — Root cause identified: [cause]
- HH:MM — Action executed (restart/rollback/hotfix)
- HH:MM — Verified normal, resolved

## Root Cause
[Technical root cause analysis — 5-Whys technique recommended]

## Impact
- Users: ~N (X% of total)
- Duration: X hours X minutes
- Domain login impact: yes/no

## Resolution Process
[Detailed account of what was done]

## Action Items
| Action | Owner | Due Date | Issue |
|--------|-------|----------|-------|
| [Action item] | [Name] | [Date] | #NN |
| Add monitoring | [Name] | [Date] | #NN |
| Add test | [Name] | [Date] | #NN |

## Lessons Learned
[What went well / what didn't / what to do differently next time]
```

### 7.3 Postmortem Principles
- **Blameless**: Focus on systems/processes, not people
- **Everyone learns**: Share with the entire team
- **Actionable items**: Concrete tasks, not just lessons

---

## 8. On-Call

### 8.1 On-Call Rotation
- Weekly rotation (Maintainer or above)
- On SEV-1/SEV-2, on-call responder is first responder
- Backup: Tech Lead

### 8.2 On-Call Responsibilities
- Respond **within 15 minutes** of alert
- Assess situation and decide on escalation
- Create incident channel and coordinate

### 8.3 Alert Configuration
```
systemd monitoring (monitoring server)
  → samba-ad-dc service down
  → samba4-ad-backend service down
  → Disk usage > 85%

LDAP health check (cron + alert)
  → LDAP response time > 5 seconds
  → LDAP bind failure
```

---

## 9. Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| Project Lead | [TBD] | Slack/Phone |
| Tech Lead | [TBD] | Slack/Phone |
| Security Officer | [TBD] | Slack/Phone |
| Network Admin | [TBD] | Slack/Phone |
| Samba/SysAdmin | [TBD] | Slack/Phone |
