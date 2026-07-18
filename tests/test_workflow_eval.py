from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"
HAS_RUNTIME_EVIDENCE = all(
    path.is_file()
    for path in (
        ROOT / "eval-app" / "artifacts" / "eval-status.json",
        ROOT / "tests" / "results" / "sync" / "latest.json",
        ROOT / "tests" / "results" / "agent" / "agent-eval-evidence.json",
        ROOT / "tests" / "results" / "performance" / "latest.json",
    )
)
if str(TESTS) not in sys.path:
    sys.path.insert(0, str(TESTS))

from run_workflow_eval import evaluate_repository  # noqa: E402


class WorkflowEvidenceTests(unittest.TestCase):
    def test_every_declared_workflow_and_assertion_is_evaluated(self) -> None:
        report = evaluate_repository(ROOT)
        source = __import__("json").loads(
            (ROOT / "tests" / "workflow-cases.json").read_text(encoding="utf-8")
        )
        self.assertEqual(report["total"], len(source["cases"]))
        by_id = {case["id"]: case for case in report["cases"]}
        self.assertEqual(set(by_id), {case["id"] for case in source["cases"]})
        for case in source["cases"]:
            with self.subTest(case=case["id"]):
                evaluated = by_id[case["id"]]
                self.assertEqual(
                    set(evaluated["assertions"]),
                    set(case["assertions"]),
                )
                self.assertNotIn("unknown", evaluated["status"])

    @unittest.skipUnless(HAS_RUNTIME_EVIDENCE, "runtime evidence has not been generated")
    def test_current_real_evidence_closes_all_workflow_cases(self) -> None:
        report = evaluate_repository(ROOT)
        failures = [
            (case["id"], assertion, result["detail"])
            for case in report["cases"]
            for assertion, result in case["assertions"].items()
            if not result["ok"]
        ]
        self.assertEqual(failures, [])
        self.assertTrue(report["ok"])
        self.assertEqual(report["passed"], report["total"])


if __name__ == "__main__":
    unittest.main()
