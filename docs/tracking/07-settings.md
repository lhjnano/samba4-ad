# Page: Settings (`pages/Settings.tsx`)

> Preview reference: `previews/07-settings.html`
> Phase: 3 (React UI)

## Interactive Element Tracking

## Section: General

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Theme toggle (dark/light) | UI | (client-side preference) | 🔲 Not implemented | — |
| Language selector | UI | (client-side i18n) | 🔲 Not implemented | — |
| Items per page dropdown | UI | (client-side preference) | 🔲 Not implemented | — |

## Section: Domain

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Domain FQDN display | GET | GET /api/v1/domain/info | 🔲 Not implemented | — |
| Forest functional level display | GET | GET /api/v1/domain/info | 🔲 Not implemented | — |
| Domain functional level display | GET | GET /api/v1/domain/info | 🔲 Not implemented | — |
| FSMO roles list | GET | GET /api/v1/domain/fsmo | 🔲 Not implemented | — |
| DNS servers list | GET | GET /api/v1/domain/dns | 🔲 Not implemented | — |

## Section: Security

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Password policy display | GET | GET /api/v1/domain/password-policy | 🔲 Not implemented | — |
| Account lockout policy display | GET | GET /api/v1/domain/lockout-policy | 🔲 Not implemented | — |
| Edit password policy | PATCH | PATCH /api/v1/domain/password-policy | 🔲 Not implemented | — |
| Edit lockout policy | PATCH | PATCH /api/v1/domain/lockout-policy | 🔲 Not implemented | — |

## Section: Notifications

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Email notification toggle | PATCH | PATCH /api/v1/settings/notifications | 🔲 Not implemented (Phase 2) | — |
| Alert threshold slider | PATCH | PATCH /api/v1/settings/alerts | 🔲 Not implemented (Phase 2) | — |

## Section: About

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Version display | UI | (static) | 🔲 Not implemented | — |
| Samba version display | GET | GET /api/v1/health/version | 🔲 Not implemented | — |
| Open source licenses link | UI | (static modal) | 🔲 Not implemented | — |
