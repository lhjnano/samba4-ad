# Samba 4 AD Manager

> **Web-based admin portal for Samba 4 Active Directory Domain Controller**

Replace Windows Server AD licensing with a free, open-source alternative.
Manage users, groups, computers, OUs, GPOs, DNS, and domain policies through
a modern web interface — no Windows Server required.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)](https://python.org)
[![React](https://img.shields.io/badge/React-19+-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)

---

## Sponsors

If this project helps you reduce Windows Server costs, please consider supporting development:

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-Support-blue?logo=github-sponsors&style=for-the-badge)](https://github.com/sponsors/lhjnano)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-FF5E5B?logo=ko-fi&logoColor=white&style=for-the-badge)](https://ko-fi.com/lhjnano)

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Real-time CPU/Memory/Disk monitoring, AD stats, service health |
| **Users** | CRUD, search, enable/disable, password reset, inline editing |
| **Groups** | CRUD, search, member add/remove |
| **Computers** | List joined devices, disable/enable, reset account, remove from domain |
| **OUs** | Tree view, create/edit/delete |
| **GPOs** | List, create, delete, enable/disable toggle |
| **DNS** | Real zone/record management via `samba-tool dns` (add/delete records) |
| **Policies** | Password & lockout policy view/edit |
| **Logs** | Real system logs from journald (filter by severity/source/keyword) |
| **Domain Info** | Functional level, FSMO roles, DC info |
| **i18n** | English + Korean (GNU gettext workflow, 610+ translated keys) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Browser (React SPA)                 │
│   Dashboard · Users · Groups · OU · Devices · GPO   │
│   DNS · Policies · Logs · Settings                   │
└────────────────────────┬────────────────────────────┘
                         │ REST API (JSON)
┌────────────────────────▼────────────────────────────┐
│              FastAPI Backend (Python)                 │
│   Auth · LDAP Query · samba-tool · journald · DNS    │
└───────────────┬────────────────┬─────────────────────┘
                │                │
    ┌───────────▼──┐   ┌────────▼────────┐
    │   ldap3      │   │  samba-tool CLI │
    │ (LDAP :389)  │   │  (subprocess)   │
    └──────┬───────┘   └────────┬────────┘
           │                    │
┌──────────▼────────────────────▼──────────────────────┐
│           Samba 4 AD DC (corp.local)                 │
│   LDAP · Kerberos · DNS · SMB/CIFS · Replication     │
└──────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone https://github.com/lhjnano/samba4-ad.git
cd samba4-ad

# Install (requires sudo — provisions Samba AD DC + web app)
sudo bash install.sh --domain corp.local --admin-pass 'YourPass123!'
```

After installation, open the web UI:

```
http://<server-ip>:8000
```

Login with the domain administrator credentials set during installation.

## Manual Setup

<details>
<summary>Click to expand</summary>

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Development (mock mode — no Samba needed)
APP_MODE=mock uvicorn src.main:app --reload

# Production (LDAP mode — requires running Samba AD DC)
APP_MODE=ldap uvicorn src.main:app --host 0.0.0.0
```

### Frontend

```bash
cd frontend
npm install
npm run dev    # Development server
npm run build  # Production build
```

### Tests

```bash
# Full CI (lint + format + tests + build + i18n check)
bash scripts/ci-local.sh
```

</details>

## Configuration

Configuration is stored at `/etc/samba-ad-manager/env`:

```ini
APP_MODE=ldap              # mock (dev) or ldap (production)
LDAP_HOST=127.0.0.1
LDAP_PORT=389
LDAP_BIND_DN=CN=Administrator,CN=Users,DC=CORP,DC=LOCAL
LDAP_BIND_PASSWORD=YourPassword
LDAP_SEARCH_BASE=DC=CORP,DC=LOCAL
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, react-i18next |
| Backend | FastAPI, Python 3.12+, ldap3, psutil |
| AD Server | Samba 4 AD DC (samba-tool, internal DNS) |
| Deployment | systemd service, standard Linux |
| i18n | GNU gettext workflow (i18next-parser, 610+ keys) |

## Project Structure

```
samba4-ad/
├── backend/
│   ├── src/
│   │   ├── api/          # FastAPI route handlers
│   │   ├── core/         # Config, auth, dependencies
│   │   ├── models/       # Pydantic schemas
│   │   └── services/     # LDAP backend, samba-tool, mock
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/        # 12 page components
│   │   ├── components/   # Reusable UI components
│   │   └── i18n/         # EN/KO locale files
│   └── package.json
├── scripts/              # CI, setup, utilities
├── install.sh            # One-click installer
├── GOVERNANCE.md         # Project governance
└── pyproject.toml        # Lint/test/coverage config
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

All commits must pass `bash scripts/ci-local.sh` (6 checks: ruff lint, ruff format, pytest ≥80% coverage, frontend build, vitest, i18n completeness).

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
