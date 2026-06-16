# Contributing to Samba 4 AD Manager

Thank you for your interest! This guide covers everything you need to start contributing.

## Development Setup

```bash
# Prerequisites
python3.11 --version
node --version    # >= 18

# Clone
git clone <repo-url>
cd samba4-ad

# Backend setup
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Frontend setup
cd ../frontend
npm install

# Or use the one-click setup script
cd ..
bash scripts/setup-dev.sh
```

## Code Standards

All code is automatically formatted and linted via **pre-commit hooks**.
You don't need to remember rules — the machine enforces them.

| Language | Formatter | Linter |
|----------|-----------|--------|
| Python | ruff (format) | ruff (lint), mypy |
| TypeScript/JS | prettier | eslint |
| Shell | shfmt | shellcheck |

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional, explain "why")

footer (optional: Fixes #123, BREAKING CHANGE:)
```

**Types:** `feat` `fix` `perf` `refactor` `docs` `test` `build` `ci` `chore`

**Scopes:** `backend` `frontend` `api` `ldap` `auth` `ui` `docs` `preview`

Examples:
```
feat(backend): add LDAP user search endpoint
fix(frontend): resolve sidebar collapse on mobile
perf(api): cache OU tree query results
feat(auth)!: switch from basic auth to Kerberos SPNEGO
docs(api): add OpenAPI schema for groups endpoint
chore(preview): add domain join status page
```

## Branch Strategy

- `main` — always green, protected
- `feature/<scope>-<description>` — max 3 days, squash merge
- `fix/<scope>-<description>` — max 4 hours
- `release/vX.Y.Z` — release branch

## Pull Request Process

1. Create branch from `main`
2. Implement + write tests (coverage >= 80%)
3. Commit with Conventional Commits (pre-commit validates)
4. Push + create PR (template auto-fills)
5. CI must pass (Gate 1) + code review approval (Gate 2)
6. Squash merge

## Testing Tiers

| Tier | Scope | Environment |
|------|-------|-------------|
| **T0** | Unit tests (mocked LDAP) | Any machine |
| **T1** | Integration tests (Samba 4 test VM) | VM with Samba AD DC |
| **T2** | E2E tests (full domain) | Production-like domain |

```bash
# Run tests
make test              # all unit tests
make test-integration  # integration tests (needs Samba VM)
make test-e2e          # end-to-end (needs running domain)
make test-coverage     # with coverage report
```

## Project Structure

```
samba4-ad/
├── backend/           # FastAPI + ldap3 REST API
│   ├── src/
│   │   ├── api/       #   Route handlers
│   │   ├── core/      #   Config, security, deps
│   │   ├── models/    #   Pydantic schemas
│   │   ├── services/  #   LDAP operations, samba-tool wrappers
│   │   └── main.py    #   FastAPI app entry
│   └── tests/
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── api/       #   API client
│   │   └── App.tsx
│   └── package.json
├── docs/              # Documentation + ADRs
├── previews/          # Static HTML UI mockups
├── scripts/           # Dev tooling
├── .github/           # CI workflows
└── Makefile           # Unified task entry-point
```

## Governance Documents

Before contributing, please review the relevant governance docs:

| Document | Purpose |
|----------|---------|
| [GOVERNANCE.md](./GOVERNANCE.md) | Roles, decision-making, environments, branch strategy |
| [DESIGN-INTEGRATION.md](./DESIGN-INTEGRATION.md) | Rules for converting design previews into code (4-gate process) |
| [SECURITY.md](./SECURITY.md) | Secret management, vulnerability handling, PII protection |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Ubuntu 22.04 VM deployment, systemd, nginx, CI/CD |
| [INCIDENT-RESPONSE.md](./INCIDENT-RESPONSE.md) | Production incident severity, diagnostics, postmortem |
| [docs/adr/README.md](./docs/adr/README.md) | Architecture Decision Records |
| [CHANGELOG.md](./CHANGELOG.md) | All notable changes |

## Questions?

Open an issue or ask the team.
