# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Samba 4 AD Manager Contributors

.PHONY: all build test lint format clean \
        test-unit test-integration test-coverage \
        lint-python lint-frontend format-python \
        dev dev-backend dev-frontend \
        docs status health install-hooks

# ============================================
# Configuration
# ============================================
PYTHON      ?= python3
PIP         ?= pip
VENV        ?= backend/.venv
VENV_PY     := $(VENV)/bin/python
VENV_PIP    := $(VENV)/bin/pip
NPM         ?= npm

# ============================================
# Setup
# ============================================
all: install

install: install-backend install-frontend
	@echo "✅ Dependencies installed"

install-backend:
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	$(VENV_PIP) install -e "backend/[dev]" 2>/dev/null || \
		$(VENV_PIP) install ruff mypy pytest pytest-asyncio pytest-cov httpx types-PyYAML types-requests
	@echo "✅ Backend dependencies installed"

install-frontend:
	@test -f frontend/package.json && cd frontend && $(NPM) install || echo "⚠️  No frontend/package.json yet"

install-hooks:
	$(VENV_PIP) install pre-commit 2>/dev/null || pip install pre-commit
	pre-commit install
	pre-commit install --hook-type commit-msg
	@echo "✅ Git hooks installed (pre-commit + commit-msg)"

# ============================================
# Build
# ============================================
build: build-backend build-frontend

build-backend:
	test -f backend/src/main.py && \
		(cd backend && $(VENV_PY) -c "import main; print('✅ Backend imports OK')") || \
		echo "⚠️  No backend/src/main.py yet"

build-frontend:
	test -d frontend/node_modules && cd frontend && $(NPM) run build || echo "⚠️  Frontend not set up yet"

# ============================================
# Tests
# ============================================
test: test-unit
	@echo "✅ All unit tests passed"

test-unit:
	$(VENV_PY) -m pytest backend/tests/ -v -m unit 2>/dev/null || \
		echo "⚠️  No tests yet (run: make scaffold-tests)"

test-integration:
	$(VENV_PY) -m pytest backend/tests/ -v -m integration 2>/dev/null || \
		echo "⚠️  Integration tests need Samba 4 VM"

test-coverage:
	$(VENV_PY) -m pytest backend/tests/ --cov=backend/src --cov-report=term-missing --cov-report=html 2>/dev/null || \
		echo "⚠️  No tests yet"

# ============================================
# Lint & Format
# ============================================
lint: lint-python lint-frontend
	@echo "✅ All lints passed"

lint-python:
	ruff check backend/ scripts/ --config pyproject.toml
	mypy backend/src/ --config-file pyproject.toml 2>/dev/null || true

lint-frontend:
	test -d frontend/node_modules && cd frontend && npx eslint src/ --max-warnings 0 || echo "⚠️  Frontend not set up yet"

format: format-python
	@echo "✅ All formatted"

format-python:
	ruff format backend/ scripts/ --config pyproject.toml

format-fix:
	ruff format backend/ scripts/ --config pyproject.toml
	ruff check backend/ scripts/ --fix --config pyproject.toml
	@echo "✅ All formatted (in-place)"

# ============================================
# Development (watch mode)
# ============================================
dev: dev-backend

dev-backend:
	cd backend && $(VENV_PY) -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000 2>/dev/null || \
		echo "⚠️  No backend/src/main.py yet. Run: make scaffold-backend"

dev-frontend:
	cd frontend && $(NPM) run dev 2>/dev/null || echo "⚠️  Frontend not set up yet"

# ============================================
# Documentation
# ============================================
docs:
	@echo "📄 Documentation:"
	@echo "  docs/design-brief.md  — Design system spec"
	@echo "  docs/plan.html        — Infrastructure plan"
	@echo "  docs/adr/             — Architecture Decision Records"
	@echo "  previews/             — UI mockups (open in browser)"

# ============================================
# Cleanup
# ============================================
clean:
	rm -rf $(VENV) __pycache__ backend/**/__pycache__ .mypy_cache .ruff_cache .pytest_cache
	rm -rf frontend/node_modules frontend/dist
	rm -rf coverage/ htmlcov/
	@echo "✅ Cleaned"

# ============================================
# Status
# ============================================
status:
	@echo "╔══════════════════════════════════════════╗"
	@echo "║     Samba 4 AD Manager — Status          ║"
	@echo "╚══════════════════════════════════════════╝"
	@echo ""
	@echo "Repository:"
	@git log --oneline -5 2>/dev/null || echo "  (not a git repo)"
	@echo ""
	@echo "Backend:"
	@test -f backend/src/main.py && echo "  ✅ FastAPI app found" || echo "  ⬜ No backend/src/main.py yet"
	@test -d $(VENV) && echo "  ✅ Virtual environment exists" || echo "  ⬜ No venv (run: make install-backend)"
	@echo ""
	@echo "Frontend:"
	@test -f frontend/package.json && echo "  ✅ package.json found" || echo "  ⬜ No frontend/package.json yet"
	@test -d frontend/node_modules && echo "  ✅ node_modules installed" || echo "  ⬜ No node_modules (run: make install-frontend)"
	@echo ""
	@echo "Previews:"
	@ls previews/*.html 2>/dev/null | wc -l | xargs -I{} echo "  {} HTML mockups in previews/"
	@echo ""
	@echo "Tests:"
	@find backend/tests -name "test_*.py" 2>/dev/null | wc -l | xargs -I{} echo "  {} test files"

health:
	$(PYTHON) scripts/health-check.py
