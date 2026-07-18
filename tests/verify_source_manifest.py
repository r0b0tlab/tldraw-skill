#!/usr/bin/env python3
"""Validate the tldraw skill source manifest, optionally against the network."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Mapping, MutableMapping, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "skills" / "tldraw" / "references" / "source-manifest.json"
APPROVED_HOSTS = {
    "tldraw.dev",
    "www.tldraw.dev",
    "raw.githubusercontent.com",
    "github.com",
    "registry.npmjs.org",
    "hermes-agent.nousresearch.com",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def minimal_manifest() -> Dict[str, Any]:
    return {
        "skill": "tldraw",
        "skill_version": "1.0.0",
        "observed_date": "2026-07-17",
        "observed_npm": {"tldraw": "5.2.5"},
        "sources": [],
        "packages_monorepo_classification": {
            "public_or_published": ["tldraw"],
            "cli_template_infra": [],
            "internal_excluded": [],
        },
    }


def _validate_date(value: object, field: str, errors: List[str]) -> None:
    text = str(value)
    if not DATE_RE.fullmatch(text):
        errors.append(f"{field} must be an ISO date")
        return
    try:
        parsed = date.fromisoformat(text)
    except ValueError:
        errors.append(f"{field} is not a valid date")
        return
    if parsed > date.today():
        errors.append(f"{field} cannot be in the future")


def validate_payload(payload: Mapping[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    warnings: List[str] = []

    if payload.get("skill") != "tldraw":
        errors.append("skill must be tldraw")
    _validate_date(payload.get("observed_date"), "observed_date", errors)

    versions = payload.get("observed_npm")
    if not isinstance(versions, dict) or not versions.get("tldraw"):
        errors.append("observed_npm.tldraw is required")

    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        errors.append("sources must be a non-empty array")
        sources = []

    ids: set[str] = set()
    for index, raw_source in enumerate(sources):
        label = f"sources[{index}]"
        if not isinstance(raw_source, dict):
            errors.append(f"{label} must be an object")
            continue
        source_id = str(raw_source.get("id", "")).strip()
        if not source_id:
            errors.append(f"{label}.id is required")
        elif source_id in ids:
            errors.append(f"duplicate source id: {source_id}")
        ids.add(source_id)

        url = str(raw_source.get("url", "")).strip()
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc:
            errors.append(f"{source_id or label}: source URL must be HTTPS")
        elif parsed.hostname not in APPROVED_HOSTS:
            errors.append(f"{source_id or label}: unapproved source host {parsed.hostname}")

        _validate_date(raw_source.get("observed_date"), f"{source_id or label}.observed_date", errors)

        sha = raw_source.get("sha256")
        size = raw_source.get("bytes")
        if sha is not None and not SHA256_RE.fullmatch(str(sha)):
            errors.append(f"{source_id or label}: sha256 must be 64 lowercase hex characters")
        if size is not None and (not isinstance(size, int) or isinstance(size, bool) or size < 0):
            errors.append(f"{source_id or label}: bytes must be a non-negative integer")
        if (sha is None) != (size is None):
            warnings.append(f"{source_id or label}: hash and byte size should be recorded together")

        if (
            parsed.hostname == "raw.githubusercontent.com"
            and parsed.path.startswith("/tldraw/tldraw/main/")
            and ("/packages/" in parsed.path or "/apps/" in parsed.path)
        ):
            errors.append(f"{source_id or label}: raw runtime source must be version-pinned, not main")

    classification = payload.get("packages_monorepo_classification")
    if not isinstance(classification, dict):
        errors.append("packages_monorepo_classification must be an object")
    else:
        public = set(map(str, classification.get("public_or_published", [])))
        internal = set(map(str, classification.get("internal_excluded", [])))
        overlap = public & internal
        if overlap:
            errors.append(f"package classification overlap: {', '.join(sorted(overlap))}")
        if "tldraw" not in public:
            errors.append("public_or_published must include tldraw")

    return {
        "ok": not errors,
        "source_count": len(sources),
        "errors": errors,
        "warnings": warnings,
    }


def validate_manifest(path: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return {"ok": False, "source_count": 0, "errors": [str(error)], "warnings": []}
    report = validate_payload(payload)
    report["manifest"] = str(path.resolve())
    return report


def verify_network(path: Path, timeout: int = 45) -> Dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    results: List[Dict[str, Any]] = []
    for source in payload.get("sources", []):
        if not isinstance(source, dict) or not source.get("sha256"):
            continue
        request = urllib.request.Request(
            str(source["url"]), headers={"User-Agent": "tldraw-skill-source-verifier/1.0"}
        )
        item: Dict[str, Any] = {"id": source.get("id"), "url": source.get("url")}
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read()
        except (OSError, urllib.error.URLError) as error:
            item.update({"ok": False, "error": str(error)})
        else:
            digest = hashlib.sha256(body).hexdigest()
            item.update(
                {
                    "ok": digest == source.get("sha256") and len(body) == source.get("bytes"),
                    "expected_sha256": source.get("sha256"),
                    "actual_sha256": digest,
                    "expected_bytes": source.get("bytes"),
                    "actual_bytes": len(body),
                }
            )
        results.append(item)
    return {"ok": bool(results) and all(item.get("ok") for item in results), "results": results}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, nargs="?", default=DEFAULT_MANIFEST)
    parser.add_argument("--network", action="store_true")
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args(argv)

    report = validate_manifest(args.manifest)
    if args.network and report["ok"]:
        report["network"] = verify_network(args.manifest, args.timeout)
        report["ok"] = bool(report["network"]["ok"])
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
