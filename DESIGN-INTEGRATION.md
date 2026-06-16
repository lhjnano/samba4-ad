# Design Integration Governance

> Rules for integrating design previews (`previews/` HTML mockups) into development.
> **"Previews do not determine data structure. The domain does."**

---

## 1. Core Principles

### 1.1 Wrong Flow (Forbidden)

```
❌ HTML Preview → React Component → LDAP Schema Design
   Problem: ad-hoc data fit to UI, dead buttons, impossible LDAP queries
```

### 1.2 Correct Flow (Required)

```
✅ Domain Model → LDAP Schema/Attributes → API Contract → UI Implementation → Design Application
   AD Domain Analysis   OpenAPI + Pydantic    React Components   previews/ Reference
```

### 1.3 Three Invariant Rules

| Rule | Description |
|------|-------------|
| **Data First** | LDAP object classes/attributes are derived from Active Directory domain requirements. Never reverse-engineer from preview screens. |
| **Contract First** | Every interactive UI element must have a FastAPI endpoint + Pydantic schema defined before implementation. |
| **No Dead Buttons** | Never deploy buttons/links/forms that do nothing when clicked to production. |

---

## 2. Preview Classification and Limitations

### 2.1 What Previews Are

The HTML files in `previews/` are **exploration tools**, not **specifications**.

| Aspect | What Previews Give | What Previews Don't Give |
|--------|-------------------|------------------------|
| ✅ | Layout direction, color/typography tone, rough component placement | Exact LDAP attribute mapping, API signatures, error/loading/empty states, business logic |
| ✅ | Visual validation of user flows | Permission model (RBAC), LDAP concurrency handling, data validation rules |

### 2.2 Developer Obligations Upon Receiving a Preview

Before writing **any code**, the developer must:

```
1. Decompose
   Break down every screen in the preview into functional units.
   "What does the admin do on this page?"

2. Map
   Map each function to AD domain entities.
   "Which LDAP objects/attributes does this function read and write?"

3. Validate
   Can existing AD schema (user, group, computer, ou, gpo) support this?
   If not, is a schema extension needed? → Write an ADR.

4. Contract
   Define required API endpoints as OpenAPI + Pydantic schemas.

5. Track
   Register every interactive element in the tracking table (see §4).
```

---

## 3. API-First Development Process

### 3.1 Stage Gates

```
Gate 1: Domain Model Finalized
  ├── AD schema mapping design (user/group/computer/ou/gpo object classes)
  ├── samba-tool CLI command mapping (user add, group add, ou create, etc.)
  └── Tech Lead review (does the data structure reflect the AD domain?)
      ↓ Pass
Gate 2: API Contract Defined
  ├── Pydantic schemas (request/response models)
  ├── FastAPI route definitions (backend/src/api/*.py)
  ├── Test code written (T0: mocked LDAP)
  └── Tech Lead review (does the API expose LDAP data correctly?)
      ↓ Pass
Gate 3: UI Implementation
  ├── React components written using design preview as reference
  ├── All interactive elements connected to API
  ├── Error/loading/empty states implemented
  └── PR review (any dead buttons? §5 checklist)
      ↓ Pass
Gate 4: Design Application
  ├── Tailwind/Inter styling, layout, animation fine-tuning
  ├── Visual consistency check with previews (*.html)
  └── Design review (is the intended UX achieved?)
```

### 3.2 Gate Bypass Forbidden

- Starting at Gate 3 without Gate 1 is **forbidden**.
- Building UI first with "I'll fix the LDAP mapping later" is **forbidden**.
- Inserting preview dummy data into real LDAP is **forbidden**.

> **Exception:** Prototyping/spikes (throwaway) may be done explicitly on a `prototype/` branch only. Merging to main is forbidden.

---

## 4. Interactive Element Tracking Table

### 4.1 Purpose

Track every clickable element in design previews to **prevent dead buttons**.

### 4.2 Tracking Table Template

Maintain per-page tracking tables in `docs/tracking/`:

```markdown
# Page: User Management (pages/Users.tsx)

| Element | Type | API Endpoint | Status | Implementer |
|---------|------|-------------|--------|-------------|
| Create User button | POST | POST /api/v1/users | ✅ Done | @dev |
| Disable User | PATCH | PATCH /api/v1/users/:id | ✅ Done | @dev |
| Group search dropdown | GET | GET /api/v1/groups?q= | ✅ Done | @dev |
| Reset Password button | POST | POST /api/v1/users/:id/reset-password | ✅ Done | @dev |
| Export CSV button | GET | GET /api/v1/users/export | 🔲 Not implemented | — |
| Help (?) icon | — | (static modal) | ✅ Done | @dev |
| Approve Computer Join | POST | POST /api/v1/computers/:id/approve | 🔲 Phase 2 | — |
```

### 4.3 Tracking Rules

1. **All interactive elements must be registered** — buttons, links, form submits, dropdowns, tab switches.
2. **Elements without APIs must be annotated** — "static modal", "external link", "Not implemented (Phase X)".
3. **Unimplemented elements must be disabled** — `disabled` or "coming soon" label. Leaving dead buttons is forbidden.
4. **Update on PR** — Add a row to the tracking table when adding new UI elements.

---

## 5. PR Review Checklist (Design → Code)

The following checklist is applied additionally to UI implementation PRs based on design previews:

### 5.1 Data Structure Validation

- [ ] LDAP object classes/attributes were not temporarily changed for the UI.
- [ ] All data displayed in the UI comes from real LDAP attributes/calculated values (no hardcoding).
- [ ] Form input fields match the Pydantic schema.

### 5.2 API Connection Validation

- [ ] Every button/form has an API handler connected.
- [ ] No `onClick={() => {}}` (empty handlers).
- [ ] No `href="#"` (dead links).
- [ ] No "TODO" comments on interactive elements.

