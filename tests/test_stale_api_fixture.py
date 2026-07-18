from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BEFORE = ROOT / "tests" / "fixtures" / "stale-api-before.txt"
AFTER = ROOT / "eval-app" / "src" / "examples" / "stale-api-repair.tsx"


class StaleApiRepairFixtureTests(unittest.TestCase):
    def test_fixture_contains_every_intentional_stale_pattern(self) -> None:
        text = BEFORE.read_text(encoding="utf-8")
        for pattern in (
            "@tldraw/tldraw",
            "type: 'rectangle'",
            "props: { text:",
            "editor.store.getSnapshot()",
            "editor.exportToBlob",
            "editor.batch",
            "editor.setSelectedShapeIds",
            "darkMode",
        ):
            with self.subTest(pattern=pattern):
                self.assertIn(pattern, text)

    def test_repaired_fixture_uses_current_public_api_families(self) -> None:
        text = AFTER.read_text(encoding="utf-8")
        for stale in (
            "@tldraw/tldraw",
            "type: 'rectangle'",
            "props: { text:",
            "store.getSnapshot",
            "exportToBlob",
            "editor.batch",
            "setSelectedShapeIds",
            "darkMode",
        ):
            with self.subTest(stale=stale):
                self.assertNotIn(stale, text)
        for current in (
            "from 'tldraw'",
            "type: 'geo'",
            "toRichText(",
            "getSnapshot(editor.store)",
            "editor.toImage(",
            "editor.run(",
            "editor.setSelectedShapes(",
            'colorScheme="light"',
        ):
            with self.subTest(current=current):
                self.assertIn(current, text)


if __name__ == "__main__":
    unittest.main()
