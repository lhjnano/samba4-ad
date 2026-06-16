#!/usr/bin/env python3
"""
Samba 4 AD Manager — Project Health Checker

Checks the health of all management areas at once.
Use for CI dashboards, local development, and weekly reviews.

Usage:
  python3 scripts/health-check.py
  python3 scripts/health-check.py --json         # JSON output
  python3 scripts/health-check.py --fix           # Auto-fix fixable items
"""

import json
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class Status(Enum):
    OK = "OK"
    WARN = "WARN"
    FAIL = "FAIL"
    SKIP = "SKIP"


@dataclass
class CheckResult:
    category: str
    name: str
    status: Status
    message: str
    fix_hint: str = ""


class ProjectHealth:
    def __init__(self, project_root: str = "."):
        self.root = Path(project_root).resolve()
        self.results: list[CheckResult] = []

    def run(self) -> bool:
        print("\n" + "=" * 60)
        print("  Samba 4 AD Manager — Project Health Check")
        print("=" * 60 + "\n")

        self._check_structure()
        self._check_git()
        self._check_code_quality()
        self._check_tests()
        self._check_docs()
        self._check_governance()
        self._check_dependencies()
        self._check_security()

        print("\n" + "-" * 60)
        print("  Results")
        print("-" * 60 + "\n")

        categories: dict[str, list[CheckResult]] = {}
        for r in self.results:
            categories.setdefault(r.category, []).append(r)

        all_ok = True
        for cat, checks in categories.items():
            print(f"  {cat}:")
            for r in checks:
                icon = {"OK": "[OK]", "WARN": "[**]", "FAIL": "[XX]", "SKIP": "[--]"}[
                    r.status.value
                ]
                print(f"    {icon} {r.name}: {r.message}")
                if r.status == Status.FAIL:
                    all_ok = False
                    if r.fix_hint:
                        print(f"          -> Fix: {r.fix_hint}")
            print()

        ok = sum(1 for r in self.results if r.status == Status.OK)
        warn = sum(1 for r in self.results if r.status == Status.WARN)
        fail = sum(1 for r in self.results if r.status == Status.FAIL)
        skip = sum(1 for r in self.results if r.status == Status.SKIP)

        print("-" * 60)
        print(f"  Total: {len(self.results)} checks")
        print(f"    OK={ok}  WARN={warn}  FAIL={fail}  SKIP={skip}")
        print("=" * 60 + "\n")

        return all_ok

    def _add(self, category: str, name: str, status: Status, msg: str, fix: str = ""):
        self.results.append(CheckResult(category, name, status, msg, fix))

    # ============================================
    # 1. Structure checks
    # ============================================
    def _check_structure(self):
        required_dirs = ["backend", "frontend", "docs", "previews", "scripts"]
        for d in required_dirs:
            path = self.root / d
            if path.is_dir():
                self._add("Structure", d + "/", Status.OK, "exists")
            else:
                self._add("Structure", d + "/", Status.WARN, "missing", f"mkdir -p {d}")

        # Key files
        for f in [
            ".gitignore",
            ".editorconfig",
            "pyproject.toml",
            "Makefile",
            "CONTRIBUTING.md",
            "README.md",
            ".pre-commit-config.yaml",
        ]:
            if (self.root / f).exists():
                self._add("Structure", f, Status.OK, "exists")
            else:
                self._add("Structure", f, Status.WARN, "missing")

    # ============================================
    # 2. Git checks
    # ============================================
    def _check_git(self):
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            cwd=self.root,
        )
        if result.stdout.strip():
            count = len(result.stdout.strip().split("\n"))
            self._add(
                "Git", "Working tree", Status.WARN, f"{count} uncommitted changes"
            )
        else:
            self._add("Git", "Working tree", Status.OK, "clean")

        result = subprocess.run(
            ["git", "log", "--oneline", "-10", "--format=%s"],
            capture_output=True,
            text=True,
            cwd=self.root,
        )
        commits = result.stdout.strip().split("\n") if result.stdout.strip() else []
        non_conventional = []
        valid_types = {
            "feat",
            "fix",
            "perf",
            "refactor",
            "docs",
            "test",
            "build",
            "ci",
            "chore",
        }

        for commit in commits:
            parts = commit.split(":", 1)
            if len(parts) < 2:
                if not any(commit.startswith(f"{t}!") for t in valid_types):
                    non_conventional.append(commit[:50])
            else:
                prefix = parts[0].split("(")[0]
                if prefix not in valid_types:
                    non_conventional.append(commit[:50])

        if non_conventional:
            self._add(
                "Git",
                "Conventional Commits",
                Status.WARN,
                f"{len(non_conventional)}/10 recent commits non-conventional",
                "Use: type(scope): subject",
            )
        else:
            self._add("Git", "Conventional Commits", Status.OK, "all conform")

    # ============================================
    # 3. Code quality
    # ============================================
    def _check_code_quality(self):
        hook = self.root / ".git" / "hooks" / "pre-commit"
        if hook.exists():
            self._add("Code Quality", "pre-commit hook", Status.OK, "installed")
        else:
            self._add(
                "Code Quality",
                "pre-commit hook",
                Status.FAIL,
                "not installed",
                "Run: pre-commit install",
            )

        if (self.root / ".editorconfig").exists():
            self._add("Code Quality", ".editorconfig", Status.OK, "exists")

        if (self.root / "pyproject.toml").exists():
            self._add("Code Quality", "pyproject.toml", Status.OK, "exists")

        # Backend source check
        if (self.root / "backend" / "src" / "main.py").exists():
            self._add("Code Quality", "backend/src/main.py", Status.OK, "exists")
        else:
            self._add(
                "Code Quality", "backend/src/main.py", Status.SKIP, "not yet created"
            )

    # ============================================
    # 4. Tests
    # ============================================
    def _check_tests(self):
        test_files = list(self.root.glob("backend/tests/**/*.py"))
        if test_files:
            self._add(
                "Tests", "Test files", Status.OK, f"{len(test_files)} files found"
            )
        else:
            self._add("Tests", "Test files", Status.WARN, "no test files yet")

    # ============================================
    # 5. Documentation
    # ============================================
    def _check_docs(self):
        for f in ["README.md", "CONTRIBUTING.md", "docs/design-brief.md"]:
            if (self.root / f).exists():
                self._add("Docs", f, Status.OK, "exists")
            else:
                self._add("Docs", f, Status.WARN, "missing")

        # ADRs
        adrs = (
            list((self.root / "docs" / "adr").glob("*.md"))
            if (self.root / "docs" / "adr").exists()
            else []
        )
        if adrs:
            self._add("Docs", "ADR records", Status.OK, f"{len(adrs)} ADRs")
        else:
            self._add("Docs", "ADR records", Status.WARN, "no ADRs")

        # Previews
        previews = list((self.root / "previews").glob("*.html"))
        if previews:
            self._add("Docs", "UI previews", Status.OK, f"{len(previews)} pages")
        else:
            self._add("Docs", "UI previews", Status.WARN, "no previews")

    # ============================================
    # 6. Governance
    # ============================================
    def _check_governance(self):
        governance_files = [
            "GOVERNANCE.md",
            "DESIGN-INTEGRATION.md",
            "SECURITY.md",
            "DEPLOYMENT.md",
            "INCIDENT-RESPONSE.md",
            "CODEOWNERS",
            "CHANGELOG.md",
            ".audit-ci.json",
        ]
        for f in governance_files:
            if (self.root / f).exists():
                self._add("Governance", f, Status.OK, "exists")
            else:
                self._add("Governance", f, Status.WARN, "missing")

        # PR template
        pr_template = self.root / ".github" / "pull_request_template.md"
        if pr_template.exists():
            self._add("Governance", "PR template", Status.OK, "exists")
        else:
            self._add("Governance", "PR template", Status.WARN, "missing")

        # ADR README index
        adr_readme = self.root / "docs" / "adr" / "README.md"
        if adr_readme.exists():
            self._add("Governance", "ADR index", Status.OK, "exists")
        else:
            self._add("Governance", "ADR index", Status.WARN, "missing")

    # ============================================
    # 7. Dependencies
    # ============================================
    def _check_dependencies(self):
        if (self.root / ".env.example").exists():
            self._add("Dependencies", ".env.example", Status.OK, "exists")
        else:
            self._add(
                "Dependencies",
                ".env.example",
                Status.WARN,
                "missing",
                "Create from .env template",
            )

        if (self.root / "backend" / ".venv").exists():
            self._add("Dependencies", "Python venv", Status.OK, "exists")
        else:
            self._add(
                "Dependencies",
                "Python venv",
                Status.WARN,
                "not created",
                "Run: make install-backend",
            )

    # ============================================
    # 8. Security
    # ============================================
    def _check_security(self):
        if (self.root / ".secrets.baseline").exists():
            self._add("Security", "Secrets baseline", Status.OK, "configured")
        else:
            self._add(
                "Security",
                "Secrets baseline",
                Status.WARN,
                "not configured",
                "Run: detect-secrets scan > .secrets.baseline",
            )

        sensitive_patterns = [".env", "*.key", "*.pem", "credentials*", "secrets.yml"]
        tracked_sensitive = []
        for pattern in sensitive_patterns:
            result = subprocess.run(
                ["git", "ls-files", pattern],
                capture_output=True,
                text=True,
                cwd=self.root,
            )
            if result.stdout.strip():
                tracked_sensitive.extend(result.stdout.strip().split("\n"))

        if tracked_sensitive:
            self._add(
                "Security",
                "Tracked secrets",
                Status.FAIL,
                f"Found: {tracked_sensitive}",
                "git rm --cached <file>",
            )
        else:
            self._add("Security", "Tracked secrets", Status.OK, "none tracked")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Samba 4 AD Manager health check")
    parser.add_argument("--root", default=".", help="Project root directory")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    checker = ProjectHealth(args.root)
    success = checker.run()

    if args.json:
        data = [
            {
                "category": r.category,
                "name": r.name,
                "status": r.status.value,
                "message": r.message,
                "fix_hint": r.fix_hint,
            }
            for r in checker.results
        ]
        print(json.dumps(data, indent=2, ensure_ascii=False))

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
