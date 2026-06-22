#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Run all CI checks locally before pushing.
# Usage: ./scripts/ci-local.sh
#        ./scripts/ci-local.sh --fix   (auto-format + auto-fix lint before checking)
#
# This script has two modes:
#   Default: check only (same as GitHub CI)
#   --fix:   auto-format and auto-fix lint issues first, then verify

set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; FAILED=1; }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

FAILED=0
VENV="backend/.venv/bin"
AUTO_FIX="${1:-}"

# ────────────────────────────────────────────────
# Step 0: Auto-fix (if --fix flag)
# ────────────────────────────────────────────────
if [ "$AUTO_FIX" = "--fix" ]; then
  section "0. Auto-fix (format + lint)"
  echo -e "${CYAN}Running ruff format...${NC}"
  $VENV/ruff format backend/ scripts/ --config pyproject.toml
  echo -e "${CYAN}Running ruff check --fix...${NC}"
  $VENV/ruff check backend/ scripts/ --config pyproject.toml --fix || true
  echo -e "${GREEN}Auto-fix complete${NC}"
fi

# ────────────────────────────────────────────────
section "1. Ruff lint"
if $VENV/ruff check backend/ scripts/ --config pyproject.toml; then
  pass "ruff check"
else
  fail "ruff check — run: ./scripts/ci-local.sh --fix"
fi

# ────────────────────────────────────────────────
section "2. Ruff format check"
if $VENV/ruff format --check backend/ scripts/ --config pyproject.toml; then
  pass "ruff format"
else
  fail "ruff format — run: ./scripts/ci-local.sh --fix"
fi

# ────────────────────────────────────────────────
section "3. Pytest (unit, coverage ≥80%)"
if APP_MODE=mock PYTHONPATH=backend $VENV/python -m pytest backend/tests/ -v -m unit \
    --cov=backend/src --cov-report=term-missing --cov-fail-under=80; then
  pass "pytest"
else
  fail "pytest"
fi

# ────────────────────────────────────────────────
section "4. Frontend typecheck + build"
if (cd frontend && npx tsc --noEmit && npx vite build); then
  pass "frontend build"
else
  fail "frontend build"
fi

# ────────────────────────────────────────────────
section "5. Frontend tests"
if (cd frontend && npx vitest run); then
  pass "vitest"
else
  fail "vitest"
fi

# ────────────────────────────────────────────────
section "6. i18n translation completeness"
if (cd frontend && node scripts/i18n-check.js); then
  pass "i18n check"
else
  fail "i18n check — run: cd frontend && npm run i18n:extract"
fi

# ────────────────────────────────────────────────
echo ""
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}══════════════════════════════════════${NC}"
  echo -e "${GREEN}  ALL CHECKS PASSED — safe to push ✓${NC}"
  echo -e "${GREEN}══════════════════════════════════════${NC}"
else
  echo -e "${RED}══════════════════════════════════════${NC}"
  echo -e "${RED}  SOME CHECKS FAILED${NC}"
  echo -e "${RED}  Fix with: ./scripts/ci-local.sh --fix${NC}"
  echo -e "${RED}══════════════════════════════════════${NC}"
  exit 1
fi
