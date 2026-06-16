#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Run all CI checks locally before pushing.
# Usage: ./scripts/ci-local.sh

set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; FAILED=1; }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

FAILED=0
VENV="backend/.venv/bin"

# ────────────────────────────────────────────────
section "1. Ruff lint"
if $VENV/ruff check backend/ scripts/ --config pyproject.toml; then
  pass "ruff check"
else
  fail "ruff check"
fi

# ────────────────────────────────────────────────
section "2. Ruff format check"
if $VENV/ruff format --check backend/ scripts/ --config pyproject.toml; then
  pass "ruff format"
else
  fail "ruff format — run: ruff format backend/ scripts/"
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
echo ""
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}══════════════════════════════════════${NC}"
  echo -e "${GREEN}  ALL CHECKS PASSED — safe to push ✓${NC}"
  echo -e "${GREEN}══════════════════════════════════════${NC}"
else
  echo -e "${RED}══════════════════════════════════════${NC}"
  echo -e "${RED}  SOME CHECKS FAILED — fix before push${NC}"
  echo -e "${RED}══════════════════════════════════════${NC}"
  exit 1
fi
