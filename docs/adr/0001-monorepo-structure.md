# ADR-0001: Monorepo Structure (Backend + Frontend)

## Status
Accepted

## Background
Samba 4 AD Manager consists of two main components: a Python (FastAPI + ldap3)
backend REST API and a React frontend SPA. We needed to decide between a single
monorepo or separate repositories for frontend and backend.

## Decision
Use a single Git monorepo with both backend and frontend in one repository,
along with documentation, previews, and tooling.

## Rationale
- API schema changes (OpenAPI) propagate instantly to frontend client code
- Atomic commits across the full stack (e.g., new endpoint + UI component)
- Single CI pipeline with consistent versioning
- Shared linting/formatting governance (pyproject.toml, .editorconfig)
- Easier code review for cross-stack features
- UI mockups in `previews/` serve as living design reference for both layers

## Consequences
- Larger repository, mitigated by clear directory boundaries
- CI must handle both Python and Node.js environments
- Need CODEOWNERS for backend/frontend review separation
- Pre-commit config must cover both languages
