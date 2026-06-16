# Samba 4 AD Manager

> **Web-based admin portal for Samba 4 Active Directory Domain Controller**

Replace Windows Server AD management tools (ADUC, ADAC) with a modern,
dark-themed web UI for managing users, groups, organizational units,
domain-joined devices, group policies, and domain health.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Browser (React SPA)                 │
│   Dashboard · Users · Groups · OU · Devices · GPO   │
└────────────────────────┬────────────────────────────┘
                         │ REST API (JSON)
┌────────────────────────▼────────────────────────────┐
│              FastAPI Backend (Python)                 │
│   Auth · LDAP Query · samba-tool wrapper · Health    │
└───────────────┬────────────────┬─────────────────────┘
                │                │
    ┌───────────▼──┐   ┌────────▼────────┐
    │   ldap3      │   │  samba-tool CLI │
    │ (LDAP :389)  │   │  (subprocess)   │
    └──────┬───────┘   └────────┬────────┘
           │                    │
┌──────────▼────────────────────▼──────────────────────┐
│           Samba 4 AD DC (TEST.LOCAL)                 │
│   LDAP · Kerberos · DNS · SMB/CIFS · Replication     │
└──────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone <repo-url>
cd samba4-ad

# One-click setup
bash scripts/setup-dev.sh

# Or manual
make install
make install-hooks

# Check project health
make health
```

## Backend Development (Phase 1 + 2)

The backend is a FastAPI application with an injectable directory backend:

- **`app_mode=mock`** (default) — in-memory `MockDirectory`, zero infrastructure needed
- **`app_mode=ldap`** — connects to a real Samba 4 AD DC via `ldap3` + `samba-tool`

```bash
# Set up virtual environment + dependencies
make install-backend

# Run the dev server (mock mode by default)
make dev-backend
# → http://localhost:8000/docs  (interactive OpenAPI / Swagger)

# Run the full test suite (T0, mocked LDAP) with coverage
make test-coverage

# Lint + format
make format-fix
make lint-python

# Phase 1 CLI (wraps samba-tool; requires APP_MODE=ldap + real DC)
python scripts/samba_admin.py users --help
```

### API surface

50 endpoints under `/api/v1` covering: `users`, `groups`, `ou`, `computers`,
`gpo`, `domain`, `health`, `stats`, `alerts`. Every interactive element from
the design previews is wired to an endpoint — no dead buttons (Phase 2 features
like CSV export return explicit `501`).

## Development Phases

See [ADR-0003](docs/adr/0003-incremental-development-strategy.md) for full details.

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | CLI scripts (samba-tool wrappers) | ✅ Implemented — `scripts/samba_admin.py` |
| **Phase 2** | FastAPI REST API | ✅ Implemented (mock backend) — 50 endpoints, OpenAPI at `/docs` |
| **Phase 3** | React SPA | 🔲 UI mockups ready, not started |

> **Governance note:** Phase 3 (UI) starts only after the Phase 2 API contract
> is finalised. Per `DESIGN-INTEGRATION.md`, previews do not determine data
> structure — the AD domain does. No UI is built yet by design.

## UI Previews

Static HTML mockups are in `previews/`:

| File | Page |
|------|------|
| `01-dashboard.html` | Dashboard (stats, charts, services) |
| `02-users.html` | User management (table, detail panel) |
| `03-groups.html` | Group management (table, members) |
| `04-ou.html` | OU management (tree view) |
| `05-domain-join.html` | Domain join status (devices, OS breakdown) |
| `06-gpo.html` | Group Policy Objects (list, settings) |
| `07-settings.html` | Settings (general, domain, security) |

Open in browser:
```
file:///path/to/samba4-ad/previews/01-dashboard.html
```

## Project Structure

```
samba4-ad/
├── backend/               # FastAPI + ldap3 REST API (Phase 2)
│   ├── src/
│   │   ├── api/           #   Route handlers
│   │   ├── core/          #   Config, security, deps
│   │   ├── models/        #   Pydantic schemas
│   │   ├── services/      #   LDAP ops, samba-tool wrappers
│   │   └── main.py        #   FastAPI app entry
│   └── tests/
├── frontend/              # React + Vite SPA (Phase 3)
│   ├── src/
│   └── package.json
├── docs/
│   ├── design-brief.md    # Design system specification
│   ├── plan.html          # Infrastructure plan (Samba 4 AD DC)
│   └── adr/               # Architecture Decision Records
├── previews/              # Static HTML UI mockups (7 pages)
├── scripts/               # Dev tooling (setup, health-check)
├── .github/workflows/     # CI pipeline
├── .pre-commit-config.yaml
├── pyproject.toml         # Python lint/test config
├── Makefile               # Unified task entry-point
└── CONTRIBUTING.md
```

## Design System

Dark theme (GitHub-inspired) with CSS custom properties:

| Token | Value |
|-------|-------|
| Background | `#0d1117` / `#161b22` / `#1c2128` |
| Primary accent | `#3b82f6` (blue) |
| Success | `#10b981` (green) |
| Warning | `#f59e0b` (yellow) |
| Danger | `#ef4444` (red) |
| Fonts | Inter (UI) + JetBrains Mono (data) |

See [design-brief.md](docs/design-brief.md) for full spec.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0
