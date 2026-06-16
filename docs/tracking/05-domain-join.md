# Page: Domain Join / Computers (`pages/Computers.tsx`)

> Preview reference: `previews/05-domain-join.html`
> Phase: 3 (React UI)

## Interactive Element Tracking

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Computer search input | GET | GET /api/v1/computers?q={query} | 🔲 Not implemented | — |
| OS filter dropdown | GET | GET /api/v1/computers?os={os} | 🔲 Not implemented | — |
| Status filter (online/offline) | GET | GET /api/v1/computers?status={status} | 🔲 Not implemented | — |
| OS breakdown chart | GET | GET /api/v1/stats/computers/os-distribution | 🔲 Not implemented | — |
| Join trend chart (30-day) | GET | GET /api/v1/stats/computers/join-trend | 🔲 Not implemented | — |
| Computer table row click | GET | GET /api/v1/computers/{id} | 🔲 Not implemented | — |
| Remove from domain button | DELETE | DELETE /api/v1/computers/{id} | 🔲 Not implemented | — |
| Disable computer account | PATCH | PATCH /api/v1/computers/{id} | 🔲 Not implemented | — |
| Reset computer account | POST | POST /api/v1/computers/{id}/reset | 🔲 Not implemented | — |
| Export computer list | GET | GET /api/v1/computers/export | 🔲 Not implemented (Phase 2) | — |
| Last logon timestamp display | GET | (included in computer detail) | 🔲 Not implemented | — |
| Pagination controls | GET | GET /api/v1/computers?page={n} | 🔲 Not implemented | — |
