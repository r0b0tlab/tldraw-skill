#!/usr/bin/env python3
"""Release contracts discovered by independent review."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


class PublicApiGuidanceTests(unittest.TestCase):
    def test_file_guidance_uses_only_exported_v1_detection(self) -> None:
        data_ref = read("skills/tldraw/references/data-files-assets-export-mermaid.md")
        migration_ref = read(
            "skills/tldraw/references/testing-debugging-migrations-upstream.md"
        )
        self.assertNotIn("isV1File", data_ref)
        self.assertNotIn("isV1File", migration_ref)
        self.assertIn("parsed.error.type === 'v1File'", data_ref)

    def test_svg_string_guidance_unwraps_public_result(self) -> None:
        data_ref = read("skills/tldraw/references/data-files-assets-export-mermaid.md")
        self.assertIn("const result = await editor.getSvgString(ids)", data_ref)
        self.assertIn("const svg = result.svg", data_ref)

    def test_file_round_trip_guidance_awaits_and_loads_fresh_editor(self) -> None:
        data_ref = read("skills/tldraw/references/data-files-assets-export-mermaid.md")
        self.assertRegex(data_ref, r"await\s+serializeTldrawJson\(")
        self.assertIn("createTLStore", data_ref)
        self.assertIn("loadSnapshot", data_ref)
        self.assertIn("new Editor", data_ref)
        self.assertIn("shapeUtils", data_ref)
        self.assertIn("bindingUtils", data_ref)

    def test_ai_guidance_does_not_invent_editor_get_text(self) -> None:
        ai_ref = read("skills/tldraw/references/ai-and-starter-kits.md")
        self.assertNotIn("editor.getText", ai_ref)
        self.assertIn("getShapeUtil", ai_ref)


class HarnessReleaseContractTests(unittest.TestCase):
    def test_agent_worker_does_not_enable_wildcard_cors(self) -> None:
        worker_root = ROOT / "integration/agent-eval/worker"
        worker_sources = "\n".join(
            path.read_text(encoding="utf-8") for path in worker_root.rglob("*.ts")
        )
        self.assertNotRegex(worker_sources, r"origin\s*:\s*['\"]\*['\"]")
        self.assertNotRegex(
            worker_sources,
            r"['\"]Access-Control-Allow-Origin['\"]\s*:\s*['\"]\*['\"]",
        )
        self.assertIn(
            "isAllowedHarnessOrigin", read("integration/agent-eval/worker/worker.ts")
        )

    def test_workflow_starter_uses_lockfile_strict_install(self) -> None:
        runner = read("integration/agent-eval/scripts/run-eval.ts")
        self.assertIn("record('workflow_install', run('npm', ['ci'], workflowDir))", runner)

    def test_agent_ok_includes_every_workflow_gate(self) -> None:
        runner = read("integration/agent-eval/scripts/run-eval.ts")
        ok_block = runner[runner.index("const evidence = {") : runner.index("timestamp:")]
        for step in ("workflow_install", "workflow_typecheck", "workflow_build"):
            self.assertIn(f"steps.{step}?.ok", ok_block)

    def test_ci_audits_workflow_starter(self) -> None:
        workflow = read(".github/workflows/ci.yml")
        self.assertIn(
            "npm audit --omit=dev --audit-level=high --prefix integration/agent-eval/workflow-starter",
            workflow,
        )
        dependabot = read(".github/dependabot.yml")
        self.assertIn('directory: "/integration/agent-eval/workflow-starter"', dependabot)

    def test_documented_gate_validates_before_python_can_create_caches(self) -> None:
        readme = read("README.md")
        validate_at = readme.index("python3 tests/validate_skill.py")
        unittest_at = readme.index("python3 -m unittest discover")
        self.assertLess(validate_at, unittest_at)
        self.assertIn("PYTHONDONTWRITEBYTECODE=1", readme)

    def test_eval_browser_harness_binds_the_address_it_navigates_to(self) -> None:
        verify = read("eval-app/scripts/verify.mjs")
        self.assertIn("host: '127.0.0.1', port: 5199", verify)

    def test_eval_verify_does_not_rewrite_tracked_fixtures_by_default(self) -> None:
        verify = read("eval-app/scripts/verify.mjs")
        self.assertIn("process.env.UPDATE_FIXTURES === '1'", verify)


if __name__ == "__main__":
    unittest.main()
