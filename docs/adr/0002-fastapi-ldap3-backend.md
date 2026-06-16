# ADR-0002: FastAPI + ldap3 for Backend

## Status
Accepted

## Background
The management portal needs to interact with Samba 4 AD DC via LDAP and
`samba-tool` CLI. We needed to choose a backend framework and LDAP library.

## Decision
Use **FastAPI** (Python 3.11+) with **ldap3** as the LDAP client library,
wrapping `samba-tool` CLI for domain provisioning and special operations.

## Rationale
- **FastAPI**: async, auto-generates OpenAPI/Swagger docs, Pydantic validation,
  excellent TypeScript client generation for the frontend
- **ldap3**: pure-Python, well-maintained, supports connection pooling, async
  via `Tls` + threads, no system-level LDAP dependency
- **samba-tool**: only reliable way to do domain provisioning, DNS management,
  and some GPO operations that LDAP alone cannot handle
- **Python ecosystem**: rich testing (pytest), typing (mypy strict), linting
  (ruff), security (bandit) — all unified in pyproject.toml
- Alternative considered: Go + go-ldap — rejected due to smaller ecosystem
  for LDAP admin tooling and team Python familiarity

## Consequences
- Backend requires Python 3.11+ runtime
- ldap3 connection management needs careful pooling (LDAP server connection limits)
- samba-tool subprocess calls need security validation (no user-controlled args)
- Async LDAP operations limited by ldap3's threading model (not true async)
- Mypy overrides needed for ldap3 (no type stubs)
