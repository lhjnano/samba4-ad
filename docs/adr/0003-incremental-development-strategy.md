# ADR-0003: Incremental Development — CLI First, UI Second

## Status
Accepted

## Background
The plan document (`docs/plan.html`) recommends building the management UI
incrementally: "Start with CLI operations via samba-tool; once requirements
become clear, incrementally develop a python-ldap3 REST API + React portal."
We needed to decide the development sequence.

## Decision
Adopt a **three-phase incremental development strategy**:

1. **Phase 1 — CLI Scripts**: Python scripts wrapping `samba-tool` for bulk
   operations (user creation, OU setup, group management). Validate all
   operations against a test Samba 4 AD DC VM.

2. **Phase 2 — REST API**: Wrap validated CLI operations into FastAPI
   endpoints with proper LDAP queries, authentication, and OpenAPI schema.

3. **Phase 3 — React UI**: Build the SPA using the UI mockups in `previews/`
   as design reference, connecting to the Phase 2 REST API.

## Rationale
- Avoids building UI for features that may change after real-world testing
- CLI scripts become the service layer — no throwaway code
- LDAP/Samba behavior quirks discovered early (connection handling, schema
  mapping, attribute names) before committing to API contracts
- UI mockups already exist as design reference, reducing design risk
- Each phase is independently useful and deployable

## Consequences
- UI development starts later, but with validated backend contracts
- `scripts/` directory accumulates reusable CLI tools
- Phase 1 output doubles as operational runbooks
- Previews remain static HTML until Phase 3 — React conversion happens last
- API schema stability is higher because it's validated against real LDAP
