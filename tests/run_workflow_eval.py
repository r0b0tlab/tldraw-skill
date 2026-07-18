#!/usr/bin/env python3
"""Aggregate reproducible tldraw workflow evidence into one JSON report."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _result(ok: Any, detail: str, *evidence: str) -> dict[str, Any]:
    return {
        "ok": bool(ok),
        "detail": detail,
        "evidence": list(evidence),
    }


def evaluate_repository(root: Path) -> dict[str, Any]:
    root = root.resolve()
    cases_doc = _load_json(root / "tests/workflow-cases.json")
    eval_report = _load_json(root / "eval-app/artifacts/eval-status.json")
    sync = _load_json(root / "tests/results/sync/latest.json")
    agent = _load_json(root / "tests/results/agent/agent-eval-evidence.json")
    activation = _load_json(root / "tests/results/activation/activation-eval.json")
    if not activation:
        activation = _load_json(root / "tests/reviews/activation-summary.json")
    performance = _load_json(root / "tests/results/performance/latest.json")
    visual_scenarios = _load_json(root / "eval-app/artifacts/visual-scenarios/report.json")
    visual_scenario_review = _load_json(root / "tests/reviews/visual-scenario-review.json")
    error_boundary = _load_json(root / "eval-app/artifacts/error-boundary.json")
    upstream_fixture = _load_json(root / "tests/fixtures/upstream-dry-run.json")

    status = eval_report.get("status", {})
    production = eval_report.get("production", {}).get("status", {})
    gates = eval_report.get("gates", {})
    round_steps = status.get("roundTrip", {}).get("steps", {})
    sync_results = {item.get("name"): item for item in sync.get("results", [])}
    activation_results = {item.get("id"): item for item in activation.get("results", [])}

    skill_agents = _text(root / "skills/tldraw/AGENTS.md")
    shapes_ref = _text(root / "skills/tldraw/references/shapes-tools-bindings.md")
    a11y_ref = _text(root / "skills/tldraw/references/ui-accessibility-internationalization.md")
    perf_ref = _text(root / "skills/tldraw/references/performance-security-licensing-deployment.md")
    upstream_ref = _text(root / "skills/tldraw/references/testing-debugging-migrations-upstream.md")
    roundtrip_source = _text(root / "eval-app/src/harness/roundtrip.ts")
    diagram_source = _text(root / "eval-app/src/diagram/create-architecture-diagram.ts")
    custom_source = _text(root / "eval-app/src/custom/EvalBadgeShapeUtil.tsx")
    app_source = _text(root / "eval-app/src/App.tsx")
    sync_rooms = _text(root / "integration/sync-eval/src/server/rooms.ts")
    sync_schema = _text(root / "integration/sync-eval/shared/schema.ts")
    stale_before = _text(root / "tests/fixtures/stale-api-before.txt")
    stale_after = _text(root / "eval-app/src/examples/stale-api-repair.tsx")
    eval_package = _load_json(root / "eval-app/package.json")

    agent_steps = agent.get("steps", {})
    agent_scan = agent.get("bundleSecretScan", {})
    provider = agent.get("providerBackedRequest", {})
    legacy = agent.get("legacyMigration", {})

    two_client = sync_results.get("two-client-create-and-update", {})
    restart = sync_results.get("persistence-survives-server-restart", {})
    room_isolation = sync_results.get("room-isolation", {})
    auth_reject = sync_results.get("auth-reject-invalid-token", {})
    upload_auth = sync_results.get("upload-requires-auth", {})
    upload_media = sync_results.get("upload-rejects-invalid-media", {})
    cors_closed = sync_results.get("cors-explicit-not-open", {})
    bind_closed = sync_results.get("reject-non-loopback-default-token", {})
    upstream_activation = activation_results.get("pos-upstream-monorepo", {})

    stale_absent = all(
        token not in stale_after
        for token in (
            "@tldraw/tldraw",
            "type: 'rectangle'",
            "props: { text:",
            "store.getSnapshot",
            "exportToBlob",
            "editor.batch",
            "setSelectedShapeIds",
            "darkMode",
        )
    )
    verify_script = eval_package.get("scripts", {}).get("verify", "")

    checks: dict[str, dict[str, Any]] = {
        "fixture_has_tldrawFileFormatVersion_schema_records": _result(
            round_steps.get("semanticEnvelope", {}).get("ok"),
            round_steps.get("semanticEnvelope", {}).get("detail", "missing semantic envelope"),
            "eval-app/artifacts/eval-status.json#/status/roundTrip/steps/semanticEnvelope",
        ),
        "reload_preserves_shape_ids_types_bindings": _result(
            round_steps.get("cleanParseLoadSemantics", {}).get("ok")
            and round_steps.get("cleanEditorSemantics", {}).get("ok"),
            round_steps.get("cleanEditorSemantics", {}).get("detail", "missing fresh-editor semantic check"),
            "eval-app/artifacts/eval-status.json#/status/roundTrip/steps/cleanEditorSemantics",
        ),
        "no_python_record_assembly": _result(
            "serializeTldrawJson(editor)" in roundtrip_source
            and "parseTldrawJsonFile" in roundtrip_source
            and "No raw `.tldr` generation" in skill_agents,
            "Fixture is emitted by mounted Editor serializer; skill forbids raw record assembly.",
            "eval-app/src/harness/roundtrip.ts",
            "skills/tldraw/AGENTS.md",
        ),
        "no_browser_console_errors_if_browser_used": _result(
            gates.get("noConsoleErrors") and gates.get("prodNoConsoleErrors"),
            f"dev={gates.get('noConsoleErrors')} prod={gates.get('prodNoConsoleErrors')}",
            "eval-app/artifacts/eval-status.json#/gates",
        ),
        "custom_shape_registered_on_schema": _result(
            status.get("custom", {}).get("migrations")
            and status.get("custom", {}).get("migrationsCheck", {}).get("schemaSequencePresent"),
            status.get("custom", {}).get("migrationsCheck", {}).get("detail", "missing"),
            "eval-app/artifacts/eval-status.json#/status/custom/migrationsCheck",
        ),
        "warns_not_portable_to_tldraw_com": _result(
            "including tldraw.com" in shapes_ref and "only render customs they register" in shapes_ref,
            "Receiving apps must register custom utilities.",
            "skills/tldraw/references/shapes-tools-bindings.md",
        ),
        "parse_uses_app_schema": _result(
            "schema: editor.store.schema" in roundtrip_source,
            "parseTldrawJsonFile receives the mounted app schema.",
            "eval-app/src/harness/roundtrip.ts",
        ),
        "uses_geo_and_toRichText": _result(
            "type: 'geo'" in diagram_source and "toRichText(" in diagram_source,
            "Architecture nodes are geo shapes with rich-text labels.",
            "eval-app/src/diagram/create-architecture-diagram.ts",
        ),
        "bindings_for_arrows": _result(
            "editor.createBindings" in diagram_source
            and status.get("roundTrip", {}).get("invariantsBefore", {}).get("arrow1BindingCount", 0) >= 2,
            f"arrow1 bindings={status.get('roundTrip', {}).get('invariantsBefore', {}).get('arrow1BindingCount')}",
            "eval-app/src/diagram/create-architecture-diagram.ts",
            "eval-app/artifacts/eval-status.json#/status/roundTrip/invariantsBefore",
        ),
        "camera_fit_after_layout": _result(
            "editor.zoomToFit" in diagram_source and "editor.zoomToFit" in app_source,
            "Camera is fit after initial and final runtime layout.",
            "eval-app/src/diagram/create-architecture-diagram.ts",
            "eval-app/src/App.tsx",
        ),
        "visual_review_no_overlaps_if_vision_available": _result(
            visual_scenarios.get("ok")
            and len(visual_scenarios.get("results", [])) == 5
            and visual_scenario_review.get("overall") == "pass"
            and all(item.get("result") == "pass" for item in visual_scenario_review.get("scenarios", [])),
            f"runtime={visual_scenarios.get('ok')} reviewed={visual_scenario_review.get('overall', 'missing')}",
            "tests/reviews/visual-scenario-review.json",
            "eval-app/artifacts/visual-scenarios/report.json",
        ),
        "Driver_constructed_with_editor": _result(
            status.get("driver", {}).get("constructed"),
            status.get("driver", {}).get("detail", "missing"),
            "eval-app/artifacts/eval-status.json#/status/driver",
        ),
        "dispose_called": _result(
            status.get("driver", {}).get("disposed"),
            f"operations={status.get('driver', {}).get('operations', [])}",
            "eval-app/artifacts/eval-status.json#/status/driver",
        ),
        "shapes_created_or_transformed": _result(
            status.get("driver", {}).get("created") and status.get("driver", {}).get("transformed"),
            f"created={status.get('driver', {}).get('created')} transformed={status.get('driver', {}).get('transformed')}",
            "eval-app/artifacts/eval-status.json#/status/driver",
        ),
        "migrations_and_validators_present": _result(
            status.get("custom", {}).get("migrations")
            and "static override props:" in custom_source
            and "static override migrations =" in custom_source,
            status.get("custom", {}).get("migrationsCheck", {}).get("detail", "missing"),
            "eval-app/src/custom/EvalBadgeShapeUtil.tsx",
            "eval-app/artifacts/eval-status.json#/status/custom",
        ),
        "svg_export_path_for_custom_shape": _result(
            "toSvg(" in custom_source and status.get("export", {}).get("svg"),
            f"custom toSvg present; runtime SVG={status.get('export', {}).get('svg')}",
            "eval-app/src/custom/EvalBadgeShapeUtil.tsx",
            "eval-app/artifacts/eval-status.json#/status/export",
        ),
        "keyboard_or_sr_path_documented": _result(
            status.get("a11y", {}).get("ok") and ("keyboard" in a11y_ref.lower() or "screen reader" in a11y_ref.lower()),
            status.get("a11y", {}).get("detail", "missing"),
            "skills/tldraw/references/ui-accessibility-internationalization.md",
            "eval-app/artifacts/eval-status.json#/status/a11y",
        ),
        "hideUi_shortcut_warning": _result(
            "hideUi" in a11y_ref
            and "shortcut" in a11y_ref.lower()
            and status.get("hideUiImpact", {}).get("ok")
            and status.get("hideUiImpact", {}).get("shortcutsStillWorkWithHideUi"),
            "hideUi behavior is documented and verified against installed 5.2.5.",
            "skills/tldraw/references/ui-accessibility-internationalization.md",
            "eval-app/artifacts/eval-status.json#/status/hideUiImpact",
        ),
        "error_boundary_fallback_rendered": _result(
            error_boundary.get("ok") and error_boundary.get("fallbackRendered"),
            error_boundary.get("text", "missing ErrorBoundary evidence"),
            "eval-app/artifacts/error-boundary.json",
        ),
        "indexeddb_persistence_not_localStorage": _result(
            gates.get("persistenceReload")
            and gates.get("persistenceCrossTab")
            and eval_report.get("persistence", {}).get("reload", {}).get("idbAfterReload", {}).get("present"),
            "IndexedDB exists and the marker survives reload plus a same-key second tab.",
            "eval-app/artifacts/eval-status.json#/persistence",
        ),
        "standalone_getSnapshot_loadSnapshot": _result(
            status.get("storeApis", {}).get("standaloneSnapshot")
            and round_steps.get("cleanSnapshotSemantics", {}).get("ok"),
            status.get("storeApis", {}).get("steps", {}).get("standaloneSnapshot", {}).get("detail", "missing"),
            "eval-app/artifacts/eval-status.json#/status/storeApis",
        ),
        "toImage_or_getSvgString": _result(
            status.get("export", {}).get("svg") and status.get("export", {}).get("png"),
            f"svg={status.get('export', {}).get('svg')} png={status.get('export', {}).get('png')}",
            "eval-app/artifacts/eval-status.json#/status/export",
        ),
        "mermaid_package_used": _result(
            status.get("mermaid", {}).get("ok") and status.get("mermaid", {}).get("runtime"),
            status.get("mermaid", {}).get("detail", "missing"),
            "eval-app/artifacts/eval-status.json#/status/mermaid",
        ),
        "refresh_persistence_verified_or_labeled": _result(
            gates.get("persistenceReload"),
            f"reload={gates.get('persistenceReload')} crossTab={gates.get('persistenceCrossTab')}",
            "eval-app/artifacts/eval-status.json#/gates",
        ),
        "one_room_instance_per_document": _result(
            "const rooms = new Map" in sync_rooms and "makeOrLoadRoom" in sync_rooms,
            sync.get("pattern", "missing sync pattern"),
            "integration/sync-eval/src/server/rooms.ts",
            "tests/results/sync/latest.json#/pattern",
        ),
        "schema_parity": _result(
            "createTLSchema" in sync_schema
            and sync.get("versions", {}).get("tldraw") == "5.2.5"
            and sync.get("versions", {}).get("@tldraw/sync") == "5.2.5",
            f"versions={sync.get('versions', {})}",
            "integration/sync-eval/shared/schema.ts",
            "tests/results/sync/latest.json#/versions",
        ),
        "two_client_convergence": _result(
            two_client.get("ok")
            and two_client.get("data", {}).get("onA", {}).get("x") == 333
            and two_client.get("data", {}).get("onBBeforeUpdate", {}).get("x") == 100,
            f"A/B ids={sync.get('clients', {}).get('clientAIds')} / {sync.get('clients', {}).get('clientBIds')}",
            "tests/results/sync/latest.json#/results/1",
        ),
        "restart_preserves_document": _result(
            restart.get("ok") and restart.get("data", {}).get("restored", {}).get("meta", {}).get("marker") == "persist-check",
            f"restored={restart.get('data', {}).get('restored')}",
            "tests/results/sync/latest.json#/results/3",
        ),
        "not_demo_server_for_claimed_production": _result(
            sync.get("ok") and "not production" in sync.get("securityNote", "").lower(),
            sync.get("securityNote", "missing security note"),
            "tests/results/sync/latest.json#/securityNote",
        ),
        "room_isolation_and_auth_rejection": _result(
            room_isolation.get("ok") and auth_reject.get("ok"),
            f"roomIsolation={room_isolation.get('ok')} authReject={auth_reject.get('ok')}",
            "tests/results/sync/latest.json#/results",
        ),
        "upload_auth_and_media_limits": _result(
            upload_auth.get("ok") and upload_media.get("ok"),
            f"auth={upload_auth.get('ok')} media={upload_media.get('ok')}",
            "tests/results/sync/latest.json#/results",
        ),
        "cors_and_bind_fail_closed": _result(
            cors_closed.get("ok") and bind_closed.get("ok"),
            f"cors={cors_closed.get('ok')} bind={bind_closed.get('ok')}",
            "tests/results/sync/latest.json#/results",
        ),
        "official_kit_base": _result(
            agent.get("base", {}).get("source") == "npm create tldraw@latest -- --template agent"
            and agent.get("base", {}).get("tldrawVersion") == "5.2.5",
            f"base={agent.get('base', {})}",
            "tests/results/agent/agent-eval-evidence.json#/base",
        ),
        "action_sanitization_tests": _result(
            agent_steps.get("test", {}).get("ok")
            and "harness sanitize/allowlist/secrets-scan" in agent.get("base", {}).get("customizations", []),
            f"test={agent_steps.get('test')} customizations={agent.get('base', {}).get('customizations')}",
            "tests/results/agent/agent-eval-evidence.json#/steps/test",
        ),
        "no_provider_secret_in_client_bundle": _result(
            agent_scan.get("ok") and not agent_scan.get("hits"),
            agent_scan.get("note", "missing bundle scan"),
            "tests/results/agent/bundle-secret-scan.json",
        ),
        "live_provider_call_or_explicitly_unverified": _result(
            provider.get("status") in {"verified", "unverified"}
            and (provider.get("status") == "verified" or bool(provider.get("reason"))),
            f"status={provider.get('status')} reason={provider.get('reason')}",
            "tests/results/agent/agent-eval-evidence.json#/providerBackedRequest",
        ),
        "versions_detected": _result(
            legacy.get("tldrawVersion") == "5.2.5" and agent.get("base", {}).get("pinnedTldraw") == "5.2.5",
            f"legacy={legacy.get('tldrawVersion')} pinned={agent.get('base', {}).get('pinnedTldraw')}",
            "tests/results/agent/agent-eval-evidence.json",
        ),
        "packages_aligned": _result(
            sync.get("versions", {}).get("tldraw")
            == sync.get("versions", {}).get("@tldraw/sync")
            == sync.get("versions", {}).get("@tldraw/sync-core")
            == "5.2.5",
            f"versions={sync.get('versions', {})}",
            "tests/results/sync/latest.json#/versions",
        ),
        "typecheck_passes": _result(
            agent_steps.get("typecheck", {}).get("ok") and agent_steps.get("workflow_typecheck", {}).get("ok"),
            f"agent={agent_steps.get('typecheck')} workflow={agent_steps.get('workflow_typecheck')}",
            "tests/results/agent/agent-eval-evidence.json#/steps",
        ),
        "no_stale_api_patterns_in_app_code": _result(
            stale_absent,
            "Compiled repair fixture excludes all intentional stale patterns.",
            "eval-app/src/examples/stale-api-repair.tsx",
            "tests/test_stale_api_fixture.py",
        ),
        "no_legacy_at_tldraw_tldraw_import": _result("@tldraw/tldraw" in stale_before and "@tldraw/tldraw" not in stale_after, "Legacy import replaced.", "tests/fixtures/stale-api-before.txt", "eval-app/src/examples/stale-api-repair.tsx"),
        "no_exportToBlob": _result("exportToBlob" in stale_before and "exportToBlob" not in stale_after and "editor.toImage(" in stale_after, "exportToBlob replaced by toImage.", "tests/fixtures/stale-api-before.txt", "eval-app/src/examples/stale-api-repair.tsx"),
        "no_editor_batch": _result("editor.batch" in stale_before and "editor.batch" not in stale_after and "editor.run(" in stale_after, "editor.batch replaced by editor.run.", "tests/fixtures/stale-api-before.txt", "eval-app/src/examples/stale-api-repair.tsx"),
        "no_props_text_for_labels": _result("props: { text:" in stale_before and "toRichText(" in stale_after, "props.text replaced by richText/toRichText.", "tests/fixtures/stale-api-before.txt", "eval-app/src/examples/stale-api-repair.tsx"),
        "colorScheme_not_darkMode_prop": _result("darkMode" in stale_before and 'colorScheme="light"' in stale_after, "darkMode replaced by colorScheme.", "tests/fixtures/stale-api-before.txt", "eval-app/src/examples/stale-api-repair.tsx"),
        "build_passes": _result(
            status.get("ok") and production.get("ok") and "typecheck" in verify_script,
            f"dev={status.get('ok')} prod={production.get('ok')} verify={verify_script}",
            "eval-app/artifacts/eval-status.json",
            "eval-app/package.json#/scripts/verify",
        ),
        "license_key_configured_or_warning_documented": _result(
            "requires license key" in perf_ref and "Production license key" in perf_ref,
            "Production key requirement is explicit; eval remains localhost-only.",
            "skills/tldraw/references/performance-security-licensing-deployment.md",
        ),
        "dev_bridge_absent_in_prod": _result(
            gates.get("prodBridgeAbsent") and eval_report.get("production", {}).get("bridgePresent") is False,
            f"gate={gates.get('prodBridgeAbsent')} bridge={eval_report.get('production', {}).get('bridgePresent')}",
            "eval-app/artifacts/eval-status.json#/production",
        ),
        "no_provider_secrets_in_bundle": _result(
            agent_scan.get("ok") and not agent_scan.get("hits"),
            agent_scan.get("note", "missing bundle scan"),
            "tests/results/agent/bundle-secret-scan.json",
        ),
        "performance_baseline_or_unknown_labeled": _result(
            performance.get("ok")
            and performance.get("shapeCount") == 3999
            and performance.get("maxShapesPerPage") == 4000
            and "machine-specific" in performance.get("note", ""),
            f"shapeCount={performance.get('shapeCount')} createMs={performance.get('createMs')} update100Ms={performance.get('update100Ms')} twoFramesMs={performance.get('twoFramesMs')}",
            "tests/results/performance/latest.json",
            "eval-app/scripts/performance.mjs",
        ),
        "yarn_typecheck_not_bare_tsc": _result(
            upstream_activation.get("passed")
            and (
                "yarn_not_bare_tsc" in upstream_activation.get("response", {}).get("evidence", {})
                or "yarn typecheck" in upstream_ref
            ),
            upstream_activation.get("response", {}).get("evidence", {}).get(
                "yarn_not_bare_tsc", "Real activation case passed; static route requires yarn typecheck."
            ),
            "tests/results/activation/activation-eval.json#pos-upstream-monorepo",
            "tests/reviews/activation-summary.json#pos-upstream-monorepo",
        ),
        "targeted_test_plan": _result(
            upstream_activation.get("passed")
            and (
                "targeted_tests_first" in upstream_activation.get("response", {}).get("evidence", {})
                or "targeted" in upstream_ref.lower()
            ),
            upstream_activation.get("response", {}).get("evidence", {}).get(
                "targeted_tests_first", "Real activation case passed; static route requires targeted tests first."
            ),
            "tests/results/activation/activation-eval.json#pos-upstream-monorepo",
            "tests/reviews/activation-summary.json#pos-upstream-monorepo",
        ),
        "respects_contribution_policy": _result(
            "repository agent instructions" in upstream_ref.lower()
            and "targeted" in upstream_ref.lower()
            and "yarn" in upstream_ref
            and upstream_fixture.get("contribution_policy") == "issues-only",
            "Upstream guidance and executable fixture require repository instructions, targeted Yarn checks, and the current issues-only policy.",
            "skills/tldraw/references/testing-debugging-migrations-upstream.md",
            "tests/fixtures/upstream-dry-run.json",
        ),
    }

    evaluated_cases: list[dict[str, Any]] = []
    for case in cases_doc.get("cases", []):
        assertion_results: dict[str, dict[str, Any]] = {}
        for assertion in case.get("assertions", []):
            assertion_results[assertion] = checks.get(
                assertion,
                _result(False, f"unknown assertion: {assertion}"),
            )
        passed = bool(assertion_results) and all(item["ok"] for item in assertion_results.values())
        evaluated_cases.append(
            {
                "id": case.get("id"),
                "category": case.get("category"),
                "status": "pass" if passed else "fail",
                "expected_routes": case.get("expected_routes", []),
                "assertions": assertion_results,
            }
        )

    passed_count = sum(case["status"] == "pass" for case in evaluated_cases)
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "tests/workflow-cases.json",
        "tldraw_version": "5.2.5",
        "total": len(evaluated_cases),
        "passed": passed_count,
        "failed": len(evaluated_cases) - passed_count,
        "ok": bool(evaluated_cases) and passed_count == len(evaluated_cases),
        "limitations": [
            "Provider-backed AI execution remains unverified when no provider key is available; no response is synthesized.",
            "Performance timings are local machine measurements, not production service-level objectives.",
            "The sync server is an integration harness, not a production deployment.",
        ],
        "cases": evaluated_cases,
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tests/results/workflows/latest.json"),
    )
    args = parser.parse_args()
    root = args.root.resolve()
    output = args.output if args.output.is_absolute() else root / args.output
    report = evaluate_repository(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("total", "passed", "failed", "ok")}, indent=2))
    print(f"evidence: {output}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
