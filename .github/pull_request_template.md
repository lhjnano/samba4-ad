## Description

<!-- Briefly describe what this PR changes and why -->

Closes #

## Change Type

- [ ] 🐛 Bug fix (fix)
- [ ] ✨ New feature (feat)
- [ ] 🔒 Security-related change (security)
- [ ] ♻️ Refactor (no behavior change)
- [ ] 🚀 Performance improvement (perf)
- [ ] 📝 Documentation (docs)
- [ ] 🔧 Config/dependency (chore)
- [ ] 🚢 Deployment/CI (ci)

## Checklist

### Required (all PRs)
- [ ] Code passes lint (`make lint`)
- [ ] Type check passes (`make typecheck`)
- [ ] Tests pass (`make test`)
- [ ] Self-review completed
- [ ] Commit messages follow Conventional Commits
- [ ] CHANGELOG.md updated

### Conditional (when applicable)
- [ ] New test code written (bug fix / new feature)
- [ ] Documentation updated (when API changes)
- [ ] Dependency added: `pip-audit` / `npm audit` passed + reason in PR description
- [ ] LDAP schema change: Not breaking + backup guide followed
- [ ] New env var: `.env.example` updated + documented

### Security (when touching auth/payment/LDAP)
- [ ] No hardcoded secrets/keys
- [ ] User input validated (Pydantic schema)
- [ ] LDAP injection prevented (ldap3 parameterized queries)
- [ ] Auth/authz verified on all endpoints
- [ ] No PII in logs
- [ ] [SECURITY.md](../SECURITY.md) checklist followed

### Design Preview-Based UI Implementation (UI PRs only)
> See [DESIGN-INTEGRATION.md](../DESIGN-INTEGRATION.md) — previews do not determine data structure

- [ ] **Data First**: LDAP schema derived from domain (not reverse-engineered from preview)
- [ ] **No Hardcoding**: All data on screen comes from real API responses (mock data only in tests)
- [ ] **No Dead Buttons**: Every button/link/form has a working handler
- [ ] **No Empty Handlers**: No `onClick={() => {}}` / `href="#"` / `TODO` on interactive elements
- [ ] **Loading State**: Skeleton/spinner shown during API calls
- [ ] **Error State**: Error message + retry option on API failure
- [ ] **Empty State**: Guidance message when no data
- [ ] **Tracking Table Updated**: Interactive elements registered in `docs/tracking/<page>.md`
- [ ] **Unimplemented Elements**: Buttons not yet functional have `disabled` + tooltip/badge explaining why

## Screenshots / Demo

<!-- For UI changes, attach before/after screenshots or GIF -->

## Additional Context

<!-- Any context reviewers should know (design decisions, trade-offs, etc.) -->

## Deployment Impact

- [ ] Production deployment required
- [ ] LDAP schema migration required
- [ ] New environment variable/secret needed
- [ ] Breaking change (backward compatibility broken)
- [ ] No deployment needed (docs/tests only)
