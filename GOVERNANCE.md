# Governance

> Required reading for all contributors. This document defines the governance framework for safe development and operation of Samba 4 AD Manager.

---

## 1. Roles

| Role | Authority | Responsibilities |
|------|-----------|-----------------|
| **Project Lead** | Final decision, production deployment | Vision, roadmap, resource allocation, final architecture decisions |
| **Tech Lead** | Technical decisions, PR merge | Architecture review, ADR authoring, technical debt management |
| **Maintainer** | PR merge (assigned area) | Code review, bug fixes, documentation maintenance |
| **Contributor** | Submit PRs | Feature development, bug reports, documentation improvements |
| **Security Officer** | Security veto | Secret management audit, vulnerability response, AD security policy |

### 1.1 Role Progression
- **Contributor → Maintainer**: 10+ merged PRs + Tech Lead recommendation
- **Maintainer → Tech Lead**: Participation in core architecture decisions + Project Lead appointment

### 1.2 Separation of Duties

```
Code Writing  →  Code Review  →  Merge  →  Deploy
 (Author)        (Reviewer)     (Maintainer) (Project Lead/Tech Lead)
```

- **You cannot merge your own PR** (review required)
- **Deployment must be approved by someone other than the code author**
- **AD Domain Administrator password changes require Security Officer pre-approval**

---

## 2. Decision-Making

### 2.1 Routine Decisions: PR Review
- One Maintainer approval minimum to merge
- **One objection = blocking**: discussion required, no merge until consensus

### 2.2 Architecture Decisions: ADR (Architecture Decision Record)
An ADR is mandatory when any of the following apply:
- Introducing a new external dependency
- Changing LDAP schema / AD structure
- Changing API design principles
- Platform change (e.g., FastAPI → different framework)
- Security-related decision (auth method, LDAP binding, etc.)

→ [ADR templates and list](./docs/adr/README.md)

### 2.3 Strategic Decisions: RFC (Request for Comments)
- New major feature, large-scale refactoring, roadmap change
- Write RFC document → 5 business day review period → Project Lead decision

### 2.4 Emergency Decisions: Hotfix
- Production outage (AD DC down, LDAP unresponsive): Tech Lead acts immediately
- Postmortem must be written within 48 hours
- Root cause analysis and prevention measures documented

---

## 3. Environments

```
local (Developer PC)
  ├── FastAPI dev server (uvicorn --reload)
  ├── React dev server (vite dev)
  └── Mock LDAP or test Samba VM
  ↓  push
development (Test Samba VM)
  ├── Separate AD domain (test.example.lan)
  ├── Auto-deployed (CI)
  └── Full feature testing available
  ↓  approved PR
staging (Staging Samba VM)
  ├── Production-matching configuration
  ├── Masked production data replica
  └── Maintainer manual deploy
  ↓  Project Lead/Tech Lead approval
production (Production Samba AD DC)
  ├── Live domain controller
  ├── Real users/groups/computers data
  └── Operated as systemd service
```

### Environment Rules
| Rule | local | dev | staging | production |
|------|-------|-----|---------|------------|
| Data | Mock / local Samba | Test data | Production replica (masked) | Real data |
| Secrets | `.env` (git-excluded) | systemd EnvironmentFile | systemd EnvironmentFile | systemd EnvironmentFile + chmod 600 |
| Deploy access | Anyone | Auto (CI) | Maintainer+ | Project Lead/Tech Lead |
| LDAP migration | Free | Free (CI auto) | Maintainer approval | Tech Lead approval + backup required |
| Samba DC access | Local VM | SSH (dev key) | SSH (staging key) | SSH (production key + 2FA) |

### 3.1 Production Data Access
- Production AD DC access requires **Security Officer-managed SSH key** only
- Temporary access is automatically logged (audit trail)
- Viewing user PII (names, emails, departments) requires dual control (two-person approval)

---

## 4. Branch & Merge Strategy

### 4.1 Trunk-Based Development
```
main (protected, direct push forbidden)
 ├── feature/ldap-user-search      (lifetime < 3 days recommended)
 ├── fix/group-membership-bug
 ├── hotfix/ldap-timeout-crash
 └── chore/update-dependencies
```

### 4.2 Branch Naming
```
{type}/{scope}-{short-description}

Examples: feature/backend-user-search-api
          fix/frontend-sidebar-collapse
          hotfix/ldap-connection-timeout
          chore/update-ruff-version
```

**Scopes:** `backend` `frontend` `api` `ldap` `auth` `ui` `docs` `preview`

