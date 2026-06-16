# Samba 4 AD Manager — Design Brief

## 1. Product Overview

**Samba 4 AD Manager** is a complete, Linux-based Active Directory Domain
Controller solution. It bundles Samba 4 AD DC provisioning, service management,
and a modern web UI into a single installable product — replacing the need for
Windows Server licenses.

**Target users:** System administrators and IT infra teams who need AD DC on Linux.

**Product flow:**
1. **Install** → `install.sh` sets up Samba 4 packages + web app
2. **Provision** → First-run Setup Wizard creates the AD domain
3. **Manage** → Web UI for users, groups, OUs, computers, GPO, domain health

---

## 2. Design System

### Theme: Dark (GitHub-inspired)

| Token | Value | Usage |
|---|---|---|
| `--bg-root` | `#0d1117` | Page background |
| `--bg-card` | `#161b22` | Cards, topbar, table |
| `--bg-sidebar` | `#1c2128` | Sidebar, table header |
| `--bg-input` | `#0d1117` | Input fields |
| `--bg-hover` | `#21262d` | Hover states |
| `--bg-active` | `#1f3244` | Active nav (blue-tinted) |
| `--border` | `#30363d` | Standard borders |
| `--border-subtle` | `#21262d` | Row dividers |
| `--text-primary` | `#e6edf3` | Primary text |
| `--text-secondary` | `#8b949e` | Secondary text |
| `--text-muted` | `#484f58` | Muted/placeholder |
| `--accent-blue` | `#3b82f6` | Primary action |
| `--accent-green` | `#10b981` | Success/active |
| `--accent-yellow` | `#f59e0b` | Warning |
| `--accent-red` | `#ef4444` | Danger/locked |
| `--accent-purple` | `#7c3aed` | Special/Samba |

### Typography
- **UI Font:** Inter (300–700)
- **Mono Font:** JetBrains Mono (400–600) — for identifiers, usernames, DNs, SIDs, dates, numbers
- **Base size:** 14px, line-height 1.5
- **Headings:** letter-spacing -0.03em, weight 700

### Radii
- `--radius-sm: 6px` (buttons, inputs, badges)
- `--radius-md: 8px`
- `--radius-lg: 12px` (cards, table containers)