### 5.3 State Handling Validation

- [ ] Loading state (spinner/skeleton) is implemented.
- [ ] Error state (error message/retry) is implemented.
- [ ] Empty data state (empty list message) is implemented.
- [ ] Forbidden state (403 handling) is implemented.

### 5.4 Tracking Table Sync

- [ ] Interactive element tracking table is updated.
- [ ] New unimplemented elements have `disabled` applied.

---

## 6. Anti-Pattern Catalog

### 6.1 ❌ Preview-Reverse-Engineered Data

```typescript
// ❌ Bad: hardcoded count because preview showed "42 active users"
const activeUsers = 42;
return <Badge count={activeUsers} />

// ✅ Good: API call derived from domain requirements
const { data } = useQuery('activeUsers', () =>
  api.get('/api/v1/users?status=active&count=true')
);
return <Badge count={data?.count ?? 0} />
```

### 6.2 ❌ Dead Buttons

```tsx
// ❌ Bad: clicking does nothing
<button onClick={() => {}}>Lock User</button>
<a href="#">Show More</a>

// ✅ Good: API connected or explicitly disabled
<button onClick={handleLockUser} disabled={isProcessing}>Lock User</button>
<button disabled title="Coming in Phase 2">Approve Computer Join</button>
```

### 6.3 ❌ Ad-hoc LDAP Attributes for UI

```python
# ❌ Bad: creating a meaningless LDAP attribute because the preview had badge colors
# (Never extend the AD schema carelessly)

# ✅ Good: derive badge color from domain state
# userAccountControl determines badge color
# 512 = Enabled, 514 = Disabled, 66048 = Enabled + password never expires
def get_status_badge(uac: int) -> str:
    if uac & 2:  # ACCOUNTDISABLE flag
        return "red"
    return "green"
```

### 6.4 ❌ Design-Only Mock Data

```typescript
// ❌ Bad: fake data left in production code to look like the preview
const mockUsers = [
  { name: 'John Doe', department: 'IT', status: 'active' },
  { name: 'Jane Smith', department: 'Sales', status: 'active' },
];

// ✅ Good: real API call, mock data only in test files
const { data: users } = useQuery('users', () =>
  api.get('/api/v1/users')
);
// tests/fixtures/users.ts is the only place for mock data
```

### 6.5 ❌ Ignoring Errors (Because Previews Have No Errors)

```tsx
// ❌ Bad: only success path implemented (because the preview had no errors)
const { data } = await api.post('/api/v1/users', payload);
navigate('/users');

// ✅ Good: all cases handled
try {
  const { data } = await api.post('/api/v1/users', payload);
  navigate('/users');
} catch (error) {
  if (error.code === 'LDAP_ENTRY_EXISTS') {
    showToast('A user with this name already exists');
  } else if (error.code === 'LDAP_INSUFFICIENT_RIGHTS') {
    showToast('Insufficient permissions. Contact your domain administrator.');
  } else {
    showToast('Failed to create user. Please try again.');
  }
}
```

---

## 7. Preview File Management

### 7.1 Current Preview Inventory

```
previews/
├── 01-dashboard.html        # Dashboard: stats, login chart, service status
├── 02-users.html            # User Management: table + detail panel
├── 03-groups.html           # Group Management: table + slide-in panel
├── 04-ou.html               # OU Management: tree view + detail panel
├── 05-domain-join.html      # Domain Join: device table, OS chart
├── 06-gpo.html              # GPO Management: list + detail
└── 07-settings.html         # Settings: 5 sections
```

### 7.2 Preview Expiration Policy

- Design previews become **archive reference** 30 days after implementation is complete.
- The implemented React code becomes the **source of truth**.
- When preview and implementation conflict, **implementation always wins**.

### 7.3 Preview → Implementation Mapping

Each preview page maps to a React route:

| Preview | React Route | Phase | API Contract | UI Status |
|---------|------------|-------|--------------|-----------|
| `01-dashboard.html` | `/` | Phase 3 | ✅ `/api/v1/stats/*`, `/health` | 🔲 Not implemented |
| `02-users.html` | `/users` | Phase 3 | ✅ `/api/v1/users` | 🔲 Not implemented |
| `03-groups.html` | `/groups` | Phase 3 | ✅ `/api/v1/groups` | 🔲 Not implemented |
| `04-ou.html` | `/ou` | Phase 3 | ✅ `/api/v1/ou` | 🔲 Not implemented |
| `05-domain-join.html` | `/computers` | Phase 3 | ✅ `/api/v1/computers` | 🔲 Not implemented |
| `06-gpo.html` | `/gpo` | Phase 3 | ✅ `/api/v1/gpo` | 🔲 Not implemented |
| `07-settings.html` | `/settings` | Phase 3 | ✅ `/api/v1/domain` | 🔲 Not implemented |

> **Stage-gate status:** Gate 1 (Domain Model) and Gate 2 (API Contract) are
> **complete** — all preview-backed endpoints exist in the FastAPI OpenAPI schema.
> Gate 3 (UI Implementation) is intentionally **not started**: per the gate order,
> no React components may be built until the contract review is signed off. UI
> status here tracks Gate 3/4 only.

---

## 8. Responsibilities

| Role | Responsibility in Design Integration |
|------|-------------------------------------|
| **Designer/Product Manager** | Create previews, define admin requirements |
| **Developer** | Domain analysis, LDAP mapping validation, API definition, UI implementation, tracking table |
| **Tech Lead** | Gate 1+2 review (does data/API reflect the AD domain?) |
| **Maintainer** | Gate 3 review (dead button / state handling verification) |

> **Key:** Designers decide "what to show." Developers decide "how it works." Design does not dictate how things work.
