# Page: GPO Management (`pages/GPO.tsx`)

> Preview reference: `previews/06-gpo.html`
> Phase: 3 (React UI)

## Interactive Element Tracking

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| GPO search input | GET | GET /api/v1/gpo?q={query} | 🔲 Not implemented | — |
| Create GPO button | POST | POST /api/v1/gpo | 🔲 Not implemented | — |
| GPO list item click | GET | GET /api/v1/gpo/{id} | 🔲 Not implemented | — |
| Detail: Settings tab | GET | GET /api/v1/gpo/{id}/settings | 🔲 Not implemented | — |
| Detail: Linked OUs tab | GET | GET /api/v1/gpo/{id}/links | 🔲 Not implemented | — |
| Detail: Policy Values tab | GET | GET /api/v1/gpo/{id}/values | 🔲 Not implemented | — |
| Edit GPO settings | PATCH | PATCH /api/v1/gpo/{id}/settings | 🔲 Not implemented | — |
| Link GPO to OU | POST | POST /api/v1/gpo/{id}/links | 🔲 Not implemented | — |
| Unlink GPO from OU | DELETE | DELETE /api/v1/gpo/{id}/links/{ouId} | 🔲 Not implemented | — |
| Delete GPO button | DELETE | DELETE /api/v1/gpo/{id} | 🔲 Not implemented | — |
| Backup GPO button | POST | POST /api/v1/gpo/{id}/backup | 🔲 Not implemented (Phase 2) | — |
| Import GPO button | POST | POST /api/v1/gpo/import | 🔲 Not implemented (Phase 2) | — |
| Copy GPO button | POST | POST /api/v1/gpo/{id}/copy | 🔲 Not implemented (Phase 2) | — |
| GPO status indicator (enabled/disabled) | PATCH | PATCH /api/v1/gpo/{id} | 🔲 Not implemented | — |
