# Page: Group Management (`pages/Groups.tsx`)

> Preview reference: `previews/03-groups.html`
> Phase: 3 (React UI)

## Interactive Element Tracking

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Group search input | GET | GET /api/v1/groups?q={query} | 🔲 Not implemented | — |
| Group type filter (security/distribution) | GET | GET /api/v1/groups?type={type} | 🔲 Not implemented | — |
| Create Group button | POST | POST /api/v1/groups | 🔲 Not implemented | — |
| Group table row click | GET | GET /api/v1/groups/{id} | 🔲 Not implemented | — |
| Detail panel: Members tab | GET | GET /api/v1/groups/{id}/members | 🔲 Not implemented | — |
| Detail panel: Nested Groups tab | GET | GET /api/v1/groups/{id}/nested | 🔲 Not implemented | — |
| Add member to group | POST | POST /api/v1/groups/{id}/members | 🔲 Not implemented | — |
| Remove member from group | DELETE | DELETE /api/v1/groups/{id}/members/{userId} | 🔲 Not implemented | — |
| Edit Group button | PATCH | PATCH /api/v1/groups/{id} | 🔲 Not implemented | — |
| Delete Group button | DELETE | DELETE /api/v1/groups/{id} | 🔲 Not implemented | — |
| Export group members | GET | GET /api/v1/groups/{id}/members/export | 🔲 Not implemented (Phase 2) | — |
| Close detail panel | UI | (client-side state) | 🔲 Not implemented | — |
