# Page: Dashboard (`pages/Dashboard.tsx`)

> Preview reference: `previews/01-dashboard.html`
> Phase: 3 (React UI)

## Interactive Element Tracking

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Total Users stat card | GET | GET /api/v1/stats/users | 🔲 Not implemented | — |
| Active Users stat card | GET | GET /api/v1/stats/users?status=active | 🔲 Not implemented | — |
| Total Groups stat card | GET | GET /api/v1/stats/groups | 🔲 Not implemented | — |
| Joined Computers stat card | GET | GET /api/v1/stats/computers | 🔲 Not implemented | — |
| Login trend chart (7-day) | GET | GET /api/v1/stats/logins?days=7 | 🔲 Not implemented | — |
| Service status indicator | GET | GET /api/v1/health/services | 🔲 Not implemented | — |
| CPU usage gauge | GET | GET /api/v1/health/system | 🔲 Not implemented | — |
| Memory usage gauge | GET | GET /api/v1/health/system | 🔲 Not implemented | — |
| Disk usage gauge | GET | GET /api/v1/health/system | 🔲 Not implemented | — |
| Recent alerts list | GET | GET /api/v1/alerts?limit=10 | 🔲 Not implemented | — |
| OU distribution chart | GET | GET /api/v1/stats/ou-distribution | 🔲 Not implemented | — |
| Quick action: Add User | NAV | → /users/new | 🔲 Not implemented | — |
| Quick action: Add Group | NAV | → /groups/new | 🔲 Not implemented | — |
| Quick action: Join Computer | NAV | → /computers/join | 🔲 Not implemented | — |
| Quick action: Create GPO | NAV | → /gpo/new | 🔲 Not implemented | — |
| Refresh button | GET | (triggers refetch) | 🔲 Not implemented | — |
