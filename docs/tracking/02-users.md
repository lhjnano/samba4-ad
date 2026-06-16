# Page: User Management (`pages/Users.tsx`)

> Preview reference: `previews/02-users.html`
> Phase: 3 (React UI)

## Interactive Element Tracking

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| User search input | GET | GET /api/v1/users?q={query} | 🔲 Not implemented | — |
| Department filter dropdown | GET | GET /api/v1/users?department={dept} | 🔲 Not implemented | — |
| Status filter (active/disabled) | GET | GET /api/v1/users?status={status} | 🔲 Not implemented | — |
| Create User button | POST | POST /api/v1/users | 🔲 Not implemented | — |
| User table row click | GET | GET /api/v1/users/{id} | 🔲 Not implemented | — |
| Edit User button | PATCH | PATCH /api/v1/users/{id} | 🔲 Not implemented | — |
| Disable/Enable User toggle | PATCH | PATCH /api/v1/users/{id} | 🔲 Not implemented | — |
| Reset Password button | POST | POST /api/v1/users/{id}/reset-password | 🔲 Not implemented | — |
| Delete User button | DELETE | DELETE /api/v1/users/{id} | 🔲 Not implemented | — |
| Export CSV button | GET | GET /api/v1/users/export | 🔲 Not implemented (Phase 2) | — |
| Group membership tab | GET | GET /api/v1/users/{id}/groups | 🔲 Not implemented | — |
| Pagination controls | GET | GET /api/v1/users?page={n}&limit={n} | 🔲 Not implemented | — |
| Sort by column header | GET | GET /api/v1/users?sort={field}&order={asc|desc} | 🔲 Not implemented | — |
