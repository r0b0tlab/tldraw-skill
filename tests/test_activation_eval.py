#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_activation_eval as runner


class ExtractJsonTests(unittest.TestCase):
    def test_extracts_json_after_cli_warnings(self) -> None:
        text = 'Warning: unavailable toolset\n  notice\n{"activate_tldraw": false, "routes": []}\n'
        self.assertEqual(runner.extract_json(text)["activate_tldraw"], False)

    def test_rejects_missing_object(self) -> None:
        with self.assertRaises(ValueError):
            runner.extract_json("not json")


class ScoreCaseTests(unittest.TestCase):
    def _positive_case(self, **overrides: object) -> dict:
        case = {
            "id": "positive",
            "expect_activate": True,
            "expected_routes": ["references/data.md"],
            "allowed_extra_routes": [],
            "assertions": ["uses_public_api"],
            "evidence_markers": {
                "uses_public_api": ["serializeTldrawJson"],
            },
        }
        case.update(overrides)
        return case

    def _positive_response(self, **overrides: object) -> dict:
        response = {
            "activate_tldraw": True,
            "first_step": "Inspect project and installed version",
            "routes": ["data.md"],
            "evidence": {"uses_public_api": "Use serializeTldrawJson(editor) with the app schema"},
        }
        response.update(overrides)
        return response

    def test_positive_requires_activation_routes_inspection_and_assertions(self) -> None:
        result = runner.score_case(self._positive_case(), self._positive_response())
        self.assertTrue(result["passed"], result)

    def test_positive_can_disable_version_inspection_for_source_only_case(self) -> None:
        case = self._positive_case(require_version_inspection=False)
        response = self._positive_response(first_step="Verify the current official license terms")
        result = runner.score_case(case, response)
        self.assertTrue(result["checks"]["version_inspection"], result)
        self.assertTrue(result["passed"], result)

    def test_negative_fails_if_skill_activates(self) -> None:
        case = {
            "id": "negative",
            "expect_activate": False,
            "expected_routes": [],
            "assertions": ["does_not_activate"],
            "evidence_markers": {
                "does_not_activate": ["not applicable", "tldraw"],
            },
        }
        response = {"activate_tldraw": True, "routes": ["data.md"], "evidence": {}}
        self.assertFalse(runner.score_case(case, response)["passed"])

    def test_positive_rejects_empty_assertion_evidence(self) -> None:
        case = self._positive_case(
            expected_routes=[],
            assertions=["required_fact"],
            evidence_markers={"required_fact": ["fact"]},
        )
        response = self._positive_response(
            routes=[],
            evidence={"required_fact": ""},
        )
        self.assertFalse(runner.score_case(case, response)["passed"])

    def test_positive_rejects_surplus_routes_outside_allowed_extras(self) -> None:
        result = runner.score_case(
            self._positive_case(),
            self._positive_response(routes=["data.md", "shapes-tools-bindings.md"]),
        )
        self.assertFalse(result["passed"])
        self.assertFalse(result["checks"]["routes"])
        self.assertIn("shapes-tools-bindings.md", result["surplus_routes"])

    def test_positive_allows_explicit_extra_routes_only(self) -> None:
        case = self._positive_case(allowed_extra_routes=["references/source-and-version-policy.md"])
        response = self._positive_response(
            routes=["data.md", "source-and-version-policy.md"],
        )
        result = runner.score_case(case, response)
        self.assertTrue(result["checks"]["routes"], result)
        self.assertTrue(result["passed"], result)

    def test_positive_requires_exact_expected_route_set_when_no_extras(self) -> None:
        result = runner.score_case(
            self._positive_case(),
            self._positive_response(routes=[]),
        )
        self.assertFalse(result["checks"]["routes"])
        self.assertFalse(result["passed"])

    def test_positive_rejects_when_route_count_exceeds_max_routes(self) -> None:
        case = self._positive_case(
            expected_routes=["references/a.md", "references/b.md"],
            allowed_extra_routes=["references/c.md"],
            max_routes=2,
            evidence_markers={"uses_public_api": ["serializeTldrawJson"]},
        )
        response = self._positive_response(routes=["a.md", "b.md", "c.md"])
        result = runner.score_case(case, response)
        # Membership can still be within allowed set; the cap is a separate check.
        self.assertTrue(result["checks"]["routes"])
        self.assertFalse(result["checks"]["route_count"])
        self.assertFalse(result["passed"])

    def test_positive_rejects_generic_evidence_missing_markers(self) -> None:
        result = runner.score_case(
            self._positive_case(),
            self._positive_response(
                evidence={"uses_public_api": "Follow public APIs carefully for this task."},
            ),
        )
        self.assertFalse(result["checks"]["assertion_evidence"])
        self.assertFalse(result["passed"])

    def test_positive_rejects_evidence_that_only_repeats_assertion_key(self) -> None:
        result = runner.score_case(
            self._positive_case(),
            self._positive_response(evidence={"uses_public_api": "uses_public_api"}),
        )
        self.assertFalse(result["checks"]["assertion_evidence"])

    def test_negative_requires_empty_routes_and_marker_evidence(self) -> None:
        case = {
            "id": "negative",
            "expect_activate": False,
            "expected_routes": [],
            "assertions": ["does_not_activate"],
            "evidence_markers": {
                "does_not_activate": ["excalidraw"],
            },
        }
        ok = {
            "activate_tldraw": False,
            "routes": [],
            "evidence": {
                "does_not_activate": "Request names Excalidraw, so tldraw skill is not applicable.",
            },
            "first_step": "n/a",
        }
        self.assertTrue(runner.score_case(case, ok)["passed"])
        bad = dict(ok)
        bad["routes"] = ["data.md"]
        self.assertFalse(runner.score_case(case, bad)["checks"]["routes"])

    def test_score_case_accepts_session_skill_trace_for_load_proof(self) -> None:
        case = self._positive_case()
        response = self._positive_response()
        session_meta = {
            "skill_loaded": True,
            "loaded_skill_names": ["tldraw"],
            "loaded_reference_paths": ["references/data.md"],
            "skill_load_proof": "session_tool_trace",
        }
        result = runner.score_case(case, response, session_meta=session_meta)
        self.assertTrue(result["checks"]["skill_load"])
        self.assertEqual(result["skill_load_proof"], "session_tool_trace")

    def test_positive_fails_when_session_trace_shows_skill_not_loaded(self) -> None:
        result = runner.score_case(
            self._positive_case(),
            self._positive_response(),
            session_meta={
                "skill_loaded": False,
                "loaded_skill_names": [],
                "loaded_reference_paths": [],
                "skill_load_proof": "session_tool_trace",
            },
        )
        self.assertFalse(result["checks"]["skill_load"])
        self.assertFalse(result["passed"])

    def test_negative_fails_when_session_trace_shows_skill_loaded(self) -> None:
        case = {
            "id": "negative",
            "expect_activate": False,
            "expected_routes": [],
            "assertions": ["does_not_activate"],
            "evidence_markers": {"does_not_activate": ["not applicable"]},
        }
        response = {
            "activate_tldraw": False,
            "routes": [],
            "evidence": {"does_not_activate": "not applicable: unrelated prompt"},
        }
        result = runner.score_case(
            case,
            response,
            session_meta={
                "skill_loaded": True,
                "loaded_skill_names": ["tldraw"],
                "loaded_reference_paths": [],
                "skill_load_proof": "session_tool_trace",
            },
        )
        self.assertFalse(result["checks"]["skill_load"])
        self.assertFalse(result["passed"])

    def test_without_session_meta_skill_load_is_unproven_not_claimed(self) -> None:
        result = runner.score_case(self._positive_case(), self._positive_response())
        self.assertIsNone(result["checks"].get("skill_load"))
        self.assertEqual(result["skill_load_proof"], "unproven")
        self.assertTrue(
            any(str(item).startswith("skill_load_unproven") for item in result["limitations"])
        )
        # Pass/fail must not pretend skill load was verified.
        self.assertTrue(result["passed"])
        self.assertIsNone(result["checks"].get("skill_load"))

    def test_writes_atomic_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "result.json"
            runner.write_json_atomic(target, {"ok": True})
            self.assertEqual(json.loads(target.read_text()), {"ok": True})
            self.assertFalse(target.with_suffix(".json.tmp").exists())