### 4.3 Merge Rules
- **Squash & Merge** (keep commit history clean)
- Maximum **500 lines changed** per PR recommended (maintain review quality)
- Over 500 lines: split PR or get Tech Lead pre-approval

---

## 5. Code Review

### 5.1 Required Reviewers
| Change Area | Min Reviewers | Notes |
|-------------|--------------|-------|
| General code | 1 | Maintainer+ |
| Security/Auth/LDAP binding | 2 | Security Officer required |
| LDAP schema change | 2 | Tech Lead required |
| Infrastructure (systemd, nginx, CI/CD) | 2 | Tech Lead required |

### 5.2 Review Checklist
- [ ] Test code included (new features/bug fixes)
- [ ] Dependency added: security scan passed (`pip-audit` / `npm audit`)
- [ ] No env vars/secrets exposed
- [ ] Error handling and logging appropriate
- [ ] Documentation updated (when API changes)
- [ ] CHANGELOG updated
- [ ] **API messages are in English** (error details, query param descriptions, response labels)

### 5.3 Review Turnaround
- First review: **within 24 hours** (business days)
- Emergency hotfix: **within 2 hours**

---

## 6. Communication

| Channel | Purpose | Participants |
|---------|---------|-------------|
| GitHub Issues | Bugs, feature requests, task tracking | Everyone |
| GitHub Discussions | Technical discussions, RFCs | Everyone |
| GitHub PRs | Code review | Everyone |
| Urgent channel (Slack/Discord) | Incidents, hotfixes | Maintainer+ |

### Async-First
- All important decisions must be recorded on GitHub (no verbal agreements)
- Meeting notes must be **posted to a GitHub Issue/Discussion**

---

## 7. Design Integration

This project uses HTML previews (`previews/`) as the basis for UI design.
When converting previews to code, follow the rules in [DESIGN-INTEGRATION.md](./DESIGN-INTEGRATION.md).

**Core principle:** Previews do not determine data structure. The AD domain does.

### 7.1 API Message Language

All **API-facing text** MUST be in **English**. This includes:

- Error response `detail.message` and `detail.code` fields
- HTTP 501 "not implemented" stub messages
- OpenAPI `summary` and `description` strings on routes and query parameters
- Response model field labels returned to the client (e.g. dashboard stat card labels)
- Health status values (e.g. `"healthy"` / `"unhealthy"`, not `"정상"` / `"장애"`)

**Exceptions** (Korean is allowed):
- Mock seed data limited to **default Windows AD built-in objects** (Administrator, Domain Admins, Default Domain Policy, etc.) — see DESIGN-INTEGRATION.md §9
- Log messages (internal, not API-facing)
- Code comments and internal documentation

> **Important:** Mock mode must NOT generate fake users, groups, or inflated
> statistics. It represents a freshly provisioned domain — empty except for
> built-in AD defaults.

**Rationale:** The API is a machine contract. Internationalization (i18n) is a
frontend concern — the React SPA will map English API values to localized
display strings.

---

## 8. Frontend i18n Policy

### 8.1 Supported Languages

| Code | Language | Status |
|------|----------|--------|
| `en` | English  | **Default** (fallback) |
| `ko` | 한국어    | Supported |

### 8.2 Requirements

1. **No hardcoded UI strings** — All user-visible text in `.tsx` files MUST use
   `t("namespace:key")` from `react-i18next`. Hardcoded Korean or English string
   literals in JSX are forbidden.

2. **Translation file is the single source** — All UI strings live in
   `frontend/src/i18n/locales/{en,ko}.json`. No inline string literals.

3. **localStorage persistence** — Language preference is stored under
   `localStorage["lang"]` via `i18next-browser-languagedetector`. On first visit,
   defaults to `en` (or navigator language if supported).

4. **Namespace convention** — Each page/section has its own namespace:
   `common`, `setup`, `dashboard`, `users`, `groups`, `computers`, `ous`,
   `gpos`, `dns`, `policies`, `logs`, `settings`, `api`.

5. **Language switcher** — The Settings page provides a `<select>` to change
   language. Changing language does NOT require a page reload (react-i18next
   re-renders automatically).

6. **Locale-aware formatting** — Date/time formatting must respect the current
   language (`en-US` vs `ko-KR`). Use `i18n.language` to select locale.

> See DESIGN-INTEGRATION.md §10 for the full i18n implementation guide.

---

## 9. Policy Updates

Changes to this document require Tech Lead approval or above and will be announced to all contributors.