### Icons
- **Feather/Lucide-style inline SVG** (24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`)
- Nav icons: 16px | Button icons: 14px | Action icons: 11px

### Branding
- **Logo:** Shield icon inside blue rounded square (`#3b82f6`)
- **Brand name:** "AD Manager"
- **Domain pill:** Mono font domain name + green pulsing health dot

---

## 3. App Shell Layout (Post-Provisioning)

```
┌─────────────────────────────────────────────┐
│  Topbar (56px)                               │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ Sidebar  │  Main Content (scrollable)       │
│ (220px)  │                                  │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

- **Topbar:** Logo + domain health pill + global search + notification bell (with dropdown) + profile avatar
- **Sidebar:** Two sections — "Main" (Dashboard, Users, Groups, OU, Domain Join) + "Admin" (GPO/Policy, Settings)
- **Active nav:** Blue-tinted bg (`#1f3244`), blue text, 3px blue left accent bar
- **Sidebar collapse** at ≤900px → 56px icon-only rail

---

## 4. Pages

### Page 0: Setup Wizard (First-Run) — NEW

Full-screen wizard (no sidebar/topbar). Shown when no domain is provisioned yet.

**Step 1 — Domain Configuration:**
- Domain FQDN input (e.g., `CORP.LOCAL`)
- NetBIOS name input (auto-derived, editable)
- Administrator password input (with strength meter)
- Confirm password
- DNS forwarder input (default: `8.8.8.8`)

**Step 2 — Confirmation:**
- Summary card: domain name, NetBIOS, DNS, server IP
- Warning: "This will configure this server as the primary Domain Controller"
- "Provision Domain" button (blue, large)

**Step 3 — Progress (after clicking Provision):**
- Animated progress steps with status icons:
  - Installing Samba packages ✓/⏳/○
  - Provisioning domain ✓/⏳/○
  - Configuring DNS ✓/⏳/○
  - Starting services ✓/⏳/○
  - Finalizing ✓/⏳/○
- Live log output (mono font, scrollable, auto-scroll)
- Redirect to Dashboard on success

**Visual:**
- Centered card (max-width 560px), dark bg
- Shield logo at top (48px), blue gradient ring
- Step indicator dots at top (3 dots, current = blue)
- No sidebar, no topbar — full focus on setup

### Page 1: Dashboard
- 4 stat cards (DC Status, Total Users, Joined Devices, Security Alerts)
- Login activity chart (7-day, CSS bars)
- Domain service status (LDAP, Kerberos, DNS, SMB, Replication)
- System resources (CPU, Memory, Disk)
- Recent alerts list
- OU distribution chart
- Quick actions grid

### Page 2: Users
- Filter bar (search, OU, status)
- Data table (username, name, email, OU, status, last logon)
- Row click → slide-in detail panel (Basic Info | Group Membership | Login History)
- Actions: Create, Reset PW, Enable/Disable, Delete, Export CSV

### Page 3: Groups
- Filter bar (search, type)
- Data table (name, category, scope, members, description)
- Row click → slide-in detail panel
- Actions: Create, Add/Remove Members, Delete, Export CSV

### Page 4: OU (Organizational Units)
- Tree view (left) + detail panel (right)
- Tree nodes show user/computer counts
- Actions: Create sub-OU, Edit, Delete, Link GPO

### Page 5: Domain Join (Computers)
- Filter bar (search, OS, status)
- Data table (hostname, OS, IP, OU, status, last logon)
- OS distribution chart + join trend chart
- Actions: Disable, Reset Account, Remove from Domain, Export CSV

### Page 6: GPO (Group Policy)
- GPO list (name, status, links)
- Detail panel: Settings | Linked OUs | Policy Values
- Actions: Create, Link/Unlink, Enable/Disable, Backup, Import, Copy

### Page 7: Settings — ENHANCED
- **Domain Info** (FQDN, NetBIOS, forest, functional level)
- **FSMO Roles** (5 role holders)
- **DNS Servers** (with forwarders)
- **Password Policy** (min length, complexity, history, age)
- **Lockout Policy** (threshold, duration, observation window)
- **Service Management** (NEW): Start/Stop/Restart Samba services, view service logs
- **Backup & Restore** (NEW): Schedule NTDS.dit backups, restore from backup
- **Security Flags** (LDAP signing, SMB signing, anonymous access)

---

## 5. Component Patterns

### Stats Cards
- 4-column grid (2 cols on ≤1200px)
- Right-edge 3px colored accent stripe (blue/green/red/yellow)
- Uppercase label (11.5px) + large mono number (28px, 700) + sub-text + trend pill

### Data Tables
- Rounded container (12px radius), card bg
- Uppercase header row on `#1c2128`
- Hover row `#21262d`, selected = blue tint
- Mono font for usernames (blue), dates, identifiers
- Status badges: dot + label pill — green(active) / gray(inactive) / red(locked)
- Row click opens detail slide-panel

### Slide-in Detail Panel (440px)
- Slides from right, overlay `rgba(0,0,0,0.5)`
- Large avatar (blue gradient + ring), name, account (mono blue), email
- Tabbed: Basic Info | Group Membership | Login History
- Footer actions: Reset PW, Unlock, Disable

### Buttons
- `.btn-primary`: `#3b82f6` bg, white, hover `#2563eb`
- `.btn-outline`: transparent, border `#30363d`
- `.btn-danger`: transparent, red text/border
- All: 6px radius, 0.15s transition, inline-flex icon+text

### Filter Bars
- Search input (with magnifier icon) + custom select dropdowns + status toggle button-group (active=blue)

### Setup Wizard Cards
- Centered, max-width 560px, `--bg-card`, 12px radius, 1px `--border`
- Step indicator: 3 dots, 8px, current=`--accent-blue`, done=`--accent-green`, pending=`--text-muted`
- Progress steps: icon(20px) + label + status badge
- Log output: `--bg-input`, mono font, 13px, max-height 200px, auto-scroll

---

## 6. Responsive Behavior
- ≤1200px: stats grid → 2 columns, charts stack
- ≤900px: sidebar → 56px icon rail, domain pill hidden, panels capped
- Setup Wizard: always centered, max-width 560px, full-height on mobile

---

## 7. Interactions
- Cards and rows have hover lift/elevation
- Smooth transitions (0.15–0.28s cubic-bezier)
- Numbers use mono font and count-up animation on load (optional)
- Charts are CSS-based (divs/flexbox), not external chart libraries
- Notifications dropdown with slide-in animation

---

## 8. Content Language

**API layer:** All API messages, error details, and response labels are in **English** (per GOVERNANCE §7.1).

**UI layer:** All UI labels are in **Korean** (frontend i18n maps English API values to Korean display).

**Identifiers** (usernames, DNs, SIDs, ports) are always in English/mono font.

---

## 9. References

| Site | URL | Reference Point |
|------|-----|-----------------|
| GitHub | github.com | Dark theme, table patterns, sidebar |
| Vercel Dashboard | vercel.com/dashboard | Card layouts, clean spacing |
| Proxmox VE | proxmox | Server admin UI, service status |

---

## 10. Prohibitions

- No colors outside the Design Token palette
- No gradient backgrounds (except setup wizard logo ring)
- No animations over 300ms
- No font sizes below 11px
- No external chart libraries (CSS-only visualizations)
- No Korean text in API responses (English only)
- No dead buttons — unimplemented features must return explicit 501

---

*This Design Brief is the Single Source of Truth for all design generation.*
