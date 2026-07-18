#!/usr/bin/env python3
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import verify_source_manifest as verifier


class SourceManifestTests(unittest.TestCase):
    def test_repository_manifest_passes_static_validation(self) -> None:
        root = Path(__file__).resolve().parents[1]
        report = verifier.validate_manifest(
            root / "skills" / "tldraw" / "references" / "source-manifest.json"
        )
        self.assertTrue(report["ok"], report)

    def test_duplicate_source_ids_are_rejected(self) -> None:
        payload = verifier.minimal_manifest()
        payload["sources"] = [
            {"id": "same", "url": "https://tldraw.dev/one", "observed_date": "2026-07-17"},
            {"id": "same", "url": "https://tldraw.dev/two", "observed_date": "2026-07-17"},
        ]
        report = verifier.validate_payload(payload)
        self.assertIn("duplicate source id: same", report["errors"])

    def test_unpinned_raw_runtime_source_is_rejected(self) -> None:
        payload = verifier.minimal_manifest()
        payload["sources"] = [
            {
                "id": "runtime",
                "url": "https://raw.githubusercontent.com/tldraw/tldraw/main/packages/editor/src/index.ts",
                "observed_date": "2026-07-17",
            }
        ]
        report = verifier.validate_payload(payload)
        self.assertTrue(any("must be version-pinned" in error for error in report["errors"]), report)

    def test_non_official_source_host_is_rejected(self) -> None:
        payload = verifier.minimal_manifest()
        payload["sources"] = [
            {"id": "blog", "url": "https://example.com/tldraw", "observed_date": "2026-07-17"}
        ]
        report = verifier.validate_payload(payload)
        self.assertTrue(any("unapproved source host" in error for error in report["errors"]), report)


if __name__ == "__main__":
    unittest.main()
