# Contributing

Contributions to this Hermes skill are welcome.

1. Verify claims against the installed tldraw package first, then current official tldraw documentation.
2. Keep `SKILL.md` concise and route detailed guidance to focused files under `references/`.
3. Never hand-author `.tldr` records or duplicate tldraw's schema in Python. Generate, parse, migrate, and validate with the official TypeScript runtime.
4. Add or update tests for every behavior change.
5. Run the complete gate documented in `README.md`. At minimum, every change must pass:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tests/validate_skill.py skills/tldraw
python3 tests/verify_source_manifest.py
npm ci --prefix eval-app
npm test --prefix eval-app
npm run verify --prefix eval-app
```

Changes to sync, agent/starter, migration, or performance guidance must also run their corresponding integration harness and regenerate `python3 tests/run_workflow_eval.py`.

The upstream tldraw repository currently does not accept external code contributions. Report tldraw SDK bugs through its documented issue process; do not open an upstream pull request unless that policy changes or a maintainer requests one.
