# Architecture Decision Records (ADR)

> ADRs capture important architectural decisions, their context, and consequences.

## What warrants an ADR?

An ADR is required when:
- Introducing a new external dependency
- Changing LDAP schema / AD structure
- Changing API design principles
- Platform change (e.g., FastAPI → different framework)
- Security-related decision (auth method, LDAP binding, etc.)

## Format

Each ADR file follows this naming convention:
```
NNNN-short-description.md
```

Where `NNNN` is a sequential number (0001, 0002, ...).

### Template

```markdown
# ADR-NNNN: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
**Date:** YYYY-MM-DD
**Deciders:** [Names/Roles]

## Context
[Why is this decision needed? What problem does it solve?]

## Decision
[What is the decision made?]

## Alternatives Considered
[What other options were evaluated? Why were they rejected?]

## Consequences
[What are the positive/negative implications of this decision?]

## References
[Links to relevant docs, discussions, etc.]
```

## ADR Index

| # | Title | Status | Date |
|---|-------|--------|------|
| [0001](./0001-monorepo-structure.md) | Monorepo Structure (Backend + Frontend + Previews) | Accepted | 2026-06-16 |
| [0002](./0002-fastapi-ldap3-backend.md) | FastAPI + ldap3 Backend Architecture | Accepted | 2026-06-16 |
| [0003](./0003-incremental-development-strategy.md) | Incremental Development Strategy (CLI → API → React UI) | Accepted | 2026-06-16 |
