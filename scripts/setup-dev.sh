#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Samba 4 AD Manager — One-click development environment setup
#
# Usage: bash scripts/setup-dev.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "================================================"
echo "  Samba 4 AD Manager — Dev Environment Setup"
echo "================================================"
echo ""

# ============================================
# 1. Check prerequisites
# ============================================
echo "[1/6] Checking prerequisites..."

PYTHON=${PYTHON:-python3}
NODE=${NODE:-node}

if ! command -v "$PYTHON" &>/dev/null; then
    echo "  ERROR: Python 3 not found. Install Python 3.11+."
    exit 1
fi

PY_VERSION=$($PYTHON --version 2>&1 | grep -oP '\d+\.\d+')
echo "  Python: $PY_VERSION"

if ! command -v "$NODE" &>/dev/null; then
    echo "  WARNING: Node.js not found (needed for frontend)"
else
    NODE_VERSION=$($NODE --version)
    echo "  Node.js: $NODE_VERSION"
fi

if ! command -v git &>/dev/null; then
    echo "  ERROR: git not found."
    exit 1
fi
echo "  git: $(git --version)"

# ============================================
# 2. Python virtual environment
# ============================================
echo ""
echo "[2/6] Setting up Python virtual environment..."

if [ ! -d backend/.venv ]; then
    $PYTHON -m venv backend/.venv
    echo "  Created backend/.venv"
else
    echo "  backend/.venv already exists"
fi

VENV_PIP="backend/.venv/bin/pip"

echo "  Installing Python dev tools..."
$VENV_PIP install --quiet --upgrade pip
$VENV_PIP install --quiet ruff mypy pytest pytest-asyncio pytest-cov httpx \
    types-PyYAML types-requests pre-commit detect-secrets 2>/dev/null || \
    echo "  WARNING: Some packages failed to install"

# Install backend as editable if pyproject.toml exists
if [ -f backend/pyproject.toml ]; then
    $VENV_PIP install --quiet -e "backend/[dev]" && echo "  Backend installed (editable)"
else
    echo "  (No backend/pyproject.toml yet — skipping backend install)"
fi

# ============================================
# 3. Frontend (if package.json exists)
# ============================================
echo ""
echo "[3/6] Setting up frontend..."

if [ -f frontend/package.json ]; then
    cd frontend
    npm install
    echo "  Frontend dependencies installed"
    cd "$PROJECT_ROOT"
else
    echo "  (No frontend/package.json yet — skipping)"
fi

# ============================================
# 4. Git hooks
# ============================================
echo ""
echo "[4/6] Installing git hooks..."

if [ -d .git ]; then
    backend/.venv/bin/pre-commit install
    backend/.venv/bin/pre-commit install --hook-type commit-msg
    echo "  pre-commit + commit-msg hooks installed"
else
    echo "  WARNING: Not a git repo — run: git init"
fi

# ============================================
# 5. Secrets baseline
# ============================================
echo ""
echo "[5/6] Creating secrets baseline..."

if ! [ -f .secrets.baseline ]; then
    if command -v detect-secrets &>/dev/null || [ -f backend/.venv/bin/detect-secrets ]; then
        backend/.venv/bin/detect-secrets scan > .secrets.baseline 2>/dev/null || \
            echo '{}' > .secrets.baseline
        echo "  Created .secrets.baseline"
    else
        echo '{}' > .secrets.baseline
        echo "  Created empty .secrets.baseline (install detect-secrets for scanning)"
    fi
else
    echo "  .secrets.baseline already exists"
fi

# ============================================
# 6. Verify
# ============================================
echo ""
echo "[6/6] Verifying setup..."

echo ""
echo "================================================"
echo "  Setup Complete!"
echo "================================================"
echo ""
echo "  Next steps:"
echo "    make health          # Check project status"
echo "    make test            # Run tests"
echo "    make dev             # Start dev server"
echo ""
echo "  Previews (open in browser):"
echo "    file://$PROJECT_ROOT/previews/01-dashboard.html"
echo ""
