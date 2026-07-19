#!/usr/bin/env python3
"""Release contracts discovered by independent review."""
from __future__ import annotations
import json
import re
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

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


class PublicReadmeTests(unittest.TestCase):
    def test_readme_is_a_complete_public_entry_point(self) -> None:
        readme = read("README.md")
        required_sections = (
            "## Contents",
            "## Why this skill",
            "## What it covers",
            "## Requirements",
            "## Install",
            "## Quick start",
            "## Example prompts",
            "## How it works",
            "## Helper scripts",
            "## Repository layout",
            "## Security model",
            "## Known limitations",
            "## Troubleshooting",
            "## Contributing",
            "## Release and provenance",
            "## License",
        )
        for section in required_sections:
            self.assertIn(section, readme, f"README is missing {section}")

        self.assertIn(
            "hermes skills install r0b0tlab/tldraw-skill/skills/tldraw", readme
        )
        self.assertIn("tldraw@5.2.5", readme)
        self.assertIn("Provider-backed AI", readme)
        self.assertIn("GitHub Security Advisory", readme)

    def test_readme_relative_links_resolve(self) -> None:
        for raw_target in re.findall(r"!?\[[^]]*\]\(([^)]+)\)", read("README.md")):
            target = raw_target.strip().split(maxsplit=1)[0]
            parsed = urlsplit(target)
            if parsed.scheme or target.startswith(("#", "mailto:")):
                continue
            relative_path = unquote(parsed.path)
            self.assertTrue(
                (ROOT / relative_path).exists(),
                f"README link target does not exist: {relative_path}",
            )


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

    def test_hermes_bundle_references_resolve_to_files(self) -> None:
        """Mirror Hermes' support-path extraction so hub installs cannot fail late."""
        skill_dir = ROOT / "skills" / "tldraw"
        skill_md = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        local_ref_re = re.compile(
            r"(?:\]\(|`|(?:^|[\s\"']))"
            r"((?:references|templates|scripts|assets|examples)/[^\s)`\"'<>]+)",
            re.MULTILINE,
        )
        referenced: set[str] = set()
        for match in local_ref_re.finditer(skill_md.replace("\\", "/")):
            raw = unquote(urlsplit(match.group(1).rstrip(".,;:")).path)
            referenced.add(raw)
            self.assertTrue((skill_dir / raw).is_file(), f"missing support file: {raw}")

        expected = {
            path.relative_to(skill_dir).as_posix()
            for directory in ("references", "templates", "scripts", "assets", "examples")
            if (skill_dir / directory).is_dir()
            for path in (skill_dir / directory).rglob("*")
            if path.is_file()
        }
        self.assertSetEqual(referenced, expected)

    def test_hermes_community_bundle_avoids_known_blocking_false_positives(self) -> None:
        """Keep legitimate docs/scripts clear of current critical/high scanner shorthands."""
        skill_dir = ROOT / "skills" / "tldraw"
        bundled = [skill_dir / "SKILL.md"]
        bundled.extend(
            path
            for directory in ("references", "templates", "scripts")
            for path in (skill_dir / directory).rglob("*")
            if path.is_file()
        )
        blockers = {
            "agent config filename": re.compile(
                r"AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules", re.IGNORECASE
            ),
            "dynamic environment access": re.compile(r"os\.environ\b"),
        }
        for path in bundled:
            text = path.read_text(encoding="utf-8")
            for label, pattern in blockers.items():
                self.assertIsNone(
                    pattern.search(text),
                    f"{label} triggers the Hermes community scanner in {path.relative_to(skill_dir)}",
                )


if __name__ == "__main__":
    unittest.main()
