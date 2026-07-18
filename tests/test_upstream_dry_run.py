from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "upstream-dry-run.json"
RUNNER = ROOT / "tests" / "verify_upstream_dry_run.py"
REFERENCE = ROOT / "skills" / "tldraw" / "references" / "testing-debugging-migrations-upstream.md"


class UpstreamDryRunTests(unittest.TestCase):
    def test_fixture_encodes_current_upstream_constraints(self) -> None:
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertEqual(data["repository"], "tldraw/tldraw")
        self.assertRegex(data["requirements"]["package_manager"], r"^yarn@4\.")
        self.assertEqual(data["requirements"]["node"], ">=22.12.0")
        self.assertEqual(data["contribution_policy"], "issues-only")
        commands = "\n".join(data["dry_run_commands"])
        self.assertIn("yarn typecheck", commands)
        self.assertIn("yarn api-check", commands)
        self.assertNotRegex(commands, r"(^|\n)npm (test|run)|(^|\n)tsc( |$)")

    def test_reference_matches_fixture(self) -> None:
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        text = REFERENCE.read_text(encoding="utf-8")
        self.assertIn(data["requirements"]["package_manager"], text)
        self.assertIn(data["requirements"]["node"], text)
        self.assertIn("not accepting contributions", text.lower())
        self.assertIn("issues/7695", text)

    def test_local_verifier_passes(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(RUNNER)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertTrue(payload["ok"])

    def test_network_parser_detects_drift(self) -> None:
        spec = importlib.util.spec_from_file_location("upstream_verify", RUNNER)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        package = {
            "packageManager": "yarn@4.12.0",
            "engines": {"node": ">=22.12.0"},
            "scripts": {"typecheck": "x", "api-check": "x", "test": "x"},
        }
        agents = "Use yarn, not npm. Never run bare tsc; use yarn typecheck. Prefer targeted checks first."
        contributing = "We are not accepting contributions. Pull requests are turned off. Create an issue instead."
        self.assertEqual(module.compare_upstream(fixture, package, agents, contributing), [])
        package["packageManager"] = "pnpm@10"
        self.assertTrue(module.compare_upstream(fixture, package, agents, contributing))


if __name__ == "__main__":
    unittest.main()
