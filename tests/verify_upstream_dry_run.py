#!/usr/bin/env python3
"""Validate the recorded tldraw upstream dry-run contract (stdlib only)."""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Sequence

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "upstream-dry-run.json"
REFERENCE = ROOT / "skills" / "tldraw" / "references" / "testing-debugging-migrations-upstream.md"
USER_AGENT = "hermes-tldraw-upstream-dry-run/1.0"


def compare_upstream(
    expected: Dict[str, Any],
    package: Dict[str, Any],
    agents: str,
    contributing: str,
) -> List[str]:
    errors: List[str] = []
    requirements = expected["requirements"]
    if package.get("packageManager") != requirements["package_manager"]:
        errors.append(
            f"packageManager drift: expected {requirements['package_manager']}, "
            f"got {package.get('packageManager')}"
        )
    if (package.get("engines") or {}).get("node") != requirements["node"]:
        errors.append(
            f"Node engine drift: expected {requirements['node']}, "
            f"got {(package.get('engines') or {}).get('node')}"
        )
    scripts = package.get("scripts") or {}
    for name in ("test", "typecheck", "api-check"):
        if name not in scripts:
            errors.append(f"missing upstream package script: {name}")

    agents_lower = agents.lower()
    agents_plain = agents_lower.replace("`", "")
    if "use yarn" not in agents_plain or "not npm" not in agents_plain:
        errors.append("AGENTS.md no longer clearly requires Yarn over npm")
    if "yarn typecheck" not in agents_plain or "bare tsc" not in agents_plain:
        errors.append("AGENTS.md no longer carries the bare-tsc/typecheck rule")
    if "targeted checks first" not in agents_lower:
        errors.append("AGENTS.md no longer carries the targeted-checks-first rule")

    contributing_lower = contributing.lower()
    if "not accepting contributions" not in contributing_lower:
        errors.append("CONTRIBUTING.md no longer says contributions are closed")
    if "pull requests are turned off" not in contributing_lower:
        errors.append("CONTRIBUTING.md no longer says pull requests are turned off")
    if "create an issue" not in contributing_lower:
        errors.append("CONTRIBUTING.md no longer routes contributors to issues")
    return errors


def fetch_text(url: str) -> str:
    if not url.startswith("https://raw.githubusercontent.com/tldraw/tldraw/"):
        raise ValueError("network source must be an official tldraw raw GitHub HTTPS URL")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def local_checks(expected: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    reference = REFERENCE.read_text(encoding="utf-8")
    requirements = expected["requirements"]
    for needle in (
        requirements["package_manager"],
        requirements["node"],
        "not accepting contributions",
        "issues/7695",
    ):
        if needle.lower() not in reference.lower():
            errors.append(f"reference is missing recorded upstream constraint: {needle}")
    commands = "\n".join(expected["dry_run_commands"])
    for required in ("yarn typecheck", "yarn api-check"):
        if required not in commands:
            errors.append(f"fixture is missing dry-run command: {required}")
    return errors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", action="store_true")
    args = parser.parse_args(argv)
    expected = json.loads(FIXTURE.read_text(encoding="utf-8"))
    errors = local_checks(expected)
    checked = ["fixture", "reference"]
    if args.network:
        try:
            sources = expected["sources"]
            package = json.loads(fetch_text(sources["package"]))
            agents = fetch_text(sources["agents"])
            contributing = fetch_text(sources["contributing"])
            errors.extend(compare_upstream(expected, package, agents, contributing))
            checked.extend(["package.json", "AGENTS.md", "CONTRIBUTING.md"])
        except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
            errors.append(f"network verification failed: {exc}")
    payload = {
        "schema_version": 1,
        "ok": not errors,
        "repository": expected["repository"],
        "observed_date": expected["observed_date"],
        "checked": checked,
        "errors": errors,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
