#!/usr/bin/env python3
"""Machine-check capability coverage for the tldraw skill (stdlib only).

Usage:
  python3 tests/check_capability_coverage.py \\
    --index https://tldraw.dev/llms.txt \\
    --map tests/capability-map.json \\
    --skill skills/tldraw

  # Deterministic local mode:
  python3 tests/check_capability_coverage.py \\
    --index tests/fixtures/llms.txt \\
    --map tests/capability-map.json \\
    --skill skills/tldraw

  # file:// URLs are also accepted.

Exit codes:
  0 — complete coverage
  1 — coverage gaps / dead refs / duplicates / unjustified exclusions
  2 — usage / IO error
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import urlparse

MD_LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
# bare paths sometimes appear
PATH_RE = re.compile(r"(?P<path>/(?:sdk-features|starter-kits|docs|reference)/[A-Za-z0-9_./\-]+)")

REQUIRED_GUIDANCE = ("inspect", "implement", "verify")


def load_index_text(index: str) -> str:
    """Load index from local path, file:// URL, or http(s)."""
    if index.startswith("file://"):
        parsed = urlparse(index)
        path = Path(urllib.request.url2pathname(parsed.path))
        return path.read_text(encoding="utf-8")
    p = Path(index)
    if p.exists() and p.is_file():
        return p.read_text(encoding="utf-8")
    if index.startswith("http://") or index.startswith("https://"):
        req = urllib.request.Request(
            index,
            headers={"User-Agent": "tldraw-skill-coverage-check/1.0"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="replace")
    raise FileNotFoundError(f"Index not found as path or URL: {index}")


def normalize_path(href: str) -> Optional[str]:
    href = href.strip()
    if href.startswith("http://") or href.startswith("https://"):
        parsed = urlparse(href)
        path = parsed.path or ""
    else:
        path = href.split("#")[0].split("?")[0]
    if not path.startswith("/"):
        if path.startswith("sdk-features/") or path.startswith("starter-kits/") or path.startswith("docs/") or path.startswith("reference/"):
            path = "/" + path
        else:
            return None
    # strip trailing slash
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    return path


def parse_index_paths(text: str) -> Dict[str, Set[str]]:
    """Extract official paths by family from llms-style markdown index."""
    buckets: Dict[str, Set[str]] = {
        "sdk-features": set(),
        "starter-kits": set(),
        "docs": set(),
        "reference": set(),
        "other": set(),
    }
    for _label, href in MD_LINK_RE.findall(text):
        path = normalize_path(href)
        if not path:
            continue
        _classify(path, buckets)
    for m in PATH_RE.finditer(text):
        path = normalize_path(m.group("path"))
        if path:
            _classify(path, buckets)
    return buckets


def _classify(path: str, buckets: Dict[str, Set[str]]) -> None:
    if path.startswith("/sdk-features/"):
        buckets["sdk-features"].add(path)
    elif path.startswith("/starter-kits/"):
        buckets["starter-kits"].add(path)
    elif path.startswith("/docs/"):
        buckets["docs"].add(path)
    elif path.startswith("/reference/"):
        buckets["reference"].add(path)
    else:
        buckets["other"].add(path)


def entry_paths(entries: Iterable[Dict[str, Any]]) -> List[str]:
    out: List[str] = []
    for e in entries:
        p = e.get("path") or e.get("url") or e.get("slug")
        if not p:
            continue
        if isinstance(p, str) and p.startswith("http"):
            np = normalize_path(p)
            if np:
                out.append(np)
        elif isinstance(p, str):
            if not p.startswith("/"):
                # allow slug-only for features as /sdk-features/<slug>
                pass
            np = normalize_path(p) if p.startswith("/") else p
            if np:
                out.append(np if np.startswith("/") else p)
    return out


def skill_ref_exists(skill_dir: Path, ref: str) -> bool:
    ref = ref.split("#")[0]
    if ref.startswith("${HERMES_SKILL_DIR}/"):
        ref = ref[len("${HERMES_SKILL_DIR}/") :]
    target = skill_dir / ref
    return target.is_file()


def normalize_capability_map(capability_map: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize either the test schema or the project entries-based schema."""
    if capability_map.get("features") or capability_map.get("starter_kits") or capability_map.get("starters"):
        return capability_map

    entries = list(capability_map.get("entries") or [])
    features: List[Dict[str, Any]] = []
    starters: List[Dict[str, Any]] = []
    packages: List[Dict[str, Any]] = []
    # Map-level guidance applies to all refs when present
    global_guidance = capability_map.get("inspect_implement_verify") or {}

    for e in entries:
        kind = (e.get("kind") or "").lower()
        url = e.get("url") or e.get("path") or ""
        path = normalize_path(str(url)) if url else None
        if not path and e.get("slug"):
            if kind in {"sdk-feature", "feature"}:
                path = f"/sdk-features/{e['slug']}"
            elif kind in {"starter-kit", "starter_kit", "starter"}:
                path = f"/starter-kits/{e['slug']}"
        refs: List[str] = []
        if e.get("reference"):
            refs.append(str(e["reference"]))
        for key in ("skill_refs", "refs", "references"):
            extra = e.get(key)
            if isinstance(extra, list):
                refs.extend(str(x) for x in extra)
            elif isinstance(extra, str):
                refs.append(extra)
        item = {
            "slug": e.get("slug") or e.get("id"),
            "path": path or e.get("path"),
            "bucket": e.get("bucket"),
            "skill_refs": refs,
            "kind": kind,
            "id": e.get("id"),
        }
        if kind in {"sdk-feature", "feature"}:
            features.append(item)
        elif kind in {"starter-kit", "starter_kit", "starter"}:
            starters.append(item)
        elif kind in {"package", "reference-family", "reference_family", "api", "reference"}:
            packages.append(item)
        elif kind in {"docs", "docs-family"}:
            # treat as mappable/excludable docs paths
            packages.append(item)  # tracked via path in register
            # actually put under a pseudo list handled as packages for path registration
        else:
            # workflow/community/blog/releases — register as packages-like path entries if path known
            if path:
                packages.append(item)

    exclusions = list(capability_map.get("exclusions") or [])
    # Normalize exclusion path field from id/url
    norm_excl = []
    for ex in exclusions:
        ex = dict(ex)
        if not ex.get("path") and ex.get("url"):
            ex["path"] = normalize_path(str(ex["url"])) or ex["url"]
        if not ex.get("path") and ex.get("id"):
            # allow package path ids
            ex["path"] = str(ex["id"]) if str(ex["id"]).startswith("/") else str(ex["id"])
        norm_excl.append(ex)

    return {
        "features": features,
        "starter_kits": starters,
        "packages": packages,
        "exclusions": norm_excl,
        "inspect_implement_verify": global_guidance,
        "_normalized_from_entries": True,
    }


def guidance_present(skill_dir: Path, refs: Sequence[str], global_guidance: Optional[Dict[str, Any]] = None) -> List[str]:
    """Return missing guidance keywords across referenced files and map-level guidance."""
    combined = ""
    if global_guidance:
        combined += "\n" + json.dumps(global_guidance).lower()
        # keys themselves count if they match required names
        for k, v in global_guidance.items():
            combined += f"\n{k}\n{v}"
    for ref in refs:
        path = skill_dir / ref.split("#")[0].replace("${HERMES_SKILL_DIR}/", "")
        if path.is_file():
            combined += "\n" + path.read_text(encoding="utf-8").lower()
    missing = [g for g in REQUIRED_GUIDANCE if g not in combined]
    return missing


def check_coverage(
    index_text: str,
    capability_map: Dict[str, Any],
    skill_dir: Path,
) -> List[str]:
    errors: List[str] = []
    skill_dir = skill_dir.resolve()
    discovered = parse_index_paths(index_text)
    capability_map = normalize_capability_map(capability_map)
    global_guidance = capability_map.get("inspect_implement_verify") or {}

    features = list(capability_map.get("features") or [])
    starters = list(capability_map.get("starter_kits") or capability_map.get("starters") or [])
    packages = list(capability_map.get("packages") or capability_map.get("package_families") or [])
    exclusions = list(capability_map.get("exclusions") or [])

    mapped_paths: List[str] = []
    path_to_entries: Dict[str, List[str]] = {}

    def register(kind: str, entries: List[Dict[str, Any]]) -> None:
        for i, e in enumerate(entries):
            raw = e.get("path") or ""
            if not raw and e.get("slug"):
                if kind == "features":
                    raw = f"/sdk-features/{e['slug']}"
                elif kind == "starter_kits":
                    raw = f"/starter-kits/{e['slug']}"
            path = normalize_path(str(raw)) if raw else None
            if not path and e.get("path"):
                path = str(e.get("path"))
            if not path:
                # package ids that are not URL paths (e.g. packages/foo) — skip fail on missing path for non-web
                if kind == "packages" and (e.get("id") or e.get("slug")):
                    continue
                errors.append(f"{kind}[{i}] missing path/slug")
                continue
            if not path.startswith("/"):
                path = "/" + path.lstrip("/")
            mapped_paths.append(path)
            path_to_entries.setdefault(path, []).append(f"{kind}[{i}]:{e.get('slug', path)}")
            refs = e.get("skill_refs") or e.get("refs") or e.get("references") or []
            if not refs:
                errors.append(f"{kind} entry {path} has no skill_refs")
            for ref in refs:
                if not skill_ref_exists(skill_dir, ref):
                    errors.append(f"Dead skill reference for {path}: {ref} not found")
            missing_g = guidance_present(skill_dir, refs, global_guidance)
            if missing_g and refs:
                errors.append(
                    f"Bucket guidance incomplete for {path}: missing {', '.join(missing_g)} "
                    f"in {refs}"
                )

    register("features", features)
    register("starter_kits", starters)
    register("packages", packages)

    # Duplicates
    for path, ents in path_to_entries.items():
        if len(ents) > 1:
            errors.append(f"Duplicate mapping for {path}: {', '.join(ents)}")

    # Exclusions
    excluded: Set[str] = set()
    for i, ex in enumerate(exclusions):
        raw = ex.get("path") or ex.get("url") or ""
        path = normalize_path(str(raw)) if raw and (str(raw).startswith("/") or str(raw).startswith("http")) else None
        if not path and raw:
            # non-URL exclusion (package id) — still require reason/source
            path = str(raw)
        if not path:
            errors.append(f"exclusions[{i}] missing path")
            continue
        reason = (ex.get("reason") or "").strip()
        source = (ex.get("source") or ex.get("citation") or "").strip()
        if not reason:
            errors.append(f"Exclusion {path} missing reason")
        if not source:
            errors.append(f"Exclusion {path} missing primary-source citation (source)")
        excluded.add(path)
        if path in path_to_entries:
            errors.append(f"Path both mapped and excluded: {path}")

    mapped_set = set(path_to_entries.keys())

    # Fail closed: every /sdk-features and /starter-kits must be mapped or excluded
    for path in sorted(discovered["sdk-features"]):
        if path not in mapped_set and path not in excluded:
            errors.append(f"Unmapped sdk-feature (fail closed): {path}")
    for path in sorted(discovered["starter-kits"]):
        if path not in mapped_set and path not in excluded:
            errors.append(f"Unmapped starter-kit (fail closed): {path}")

    # Public package/API reference families from index
    for path in sorted(discovered["reference"]):
        if path in mapped_set or path in excluded:
            continue
        parts = path.strip("/").split("/")
        family = "/" + "/".join(parts[:2]) if len(parts) >= 2 else path
        if family in mapped_set or family in excluded:
            continue
        if any(m == path or m.startswith(family + "/") or family.startswith(m) for m in mapped_set):
            continue
        if any(m == family or path.startswith(m.rstrip("/") + "/") for m in excluded):
            continue
        errors.append(f"Unmapped public package/API reference (fail closed): {path}")

    # docs paths should be mapped or excluded (so they don't silently drop)
    for path in sorted(discovered["docs"]):
        if path not in mapped_set and path not in excluded:
            errors.append(f"Unmapped docs path (fail closed): {path}")

    # Mapped paths that don't appear in index and aren't under known prefixes
    all_disc = set().union(*discovered.values()) if discovered else set()
    for path in sorted(mapped_set):
        if path not in all_disc:
            if not any(path.startswith(p) for p in ("/sdk-features/", "/starter-kits/", "/docs/", "/reference/", "/community/", "/blog/", "/releases")):
                errors.append(f"Mapped path not found in index and unknown prefix: {path}")

    return errors


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Check tldraw skill capability coverage")
    parser.add_argument("--index", required=True, help="URL, file:// URL, or local path to llms.txt")
    parser.add_argument("--map", required=True, help="Path to capability-map.json")
    parser.add_argument("--skill", required=True, help="Path to skills/tldraw directory")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args(list(argv) if argv is not None else None)

    map_path = Path(args.map)
    skill_dir = Path(args.skill)
    if not map_path.is_file():
        print(f"ERROR: map not found: {map_path}", file=sys.stderr)
        return 2
    if not skill_dir.is_dir():
        print(f"ERROR: skill dir not found: {skill_dir}", file=sys.stderr)
        return 2

    try:
        index_text = load_index_text(args.index)
    except (OSError, urllib.error.URLError, ValueError) as exc:
        print(f"ERROR: failed to load index: {exc}", file=sys.stderr)
        return 2

    try:
        capability_map = json.loads(map_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON map: {exc}", file=sys.stderr)
        return 2

    errors = check_coverage(index_text, capability_map, skill_dir)
    if args.json:
        print(json.dumps({"ok": not errors, "errors": errors, "error_count": len(errors)}, indent=2))
    else:
        print(f"Checking coverage: index={args.index} map={map_path} skill={skill_dir}")
        if errors:
            for err in errors:
                print(f"  ERROR: {err}")
            print(f"FAILED with {len(errors)} error(s)")
        else:
            print("  OK: capability coverage is complete")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