class ActivationCasesContractTests(unittest.TestCase):
    def test_every_case_has_markers_and_route_policy_fields(self) -> None:
        payload = json.loads((Path(__file__).resolve().parent / "activation-cases.json").read_text())
        self.assertGreaterEqual(payload.get("version", 0), 2)
        for case in payload["cases"]:
            with self.subTest(case["id"]):
                assertions = case.get("assertions") or []
                markers = case.get("evidence_markers") or {}
                self.assertIsInstance(markers, dict)
                for assertion in assertions:
                    self.assertIn(assertion, markers)
                    self.assertTrue(markers[assertion], f"{case['id']}:{assertion} markers empty")
                self.assertIn("expected_routes", case)
                self.assertIn("allowed_extra_routes", case)
                if case.get("expect_activate"):
                    self.assertTrue(case["expected_routes"])
                else:
                    self.assertEqual(case["expected_routes"], [])
                    self.assertEqual(case.get("max_routes", 0), 0)


class SessionTraceTests(unittest.TestCase):
    def _seed_session(
        self,
        db_path: Path,
        session_id: str,
        tool_calls: list,
        tool_rows: list[tuple[str, str]],
    ) -> None:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        cur.executescript(
            """
            CREATE TABLE sessions (
              id TEXT PRIMARY KEY,
              tool_call_count INTEGER
            );
            CREATE TABLE messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT,
              role TEXT,
              content TEXT,
              tool_name TEXT,
              tool_calls TEXT
            );
            """
        )
        cur.execute(
            "INSERT INTO sessions (id, tool_call_count) VALUES (?, ?)",
            (session_id, len(tool_calls)),
        )
        for payload in tool_calls:
            cur.execute(
                "INSERT INTO messages (session_id, role, content, tool_name, tool_calls) "
                "VALUES (?, 'assistant', '', NULL, ?)",
                (session_id, json.dumps(payload)),
            )
        for tool_name, content in tool_rows:
            cur.execute(
                "INSERT INTO messages (session_id, role, content, tool_name, tool_calls) "
                "VALUES (?, 'tool', ?, ?, NULL)",
                (session_id, content, tool_name),
            )
        con.commit()
        con.close()

    def test_collect_session_skill_meta_from_tool_traces(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "state.db"
            session_id = "sess_1"
            tool_calls = [
                [
                    {
                        "type": "function",
                        "function": {
                            "name": "skill_view",
                            "arguments": json.dumps({"name": "tldraw"}),
                        },
                    }
                ],
                [
                    {
                        "type": "function",
                        "function": {
                            "name": "skill_view",
                            "arguments": json.dumps(
                                {"name": "tldraw", "file_path": "references/data.md"}
                            ),
                        },
                    }
                ],
            ]
            self._seed_session(db_path, session_id, tool_calls, [])
            meta = runner.collect_session_skill_meta(db_path, session_id, skill_name="tldraw")
            self.assertTrue(meta["skill_loaded"])
            self.assertEqual(meta["loaded_skill_names"], ["tldraw"])
            self.assertEqual(meta["loaded_reference_paths"], ["references/data.md"])
            self.assertEqual(meta["skill_load_proof"], "session_tool_trace")

    def test_collect_session_skill_meta_missing_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "state.db"
            sqlite3.connect(db_path).close()
            meta = runner.collect_session_skill_meta(db_path, "missing", skill_name="tldraw")
            self.assertFalse(meta["skill_loaded"])
            self.assertEqual(meta["skill_load_proof"], "session_missing")


class RedactedRealRunFixtureTests(unittest.TestCase):
    def test_redacted_real_full_run_fixture_rescores_cleanly(self) -> None:
        root = Path(__file__).resolve().parent
        cases_doc = json.loads((root / "activation-cases.json").read_text(encoding="utf-8"))
        cases = cases_doc["cases"]
        fixture = json.loads(
            (root / "fixtures/activation-real-responses-redacted.json").read_text(
                encoding="utf-8"
            )
        )
        by_id = {item["id"]: item for item in fixture["cases"]}
        self.assertEqual(set(by_id), {case["id"] for case in cases})
        results = [
            runner.score_case(
                case,
                by_id[case["id"]]["response"],
                session_meta=by_id[case["id"]]["session_skill_meta"],
            )
            for case in cases
        ]
        self.assertTrue(all(result["passed"] for result in results), results)


if __name__ == "__main__":
    unittest.main()
