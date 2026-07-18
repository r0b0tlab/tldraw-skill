#!/usr/bin/env python3
"""Run tldraw skill activation cases in isolated Hermes CLI sessions.

The runner uses deterministic checks over compact JSON returned by a fresh
session, plus optional Hermes session tool-trace proof of skill_view loads.
It does not ask the model to edit files or claim runtime behavior.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASES = ROOT / "tests" / "activation-cases.json"
DEFAULT_OUTPUT = ROOT / "tests" / "results" / "activation" / "activation-eval.json"
SKILL_NAME = "tldraw"

LIMITATION_SKILL_LOAD_UNPROVEN = (
    "skill_load_unproven: activate_tldraw self-report is not proof of a real "
    "skill_view load; session tool traces were unavailable for this case"
)
LIMITATION_REFERENCE_LOADS_OPTIONAL = (
    "reference_file_loads_informational: loaded_reference_paths from skill_view "
    "file_path traces are recorded when present but are not required to pass; "
    "route quality is scored from the response routes array against the exact "
    "expected set (plus explicit allowed extras only)"
)


def extract_json(text: str) -> Dict[str, Any]:
    """Extract the first complete JSON object, tolerating Hermes CLI warnings."""
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("Hermes response did not contain a JSON object")


def _route_names(routes: object) -> set[str]:
    if not isinstance(routes, list):
        return set()
    return {Path(str(route)).name for route in routes if str(route).strip()}


def _normalize_route_set(routes: object) -> set[str]:
    if not isinstance(routes, list):
        return set()
    return {Path(str(route)).name for route in routes if str(route).strip()}


def _evidence_has_markers(text: str, markers: Sequence[str], assertion_key: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    # Reject pure key echo / trivial restatement without substance.
    if stripped.lower() == assertion_key.lower():
        return False
    lowered = stripped.lower()
    if not markers:
        # Markers are required for scorable assertions once the suite defines them.
        return bool(stripped)
    return all(str(marker).lower() in lowered for marker in markers if str(marker).strip())


def profile_state_db(profile: str) -> Path:
    if profile and profile != "default":
        return Path.home() / ".hermes" / "profiles" / profile / "state.db"
    return Path.home() / ".hermes" / "state.db"


def collect_session_skill_meta(
    db_path: Path,
    session_id: str,
    skill_name: str = SKILL_NAME,
) -> Dict[str, Any]:
    """Collect skill_view proof from Hermes session messages (deterministic)."""
    empty = {
        "skill_loaded": False,
        "loaded_skill_names": [],
        "loaded_reference_paths": [],
        "skill_load_proof": "session_missing",
    }
    if not session_id or not db_path.is_file():
        return empty

    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return empty

    loaded_names: set[str] = set()
    loaded_paths: set[str] = set()
    try:
        cur = con.cursor()
        exists = cur.execute("SELECT 1 FROM sessions WHERE id = ? LIMIT 1", (session_id,)).fetchone()
        if not exists:
            return empty

        rows = cur.execute(
            "SELECT role, tool_name, tool_calls, content FROM messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        ).fetchall()
        for role, tool_name, tool_calls, content in rows:
            if tool_calls:
                try:
                    calls = json.loads(tool_calls)
                except json.JSONDecodeError:
                    calls = []
                if isinstance(calls, dict):
                    calls = [calls]
                if isinstance(calls, list):
                    for call in calls:
                        if not isinstance(call, dict):
                            continue
                        function_obj = call.get("function")
                        function: dict = function_obj if isinstance(function_obj, dict) else call
                        name = str(function.get("name") or call.get("name") or "")
                        if name != "skill_view":
                            continue
                        raw_args = function.get("arguments", call.get("arguments", {}))
                        if isinstance(raw_args, str):
                            try:
                                args = json.loads(raw_args)
                            except json.JSONDecodeError:
                                args = {}
                        elif isinstance(raw_args, dict):
                            args = raw_args
                        else:
                            args = {}
                        skill = str(args.get("name") or "").strip()
                        if skill:
                            loaded_names.add(skill)
                        file_path = str(args.get("file_path") or args.get("file") or "").strip()
                        if file_path and (not skill or skill == skill_name):
                            loaded_paths.add(file_path)

            if tool_name == "skill_view" and content:
                # Tool results often include name/file fields.
                try:
                    payload = json.loads(content)
                except json.JSONDecodeError:
                    payload = None
                if isinstance(payload, dict):
                    name = str(payload.get("name") or "").strip()
                    if name:
                        loaded_names.add(name)
                    file_path = str(payload.get("file") or payload.get("file_path") or "").strip()
                    if file_path:
                        loaded_paths.add(file_path)
    except sqlite3.Error:
        return empty
    finally:
        con.close()

    skill_loaded = skill_name in loaded_names
    return {
        "skill_loaded": skill_loaded,
        "loaded_skill_names": sorted(loaded_names),
        "loaded_reference_paths": sorted(loaded_paths),
        "skill_load_proof": "session_tool_trace",
    }


def score_case(
    case: Mapping[str, Any],
    response: Mapping[str, Any],
    session_meta: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    expected_activation = bool(case.get("expect_activate"))
    actual_activation = response.get("activate_tldraw")
    checks: Dict[str, Any] = {
        "activation": isinstance(actual_activation, bool) and actual_activation == expected_activation,
    }
    limitations: List[str] = [LIMITATION_REFERENCE_LOADS_OPTIONAL]

    expected_routes = _normalize_route_set(case.get("expected_routes", []))
    allowed_extra_routes = _normalize_route_set(case.get("allowed_extra_routes", []))
    actual_routes = _route_names(response.get("routes"))
    permitted_routes = expected_routes | allowed_extra_routes

    if expected_activation:
        missing = expected_routes - actual_routes
        surplus = actual_routes - permitted_routes
        routes_ok = not missing and not surplus
        checks["routes"] = routes_ok
    else:
        missing = set()
        surplus = set(actual_routes)
        checks["routes"] = not actual_routes

    default_max = len(permitted_routes) if expected_activation else 0
    max_routes = case.get("max_routes", default_max)
    try:
        max_routes_int = int(max_routes)
    except (TypeError, ValueError):
        max_routes_int = default_max
    if expected_activation:
        checks["route_count"] = len(actual_routes) <= max_routes_int
    else:
        checks["route_count"] = len(actual_routes) == 0

    if expected_activation and bool(case.get("require_version_inspection", True)):
        first_step = str(response.get("first_step", "")).lower()
        checks["version_inspection"] = "inspect" in first_step and (
            "version" in first_step or "package" in first_step or "project" in first_step
        )
    else:
        checks["version_inspection"] = True

    evidence = response.get("evidence")
    evidence_map = evidence if isinstance(evidence, dict) else {}
    assertions = [str(item) for item in case.get("assertions", [])]
    markers_map = case.get("evidence_markers", {})
    if not isinstance(markers_map, dict):
        markers_map = {}

    assertion_ok = True
    for assertion in assertions:
        raw = evidence_map.get(assertion)
        if not isinstance(raw, str):
            assertion_ok = False
            break
        markers = markers_map.get(assertion, [])
        if not isinstance(markers, list):
            markers = [str(markers)]
        # If the suite defines evidence_markers for the case, require them.
        # If a key is missing from markers_map entirely while the case has a
        # markers map object, still require non-empty non-echo text only when
        # no markers map is provided at all.
        if markers_map and assertion in markers_map:
            if not _evidence_has_markers(raw, [str(m) for m in markers], assertion):
                assertion_ok = False
                break
        else:
            # Back-compat path: non-empty and not a pure key echo.
            if not raw.strip() or raw.strip().lower() == assertion.lower():
                assertion_ok = False
                break
            # When the case declares any evidence_markers, every assertion must
            # be listed — missing markers fail closed.
            if markers_map:
                assertion_ok = False
                break
    checks["assertion_evidence"] = assertion_ok

    skill_load_proof = "unproven"
    if session_meta is not None:
        skill_loaded = bool(session_meta.get("skill_loaded"))
        skill_load_proof = str(session_meta.get("skill_load_proof") or "session_tool_trace")
        if expected_activation:
            checks["skill_load"] = skill_loaded
        else:
            checks["skill_load"] = not skill_loaded
    else:
        checks["skill_load"] = None
        skill_load_proof = "unproven"
        limitations.append(LIMITATION_SKILL_LOAD_UNPROVEN)

    # Pass requires every boolean check to be True; None skill_load is excluded.
    bool_checks = [value for value in checks.values() if isinstance(value, bool)]
    passed = all(bool_checks)

    result: Dict[str, Any] = {
        "id": case.get("id"),
        "type": case.get("type"),
        "expected_activation": expected_activation,
        "actual_activation": actual_activation,
        "expected_routes": sorted(expected_routes),
        "allowed_extra_routes": sorted(allowed_extra_routes),
        "actual_routes": sorted(actual_routes),
        "missing_routes": sorted(missing),
        "surplus_routes": sorted(surplus),
        "max_routes": max_routes_int,
        "checks": checks,
        "passed": passed,
        "skill_load_proof": skill_load_proof,
        "limitations": limitations,
    }
    if session_meta is not None:
        result["loaded_skill_names"] = list(session_meta.get("loaded_skill_names") or [])
        result["loaded_reference_paths"] = list(session_meta.get("loaded_reference_paths") or [])
    return result


def write_json_atomic(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _build_prompt(case: Mapping[str, Any]) -> str:
    assertions = [str(item) for item in case.get("assertions", [])]
    markers = case.get("evidence_markers", {})
    marker_guidance = ""
    if isinstance(markers, dict) and markers:
        marker_guidance = (
            " Evidence values must include the concrete factual markers for each key "
            f"(case-sensitive substance, not the key name alone): {json.dumps(markers)}. "
        )
    return (
        "This is a skill-routing evaluation. Do not edit files and do not perform the requested work. "
        "Decide whether the installed tldraw skill should activate for the user prompt below. "
        "Load the skill only if it should activate (use skill_view on tldraw). Return exactly one compact JSON object with keys: "
        "activate_tldraw (boolean), first_step (string), routes (array of reference filenames), "
        "reason (string), evidence (object). The evidence object must contain every supplied assertion "
        "key with a concise factual justification; use 'not applicable: <reason>' when appropriate. "
        "Do not merely repeat the assertion key."
        f"{marker_guidance}"
        "Route only the minimal progressive-disclosure reference set needed for the prompt — "
        "do not add gratuitous reference files. "
        "For positive technical requests, first_step must inspect "
        "the project and installed package versions before API advice.\n\n"
        f"USER PROMPT: {case.get('prompt', '')}\n"
        f"ASSERTION KEYS: {json.dumps(assertions)}"
    )


def _selected_cases(cases: Sequence[Mapping[str, Any]], ids: Iterable[str]) -> List[Mapping[str, Any]]:
    requested = set(ids)
    if not requested:
        return list(cases)
    selected = [case for case in cases if str(case.get("id")) in requested]
    missing = requested - {str(case.get("id")) for case in selected}
    if missing:
        raise ValueError(f"Unknown case id(s): {', '.join(sorted(missing))}")
    return selected


def run_case(case: Mapping[str, Any], profile: str, timeout: int) -> Dict[str, Any]:
    started = time.monotonic()
    command = ["hermes", "--profile", profile, "chat", "-Q", "-q", _build_prompt(case)]
    process = subprocess.run(command, capture_output=True, text=True, timeout=timeout, cwd=str(ROOT))
    combined = process.stdout + "\n" + process.stderr
    session_match = re.search(r"session_id:\s*(\S+)", combined)
    session_id = session_match.group(1) if session_match else None
    result: Dict[str, Any] = {
        "id": case.get("id"),
        "duration_seconds": round(time.monotonic() - started, 3),
        "exit_code": process.returncode,
        "session_id": session_id,
    }
    try:
        response = extract_json(process.stdout)
    except ValueError as error:
        result.update({"passed": False, "error": str(error), "stdout": process.stdout, "stderr": process.stderr})
        return result
    result["response"] = response

    session_meta = None
    if session_id:
        session_meta = collect_session_skill_meta(profile_state_db(profile), session_id, skill_name=SKILL_NAME)
        # If DB exists but session row missing, still pass meta with session_missing proof
        # so skill_load is scored as failed rather than silently unproven after a real run.
        result["session_skill_meta"] = session_meta

    result.update(score_case(case, response, session_meta=session_meta))
    if process.returncode != 0:
        result["passed"] = False
        result["process_error"] = process.stderr.strip()
    return result


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--profile", default="tldraweval")
    parser.add_argument("--case", action="append", default=[], dest="case_ids")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args(argv)

    payload = json.loads(args.cases.read_text(encoding="utf-8"))
    selected = _selected_cases(payload["cases"], args.case_ids)
    results: List[Dict[str, Any]] = []
    for index, case in enumerate(selected, start=1):
        print(f"[{index}/{len(selected)}] {case['id']}", flush=True)
        result = run_case(case, args.profile, args.timeout)
        results.append(result)
        print("  PASS" if result.get("passed") else "  FAIL", flush=True)

    passed = sum(bool(result.get("passed")) for result in results)
    report = {
        "schema_version": 2,
        "profile": args.profile,
        "case_source": str(args.cases.resolve()),
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "ok": passed == len(results),
        "scoring_notes": [
            "Routes must match the exact expected set; only explicit allowed_extra_routes may be added.",
            "Route count is capped by max_routes (default: |expected ∪ allowed_extras|).",
            "Assertion evidence must contain case-specific evidence_markers (not generic prose or key echo).",
            "When a Hermes session_id is available, skill_view(tldraw) is verified from profile state.db tool traces.",
            "activate_tldraw alone is never treated as proof of skill load.",
            LIMITATION_REFERENCE_LOADS_OPTIONAL,
        ],
        "results": results,
    }
    write_json_atomic(args.output, report)
    print(json.dumps({key: report[key] for key in ("total", "passed", "failed", "ok")}, sort_keys=True))
    print(args.output.resolve())
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
