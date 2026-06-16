# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Backend Phase 1 + 2**: FastAPI application with 58 REST endpoints under `/api/v1`
  (users, groups, ou, computers, gpo, domain, health, stats, alerts, settings)
- **Gate 1 — Domain model** (`backend/src/models/domain.py`): AD/LDAP schema mapping,
  `UserAccountControl` bitmask, status enums, per-resource attribute maps, samba-tool
  CLI command mapping
- **Gate 2 — API contract**: Pydantic request/response schemas for all resources;
  opaque base64url-encoded DN resource ids; pagination & standard error envelopes
- **Service layer**: `DirectoryBackend` protocol + `MockDirectory` (T0 in-memory, realistic
  preview-shaped seed data) + `Ldap3Backend` (real Samba 4 AD DC) + safe `SambaTool`
  subprocess wrapper (shell-injection validation)
- **Ldap3Backend full implementation**: All `DirectoryBackend` protocol methods implemented
  with real ldap3 queries — users, groups, OUs, computers, GPOs, domain policies, FSMO
  roles, DNS servers, password/lockout policy, system resources (psutil), TCP service
  probing, and dashboard stats
- **CSV export endpoints**: `GET /users/export`, `/groups/export`, `/computers/export`
  return downloadable CSV files (StreamingResponse)
- **Login history endpoint**: `GET /users/{id}/login-history`
- **Phase 2 stubs** (explicit 501 — no dead buttons): GPO backup/import/copy, group member
  export, settings notifications/alerts
- **Dashboard stats**: `login_trend()`, `ou_distribution()`, `recent_alerts()` added to
  `DirectoryBackend` protocol and both backends
- **T0 test suite**: 67 tests (domain model, services, API routes), 84.9% coverage
- **Phase 1 CLI**: `scripts/samba_admin.py` (samba-tool wrappers: users/groups/ou)
- Governance framework established (GOVERNANCE, CONTRIBUTING, SECURITY, DESIGN-INTEGRATION, DEPLOYMENT, INCIDENT-RESPONSE)
- **Governance §7.1**: API Message Language rule — all API-facing text must be English
- CODEOWNERS — code ownership rules by directory
- ADR-0001: Monorepo structure (backend + frontend + previews)
- ADR-0002: FastAPI + ldap3 backend architecture
- ADR-0003: Incremental development strategy (CLI → API → React UI)
- Design system specification (docs/design-brief.md)
- 7 static HTML UI preview pages (dashboard, users, groups, OU, domain-join, GPO, settings)
- PR template with design-preview checklist (.github/pull_request_template.md)
- Pre-commit automation (.pre-commit-config.yaml) — secret scanning, conventional commits, linting
- CI/CD pipeline (.github/workflows/ci.yml) — lint, typecheck, test, audit, build
- Health check script (scripts/health-check.py) — 28 validation checks
- Development setup script (scripts/setup-dev.sh)
- Makefile — unified task runner (install, dev, test, lint, health)
- EditorConfig, Markdown link check config
- .env.example with all required environment variables

### Changed
- **API messages standardized to English**: error details, query param descriptions,
  response labels, health status values, OpenAPI examples
- **Ldap3Backend `domain_info()`**: uses samba-tool + LDAP rootDSE for functional levels
- **Ldap3Backend `system_resources()`**: psutil-based CPU/memory/disk (was NotImplementedError)
- **Ldap3Backend `services_status()`**: TCP socket port probing (was hardcoded healthy=True)
- **ou.py**: replaced `decode_required()` wrapper with direct `decode_id` import
- Ruff config: removed `TCH` (conflicts with Pydantic runtime); extended
  `flake8-bugbear.immutable-calls` for FastAPI defaults; coverage omits production-only
  LDAP/subprocess backends (require live Samba DC)
- README development-phase status updated (Phase 1 + 2 implemented, Phase 3 not started)
- pyproject.toml: added `dependencies` list (fastapi, uvicorn, pydantic, ldap3, psutil)

### Removed
- _Nothing yet_

## [0.1.0] - 2026-06-16

### Added
- Initial project structure created
- Samba 4 AD DC architecture principles established
- Python (FastAPI) + TypeScript (React) monorepo design
- Dark theme design system (GitHub-inspired): `#0d1117`/`#161b22`/`#1c2128`, accent `#3b82f6`
- Fonts: Inter (UI) + JetBrains Mono (data)
