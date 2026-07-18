#!/usr/bin/env python3
"""Read-only project inspector for tldraw applications (Python stdlib only).

Usage:
  python3 inspect_project.py [project-dir] [--json]

Detects package manager/lockfile, workspace/current package, framework/build
tool, declared and lockfile-resolved tldraw/@tldraw versions when feasible,
React/TS versions, scripts, likely custom shape/binding/schema files, and
sync/agent/Mermaid/Driver/license signals. Reports version skew.

Rules: no install, no network, no project script execution, no writes.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

LOCKFILE_MARKERS = (
    ("package-lock.json", "npm"),
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("bun.lockb", "bun"),
    ("bun.lock", "bun"),
)

FRAMEWORK_DEPS = {
    "next": "next",
    "nuxt": "nuxt",
    "react-scripts": "create-react-app",
    "vite": "vite",
    "@remix-run/react": "remix",
    "@remix-run/node": "remix",
    "astro": "astro",
    "gatsby": "gatsby",
    "@angular/core": "angular",
    "vue": "vue",
    "svelte": "svelte",
    "preact": "preact",
    "expo": "expo",
}

BUILD_TOOLS = {
    "vite": "vite",
    "webpack": "webpack",
    "esbuild": "esbuild",
    "rollup": "rollup",
    "parcel": "parcel",
    "turbo": "turborepo",
    "tsup": "tsup",
}

TLDRAW_NAME_RE = re.compile(r"^(tldraw|@tldraw/.+)$")
VERSION_RE = re.compile(r"(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)")

CUSTOM_FILE_HINTS = re.compile(
    r"(shape|binding|schema|ShapeUtil|BindingUtil|TLSchema|migrations)",
    re.IGNORECASE,
)


def read_json(path: Path) -> Optional[Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def find_up(start: Path, names: Sequence[str], stop: Optional[Path] = None) -> Optional[Path]:
    cur = start.resolve()
    stop_res = stop.resolve() if stop else None
    for _ in range(40):
        for name in names:
            cand = cur / name
            if cand.exists():
                return cand
        if stop_res and cur == stop_res:
            break
        if cur.parent == cur:
            break
        cur = cur.parent
    return None


def detect_package_manager(root: Path) -> Tuple[Optional[str], Optional[str]]:
    """Return (manager, lockfile_name) preferring lockfiles in root."""
    for fname, mgr in LOCKFILE_MARKERS:
        if (root / fname).exists():
            return mgr, fname
    # packageManager field
    pkg = read_json(root / "package.json") or {}
    pm = pkg.get("packageManager")
    if isinstance(pm, str):
        name = pm.split("@")[0].strip()
        if name in {"npm", "pnpm", "yarn", "bun"}:
            return name, None
    return None, None


def find_workspace_root(project: Path) -> Path:
    """Walk up looking for workspace markers + package.json."""
    cur = project.resolve()
    best = cur if (cur / "package.json").is_file() else cur
    for _ in range(40):
        pkg_path = cur / "package.json"
        if pkg_path.is_file():
            pkg = read_json(pkg_path) or {}
            if pkg.get("workspaces") or pkg.get("name") == "tldraw" and (cur / "packages").is_dir():
                return cur
            for fname, _ in LOCKFILE_MARKERS:
                if (cur / fname).exists() and pkg.get("private") and (
                    pkg.get("workspaces") or (cur / "pnpm-workspace.yaml").exists()
                ):
                    return cur
            if (cur / "pnpm-workspace.yaml").exists():
                return cur
            best = cur
        if (cur / "pnpm-workspace.yaml").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    # Prefer nearest package.json ancestor with lockfile
    cur = project.resolve()
    for _ in range(40):
        if (cur / "package.json").is_file():
            for fname, _ in LOCKFILE_MARKERS:
                if (cur / fname).exists():
                    return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return best


def collect_deps(pkg: Dict[str, Any]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        block = pkg.get(key) or {}
        if isinstance(block, dict):
            for name, ver in block.items():
                if name not in out:
                    out[name] = str(ver)
    return out


def extract_tldraw_packages(deps: Dict[str, str]) -> Dict[str, Dict[str, Optional[str]]]:
    result: Dict[str, Dict[str, Optional[str]]] = {}
    for name, declared in deps.items():
        if name == "tldraw" or name.startswith("@tldraw/"):
            result[name] = {"declared": declared, "resolved": None}
    return result


def parse_package_lock_versions(lock_path: Path, names: Sequence[str]) -> Dict[str, str]:
    data = read_json(lock_path)
    found: Dict[str, str] = {}
    if not isinstance(data, dict):
        return found
    packages = data.get("packages")
    if isinstance(packages, dict):
        for key, meta in packages.items():
            if not isinstance(meta, dict):
                continue
            # keys like node_modules/tldraw or node_modules/@tldraw/editor
            base = key.split("node_modules/")[-1] if "node_modules/" in key else key
            if base in names and meta.get("version"):
                found[base] = str(meta["version"])
    # npm v1 style dependencies tree
    def walk(deps: Any, prefix: str = "") -> None:
        if not isinstance(deps, dict):
            return
        for name, meta in deps.items():
            if not isinstance(meta, dict):
                continue
            if name in names and meta.get("version"):
                found.setdefault(name, str(meta["version"]))
            walk(meta.get("dependencies"))

    walk(data.get("dependencies"))
    return found


def parse_pnpm_lock_versions(lock_path: Path, names: Sequence[str]) -> Dict[str, str]:
    found: Dict[str, str] = {}
    try:
        text = lock_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return found
    # packages:
    #  /tldraw@3.0.1:
    #  /@tldraw/editor@3.0.1:
    for name in names:
        if name.startswith("@"):
            # /@tldraw/editor@3.0.1
            pat = re.compile(rf"[/']({re.escape(name)})@([^'\":\s/]+)")
        else:
            pat = re.compile(rf"[/']({re.escape(name)})@([^'\":\s/]+)")
        m = pat.search(text)
        if m:
            found[name] = m.group(2)
    return found


def parse_yarn_lock_versions(lock_path: Path, names: Sequence[str]) -> Dict[str, str]:
    found: Dict[str, str] = {}
    try:
        text = lock_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return found
    for name in names:
        # "tldraw@npm:^3.0.0":
        #   version: 3.0.1
        # or tldraw@^3.0.0:
        #   version "3.0.1"
        pat = re.compile(
            rf"(?:^|\n)[\"']?{re.escape(name)}@(?:npm:)?[^\"'\n]*[\"']?:\n(?:.*\n)*?\s+version\s+[\"']?([^\s\"']+)",
            re.MULTILINE,
        )
        m = pat.search(text)
        if m:
            found[name] = m.group(1)
    return found


def normalize_version(ver: Optional[str]) -> Optional[str]:
    if not ver:
        return None
    m = VERSION_RE.search(ver)
    return m.group(1) if m else ver.lstrip("^~>=< ")


def major_minor(ver: Optional[str]) -> Optional[Tuple[int, int]]:
    v = normalize_version(ver)
    if not v:
        return None
    parts = v.split("-")[0].split(".")
    try:
        return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return None


def detect_version_skew(tldraw_pkgs: Dict[str, Dict[str, Optional[str]]]) -> List[str]:
    warnings: List[str] = []
    resolved_mm: Dict[str, Tuple[int, int]] = {}
    for name, info in tldraw_pkgs.items():
        ver = info.get("resolved") or info.get("declared")
        mm = major_minor(ver)
        if mm:
            resolved_mm[name] = mm
    if len(resolved_mm) < 2:
        return warnings
    values = list(resolved_mm.values())
    base = values[0]
    for name, mm in resolved_mm.items():
        if mm != base:
            warnings.append(
                f"version_skew: {name} is {mm[0]}.{mm[1]}.x while another tldraw package is {base[0]}.{base[1]}.x"
            )
    # also compare declared vs resolved
    for name, info in tldraw_pkgs.items():
        d, r = info.get("declared"), info.get("resolved")
        dm, rm = major_minor(d), major_minor(r)
        if dm and rm and dm != rm:
            warnings.append(f"version_skew: {name} declared {d} resolves to {r}")
    return warnings


def detect_framework(deps: Dict[str, str], scripts: Dict[str, str]) -> List[str]:
    found: List[str] = []
    for dep, label in FRAMEWORK_DEPS.items():
        if dep in deps and label not in found:
            found.append(label)
    for dep, label in BUILD_TOOLS.items():
        if dep in deps and label not in found:
            found.append(label)
    script_blob = " ".join(scripts.values()).lower()
    for token, label in (
        ("next", "next"),
        ("vite", "vite"),
        ("remix", "remix"),
        ("astro", "astro"),
        ("webpack", "webpack"),
    ):
        if token in script_blob and label not in found:
            found.append(label)
    return found


def find_custom_files(project: Path, limit: int = 40) -> List[str]:
    hits: List[str] = []
    skip_dirs = {
        "node_modules", ".git", "dist", "build", ".next", "coverage",
        ".turbo", "out", ".cache", "venv", ".venv",
    }
    for path in project.rglob("*"):
        if not path.is_file():
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        if path.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"}:
            continue
        try:
            rel = str(path.relative_to(project))
        except ValueError:
            rel = str(path)
        name_hit = CUSTOM_FILE_HINTS.search(path.name) or CUSTOM_FILE_HINTS.search(rel)
        if name_hit:
            hits.append(rel)
        else:
            try:
                # only read small files
                if path.stat().st_size > 200_000:
                    continue
                head = path.read_text(encoding="utf-8", errors="ignore")[:4000]
            except OSError:
                continue
            if re.search(r"\b(ShapeUtil|BindingUtil|TLGlobalShapePropsMap|createTLSchema)\b", head):
                hits.append(rel)
        if len(hits) >= limit:
            break
    return sorted(set(hits))


def detect_signals(deps: Dict[str, str], project: Path) -> Dict[str, Any]:
    names = set(deps)
    blob_files = []
    for cand in (
        project / ".env",
        project / ".env.local",
        project / ".env.example",
        project / ".env.sample",
    ):
        if cand.is_file():
            try:
                blob_files.append(cand.read_text(encoding="utf-8", errors="ignore"))
            except OSError:
                pass
    env_blob = "\n".join(blob_files)
    # Never return secret values — presence only
    license_present = bool(
        re.search(r"(?i)TLDRAW_LICENSE_KEY\s*=", env_blob)
        or re.search(r"(?i)licenseKey|license_key", env_blob)
        or "tldraw-license" in env_blob.lower()
    )
    # also scan source for licenseKey prop (boolean only)
    if not license_present:
        for path in list(project.rglob("*.ts"))[:80] + list(project.rglob("*.tsx"))[:80]:
            if "node_modules" in path.parts:
                continue
            try:
                if path.stat().st_size > 100_000:
                    continue
                txt = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if re.search(r"\blicenseKey\b", txt):
                license_present = True
                break

    return {
        "sync": any(n in names for n in ("@tldraw/sync", "@tldraw/sync-core")),
        "agent": any("agent" in n.lower() for n in names if "tldraw" in n.lower())
        or any(n in names for n in ("@tldraw/ai",)),
        "mermaid": "@tldraw/mermaid" in names or "mermaid" in names,
        "driver": "@tldraw/driver" in names,
        "license_key_present": license_present,
    }


def scan_source_signals(project: Path, signals: Dict[str, Any]) -> Dict[str, Any]:
    """Augment signals with lightweight source scan (no secrets)."""
    patterns = {
        "sync": re.compile(r"@tldraw/sync|useSync|TLSocketRoom"),
        "agent": re.compile(r"AgentActionUtil|PromptPartUtil|@tldraw/agent"),
        "mermaid": re.compile(r"@tldraw/mermaid|mermaidToTldraw|fromMermaid"),
        "driver": re.compile(r"@tldraw/driver|createDriver|TldrawDriver"),
    }
    skip = {"node_modules", ".git", "dist", "build", ".next"}
    counts = {k: 0 for k in patterns}
    for path in project.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        if any(s in path.parts for s in skip):
            continue
        try:
            if path.stat().st_size > 150_000:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for key, rx in patterns.items():
            if rx.search(text):
                counts[key] += 1
                signals[key] = True
    signals["source_hit_counts"] = counts
    return signals


def inspect_project(project_dir: Path) -> Dict[str, Any]:
    project = project_dir.resolve()
    result: Dict[str, Any] = {
        "project_dir": str(project),
        "ok": True,
        "package_manager": None,
        "lockfile": None,
        "workspace_root": None,
        "current_package": None,
        "package_name": None,
        "has_package_json": False,
        "framework": [],
        "build_tools": [],
        "react_version": None,
        "typescript_version": None,
        "scripts": {},
        "tldraw_packages": {},
        "declared_versions": {},
        "resolved_versions": {},
        "custom_shape_files": [],
        "likely_custom_files": [],
        "signals": {},
        "warnings": [],
        "version_skew": [],
    }

    if not project.is_dir():
        result["ok"] = False
        result["warnings"].append(f"not a directory: {project}")
        return result

    pkg_path = project / "package.json"
    if not pkg_path.is_file():
        found = find_up(project, ["package.json"])
        if found:
            pkg_path = found
            # if we started mid-tree without package.json, still set project
        else:
            result["package_manager"] = None
            result["warnings"].append("no package.json found")
            result["ok"] = True  # absent is valid diagnostic state
            return result

    pkg = read_json(pkg_path) or {}
    result["has_package_json"] = True
    result["package_name"] = pkg.get("name")
    result["current_package"] = str(pkg_path.parent)

    workspace_root = find_workspace_root(pkg_path.parent)
    # If workspaces field or pnpm-workspace present at ancestor, use it
    result["workspace_root"] = str(workspace_root)

    mgr, lock_name = detect_package_manager(workspace_root)
    if not mgr:
        mgr, lock_name = detect_package_manager(pkg_path.parent)
    result["package_manager"] = mgr
    result["lockfile"] = lock_name

    deps = collect_deps(pkg)
    # merge workspace root deps for monorepo root signals
    root_pkg = read_json(workspace_root / "package.json") or {}
    root_deps = collect_deps(root_pkg)
    raw_scripts = pkg.get("scripts")
    scripts: Dict[str, str] = (
        {str(k): str(v) for k, v in raw_scripts.items()}
        if isinstance(raw_scripts, dict)
        else {}
    )
    result["scripts"] = scripts

    frameworks = detect_framework({**root_deps, **deps}, scripts)
    result["framework"] = frameworks
    result["build_tools"] = [f for f in frameworks if f in set(BUILD_TOOLS.values()) | {"vite", "webpack", "esbuild", "rollup", "parcel", "turborepo", "tsup"}]

    result["react_version"] = deps.get("react") or root_deps.get("react")
    result["typescript_version"] = (
        deps.get("typescript") or root_deps.get("typescript")
    )

    tldraw_pkgs = extract_tldraw_packages(deps)
    # also include root-level tldraw deps for monorepos
    for name, info in extract_tldraw_packages(root_deps).items():
        tldraw_pkgs.setdefault(name, info)

    names = list(tldraw_pkgs.keys())
    resolved: Dict[str, str] = {}
    lock_path = None
    if lock_name:
        cand = workspace_root / lock_name
        if cand.exists():
            lock_path = cand
        elif (pkg_path.parent / lock_name).exists():
            lock_path = pkg_path.parent / lock_name
    if lock_path and names:
        if lock_path.name == "package-lock.json":
            resolved = parse_package_lock_versions(lock_path, names)
        elif lock_path.name == "pnpm-lock.yaml":
            resolved = parse_pnpm_lock_versions(lock_path, names)
        elif lock_path.name == "yarn.lock":
            resolved = parse_yarn_lock_versions(lock_path, names)
        # bun.lockb is binary — skip resolved versions

    # node_modules fallback for resolved versions
    for name in names:
        if name in resolved:
            continue
        nm = workspace_root / "node_modules" / name / "package.json"
        if not nm.is_file():
            nm = pkg_path.parent / "node_modules" / name / "package.json"
        meta = read_json(nm)
        if isinstance(meta, dict) and meta.get("version"):
            resolved[name] = str(meta["version"])

    for name, info in tldraw_pkgs.items():
        if name in resolved:
            info["resolved"] = resolved[name]
        result["declared_versions"][name] = info.get("declared")
        result["resolved_versions"][name] = info.get("resolved")

    result["tldraw_packages"] = tldraw_pkgs

    skew = detect_version_skew(tldraw_pkgs)
    result["version_skew"] = skew
    result["warnings"].extend(skew)

    custom = find_custom_files(pkg_path.parent)
    result["custom_shape_files"] = [c for c in custom if re.search(r"shape|ShapeUtil", c, re.I)]
    result["likely_custom_files"] = custom

    signals = detect_signals({**root_deps, **deps}, pkg_path.parent)
    # fix agent signal properly
    all_deps = {**root_deps, **deps}
    signals["sync"] = any(n in all_deps for n in ("@tldraw/sync", "@tldraw/sync-core"))
    signals["driver"] = "@tldraw/driver" in all_deps
    signals["mermaid"] = "@tldraw/mermaid" in all_deps or "mermaid" in all_deps
    signals["agent"] = any(
        x in all_deps for x in ("@tldraw/ai",)
    ) or any("agent" in k for k in all_deps if k.startswith("@tldraw") or k == "tldraw")
    signals = scan_source_signals(pkg_path.parent, signals)
    result["signals"] = signals

    return result


def print_human(data: Dict[str, Any]) -> None:
    print(f"Project: {data.get('project_dir')}")
    print(f"Package manager: {data.get('package_manager') or 'none'}")
    print(f"Lockfile: {data.get('lockfile') or 'none'}")
    print(f"Workspace root: {data.get('workspace_root')}")
    print(f"Current package: {data.get('current_package')} ({data.get('package_name')})")
    print(f"Framework: {', '.join(data.get('framework') or []) or 'unknown'}")
    print(f"React: {data.get('react_version')}")
    print(f"TypeScript: {data.get('typescript_version')}")
    print("tldraw packages:")
    for name, info in (data.get("tldraw_packages") or {}).items():
        print(f"  - {name}: declared={info.get('declared')} resolved={info.get('resolved')}")
    print(f"Signals: {json.dumps(data.get('signals') or {}, sort_keys=True)}")
    if data.get("version_skew"):
        print("Version skew:")
        for w in data["version_skew"]:
            print(f"  ! {w}")
    if data.get("likely_custom_files"):
        print("Likely custom shape/binding/schema files:")
        for f in data["likely_custom_files"][:20]:
            print(f"  - {f}")
    if data.get("warnings"):
        print("Warnings:")
        for w in data["warnings"]:
            print(f"  - {w}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect a project for tldraw-related signals")
    parser.add_argument("project_dir", nargs="?", default=".", help="Project directory (default: .)")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args(list(argv) if argv is not None else None)

    project = Path(args.project_dir)
    data = inspect_project(project)
    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
    else:
        print_human(data)

    # Exit codes: 0 ok, 1 warnings/skew, 2 hard error
    if not data.get("ok") and not data.get("has_package_json") and not project.is_dir():
        return 2
    if data.get("version_skew"):
        return 0  # skew is diagnostic, not failure for inspect
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
