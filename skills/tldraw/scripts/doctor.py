#!/usr/bin/env python3
"""Environment and project doctor for tldraw work (Python stdlib only).

Usage:
  python3 doctor.py [--project DIR] [--json]

Checks Node/package-manager availability, runs project inspection, CSS/container
signals, version mismatch, optional browser/runtime indicators, and license
configuration presence from project files as a boolean only (never prints values).

Rules: no network, no writes, never print env values.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

# Import sibling inspector
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

try:
    from inspect_project import inspect_project
except ImportError:  # pragma: no cover
    inspect_project = None  # type: ignore


def which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


def run_version(cmd: Sequence[str]) -> Optional[str]:
    try:
        proc = subprocess.run(
            list(cmd),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    out = (proc.stdout or proc.stderr or "").strip().splitlines()
    return out[0] if out else None


def detect_css_container_signals(project: Path) -> Dict[str, Any]:
    signals = {
        "tldraw_css_import": False,
        "full_size_container": False,
        "css_files_scanned": 0,
    }
    skip = {"node_modules", ".git", "dist", "build", ".next"}
    css_patterns = (
        re.compile(r"tldraw(?:/|\.)[^\s'\"]*css", re.I),
        re.compile(r"@import\s+['\"].*tldraw", re.I),
    )
    size_patterns = (
        re.compile(r"height\s*:\s*100(vh|%)"),
        re.compile(r"min-height\s*:\s*100(vh|%)"),
        re.compile(r"position\s*:\s*fixed"),
        re.compile(r"inset\s*:\s*0"),
    )
    for path in project.rglob("*"):
        if not path.is_file():
            continue
        if any(s in path.parts for s in skip):
            continue
        if path.suffix.lower() not in {".css", ".scss", ".sass", ".less", ".tsx", ".jsx", ".ts", ".js"}:
            continue
        try:
            if path.stat().st_size > 200_000:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        signals["css_files_scanned"] += 1
        if any(rx.search(text) for rx in css_patterns):
            signals["tldraw_css_import"] = True
        if any(rx.search(text) for rx in size_patterns):
            signals["full_size_container"] = True
        if signals["tldraw_css_import"] and signals["full_size_container"]:
            break
    return signals


def redact_secrets(text: str) -> str:
    """Best-effort redaction if secrets accidentally appear."""
    text = re.sub(r"(?i)(api[_-]?key|token|secret|password|license[_-]?key)\s*[=:]\s*\S+", r"\1=***", text)
    text = re.sub(r"sk-(?:proj-|live-|test-)?[A-Za-z0-9]{10,}", "***", text)
    return text


def doctor(project_dir: Path) -> Dict[str, Any]:
    project = project_dir.resolve()
    checks: Dict[str, Any] = {}
    warnings: List[str] = []
    ok = True

    node_path = which("node")
    npm_path = which("npm")
    pnpm_path = which("pnpm")
    yarn_path = which("yarn")
    bun_path = which("bun")

    checks["node"] = {
        "available": bool(node_path),
        "path": node_path,
        "version": run_version(["node", "--version"]) if node_path else None,
    }
    checks["package_managers"] = {
        "npm": {"available": bool(npm_path), "version": run_version(["npm", "--version"]) if npm_path else None},
        "pnpm": {"available": bool(pnpm_path), "version": run_version(["pnpm", "--version"]) if pnpm_path else None},
        "yarn": {"available": bool(yarn_path), "version": run_version(["yarn", "--version"]) if yarn_path else None},
        "bun": {"available": bool(bun_path), "version": run_version(["bun", "--version"]) if bun_path else None},
    }
    if not node_path:
        warnings.append("Node.js not found on PATH")
        ok = False
    if not any(checks["package_managers"][m]["available"] for m in checks["package_managers"]):
        warnings.append("No package manager (npm/pnpm/yarn/bun) found on PATH")

    # browser / runtime indicators (presence only)
    local_playwright = any(
        (project / "node_modules" / package / "package.json").is_file()
        for package in ("playwright", "@playwright/test")
    )
    checks["browser_runtime"] = {
        "chromium": bool(which("chromium") or which("chromium-browser") or which("google-chrome")),
        "firefox": bool(which("firefox")),
        "playwright": bool(which("playwright") or local_playwright),
        "display_environment": "not_inspected",
    }

    inspect_data: Dict[str, Any] = {}
    if inspect_project is not None and project.is_dir():
        inspect_data = inspect_project(project)
    elif project.is_dir():
        warnings.append("inspect_project module unavailable")
    else:
        warnings.append(f"project directory missing: {project}")
        ok = False

    css = detect_css_container_signals(project) if project.is_dir() else {}
    checks["css_container"] = css
    if inspect_data.get("tldraw_packages") and not css.get("tldraw_css_import"):
        warnings.append("tldraw dependency present but no tldraw CSS import signal found")
    if inspect_data.get("tldraw_packages") and not css.get("full_size_container"):
        warnings.append("no full-size container CSS signal (height: 100vh/% etc.)")

    skew = list(inspect_data.get("version_skew") or [])
    if skew:
        warnings.extend(skew)
        checks["version_mismatch"] = True
    else:
        checks["version_mismatch"] = False

    # Project-file signal only; do not inspect the process environment.
    license_present = bool((inspect_data.get("signals") or {}).get("license_key_present"))
    checks["license_key_present"] = bool(license_present)

    # package manager alignment
    pm = inspect_data.get("package_manager")
    if pm and not checks["package_managers"].get(pm, {}).get("available"):
        warnings.append(f"project uses {pm} but {pm} is not available on PATH")

    result = {
        "ok": ok and not skew,
        "project": str(project),
        "checks": checks,
        "inspect": inspect_data,
        "package_manager": pm,
        "license_key_present": bool(license_present),
        "warnings": warnings,
        "version_skew": skew,
    }
    return result


def print_human(data: Dict[str, Any]) -> None:
    print(f"Doctor: {data.get('project')}")
    checks = data.get("checks") or {}
    node = checks.get("node") or {}
    print(f"Node: {'yes' if node.get('available') else 'no'} {node.get('version') or ''}".rstrip())
    pms = checks.get("package_managers") or {}
    for name, meta in pms.items():
        status = "yes" if meta.get("available") else "no"
        ver = meta.get("version") or ""
        print(f"  {name}: {status} {ver}".rstrip())
    print(f"License key present: {data.get('license_key_present')}")
    print(f"Version mismatch: {(checks.get('version_mismatch'))}")
    css = checks.get("css_container") or {}
    print(f"CSS import signal: {css.get('tldraw_css_import')}  container signal: {css.get('full_size_container')}")
    br = checks.get("browser_runtime") or {}
    print(f"Browser indicators: {json.dumps(br, sort_keys=True)}")
    if data.get("warnings"):
        print("Warnings:")
        for w in data["warnings"]:
            print(f"  - {redact_secrets(str(w))}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="tldraw environment/project doctor")
    parser.add_argument("--project", default=".", help="Project directory (default: .)")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args(list(argv) if argv is not None else None)

    data = doctor(Path(args.project))
    if args.json:
        # Ensure no env secret values leak — rebuild without env dumps
        print(json.dumps(data, indent=2, sort_keys=True, default=str))
    else:
        print_human(data)

    if not data.get("ok"):
        return 1
    if data.get("warnings"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
