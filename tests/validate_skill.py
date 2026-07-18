#!/usr/bin/env python3
"""Structural and security validation for the tldraw Hermes skill (stdlib only).

Usage:
  python3 tests/validate_skill.py skills/tldraw
  python3 tests/validate_skill.py /absolute/path/to/skills/tldraw

Exit codes:
  0 — valid
  1 — validation errors
  2 — usage / IO error
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import unquote as url_unquote, urlsplit

# Hermes limits (from skill_manager_tool.py)
MAX_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024
MAX_SKILL_CONTENT_CHARS = 100_000
MAX_SKILL_FILE_BYTES = 1_048_576
ALLOWED_SUBDIRS = frozenset({"references", "templates", "scripts", "assets"})
NAME_RE = re.compile(r"^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$")

# stdlib module roots commonly allowed in Python 3 scripts
STDLIB_ROOTS = frozenset(
    {
        "abc", "argparse", "ast", "asyncio", "base64", "bisect", "builtins",
        "calendar", "cmath", "cmd", "codecs", "collections", "concurrent",
        "configparser", "contextlib", "copy", "csv", "ctypes", "dataclasses",
        "datetime", "decimal", "difflib", "dis", "email", "enum", "errno",
        "fnmatch", "fractions", "functools", "gc", "getopt", "getpass",
        "gettext", "glob", "gzip", "hashlib", "heapq", "hmac", "html", "http",
        "importlib", "inspect", "io", "ipaddress", "itertools", "json",
        "keyword", "linecache", "locale", "logging", "lzma", "math", "mimetypes",
        "mmap", "multiprocessing", "netrc", "numbers", "operator", "os",
        "pathlib", "pickle", "pkgutil", "platform", "plistlib", "pprint",
        "queue", "random", "re", "reprlib", "secrets", "select", "shlex",
        "shutil", "signal", "socket", "socketserver", "sqlite3", "ssl",
        "stat", "statistics", "string", "struct", "subprocess", "sys",
        "sysconfig", "tarfile", "tempfile", "textwrap", "threading", "time",
        "timeit", "token", "tokenize", "tomllib", "traceback", "types",
        "typing", "unicodedata", "unittest", "urllib", "uuid", "warnings",
        "wave", "weakref", "xml", "xmlrpc", "zipfile", "zipimport", "zlib",
        "_thread", "__future__", "posixpath", "ntpath", "genericpath",
    }
)

# Stale tldraw anti-patterns that must not appear in executable snippets
STALE_PATTERNS = [
    (re.compile(r"\beditor\.batch\s*\("), "editor.batch()"),
    (re.compile(r"\bsetSelectedShapeIds\s*\("), "setSelectedShapeIds()"),
    (re.compile(r"\beditor\.store\.getSnapshot\s*\("), "editor.store.getSnapshot()"),
    (re.compile(r"@tldraw/tldraw"), "legacy @tldraw/tldraw package"),
    (re.compile(r"\bexportAs\s*\("), "exportAs()"),
    (re.compile(r"\bexportToBlob\s*\("), "exportToBlob()"),
    (re.compile(r"\bdarkMode\s*[=:]"), "darkMode prop"),
    (re.compile(r"\bforceDarkMode\b"), "forceDarkMode"),
    (re.compile(r"type\s*:\s*['\"]rectangle['\"]"), "type: 'rectangle'"),
    (re.compile(r"props\.text\s*="), "props.text ="),
]

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[=:]\s*['\"]?[A-Za-z0-9_\-]{16,}"),
    re.compile(r"sk-(?:proj-|live-|test-)?[A-Za-z0-9]{20,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*"),
    re.compile(r"(?i)-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]

UNSAFE_SHELL = [
    re.compile(r"\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?/(?:\s|$)"),
    re.compile(r"\bcurl\b.+\|\s*(?:ba)?sh\b"),
    re.compile(r"\beval\s*\("),
    re.compile(r"\bexec\s*\(\s*['\"]"),
    re.compile(r"\$\(.*\$\{?[^}]*\}?.*\)"),  # nested shell interpolation risk in docs examples
]

DESTRUCTIVE = [
    re.compile(r"\bmkfs\b"),
    re.compile(r"\bdd\s+if="),
    re.compile(r":\(\)\s*\{\s*:\|:\s*&\s*\}\s*;"),
]

PITFALL_MARKERS = re.compile(
    r"(?i)(pitfall|anti-?pattern|stale|outdated|do not|don't|never use|legacy|wrong|incorrect|deprecated)"
)

MD_LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
HERMES_PATH_RE = re.compile(r"\$\{HERMES_SKILL_DIR\}/([^\s)`\"']+)")
CODE_FENCE_RE = re.compile(r"```([a-zA-Z0-9_+-]*)\n(.*?)```", re.DOTALL)


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def parse_top_level_frontmatter(frontmatter: str) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    for line in frontmatter.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith((" ", "\t", "-")):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = unquote(value.strip())
    return fields


def has_metadata_block(frontmatter: str) -> bool:
    return bool(re.search(r"(?m)^metadata\s*:", frontmatter))


def extract_fenced_code(text: str) -> List[Tuple[str, str, int]]:
    """Return list of (lang, code, start_char_offset)."""
    out: List[Tuple[str, str, int]] = []
    for m in CODE_FENCE_RE.finditer(text):
        out.append((m.group(1).lower(), m.group(2), m.start()))
    return out


def line_context_is_pitfall(text: str, offset: int, window: int = 400) -> bool:
    """Allow stale API *names* in prose; fenced executable snippets need a label.

    A fenced code block is treated as executable guidance unless its fence
    info string (e.g. ```ts pitfall) or an immediately preceding HTML comment
    on the prior non-empty line marks it as a negative/pitfall example.
    """
    # Fence header: ```ts pitfall / ```javascript anti-pattern
    fence_line_start = text.rfind("```", max(0, offset - 5), offset + 5)
    if fence_line_start < 0:
        fence_line_start = text.rfind("```", 0, offset + 1)
    if fence_line_start >= 0:
        fence_header_end = text.find("\n", fence_line_start)
        if fence_header_end > fence_line_start:
            header = text[fence_line_start:fence_header_end]
            if PITFALL_MARKERS.search(header):
                return True
    # Immediately preceding non-empty line only (not the whole section)
    before = text[:offset]
    lines = [ln.strip() for ln in before.splitlines() if ln.strip()]
    if lines:
        prev = lines[-1]
        if prev.startswith("<!--") and PITFALL_MARKERS.search(prev):
            return True
        if re.match(
            r"(?i)^(bad|wrong|incorrect|stale|outdated|anti-?pattern|do not|don't|never)\b",
            prev,
        ):
            return True
    return False


def collect_python_imports(path: Path) -> Set[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError:
        return set()
    roots: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                roots.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.level == 0:
                roots.add(node.module.split(".")[0])
    return roots


def is_stdlib_module(name: str) -> bool:
    if name in STDLIB_ROOTS:
        return True
    # relative / local modules without third-party names
    if name.startswith("_") and name.lstrip("_") in STDLIB_ROOTS:
        return True
    return False


def validate_skill(skill_dir: Path) -> List[str]:
    errors: List[str] = []
    skill_dir = skill_dir.resolve()
    skill_file = skill_dir / "SKILL.md"

    if not skill_file.is_file():
        return [f"Missing required file: {skill_file}"]

    raw_bytes = skill_file.read_bytes()
    if not raw_bytes.startswith(b"---"):
        errors.append("SKILL.md must start with YAML frontmatter at byte 0 (content.startswith('---'))")
        return errors
    if raw_bytes.startswith(b"\xef\xbb\xbf"):
        errors.append("SKILL.md must not start with a UTF-8 BOM before frontmatter")
        return errors

    text = raw_bytes.decode("utf-8")
    if not text.startswith("---\n") and not text.startswith("---\r\n"):
        # allow ---\n only; bare --- without newline is invalid for Hermes
        if text == "---" or not text.startswith("---"):
            errors.append("SKILL.md frontmatter opener must be --- followed by newline at byte 0")
            return errors
        if not (text.startswith("---\n") or text.startswith("---\r\n")):
            errors.append("SKILL.md must start with '---\\n' at byte 0")
            return errors

    # Split frontmatter
    rest = text[3:]
    if rest.startswith("\r\n"):
        rest = rest[2:]
    elif rest.startswith("\n"):
        rest = rest[1:]
    else:
        errors.append("SKILL.md must start with '---\\n' at byte 0")
        return errors

    close = re.search(r"\n---\s*\n", rest)
    if not close:
        errors.append("SKILL.md must close frontmatter with a line containing ---")
        return errors

    frontmatter = rest[: close.start()]
    body = rest[close.end() :]
    fields = parse_top_level_frontmatter(frontmatter)

    name = fields.get("name", "")
    description = fields.get("description", "")

    if not name:
        errors.append("Missing required frontmatter field: name")
    elif not NAME_RE.match(name):
        errors.append(
            "name must be 1-64 chars, lowercase letters/numbers/hyphens, "
            "no leading/trailing/consecutive hyphens"
        )
    elif len(name) > MAX_NAME_LENGTH:
        errors.append(f"name exceeds {MAX_NAME_LENGTH} characters")
    elif skill_dir.name != name:
        errors.append(f"name must match parent directory: expected {skill_dir.name!r}, found {name!r}")

    if not description:
        errors.append("Missing required frontmatter field: description")
    elif len(description) > MAX_DESCRIPTION_LENGTH:
        errors.append(f"description must be <= {MAX_DESCRIPTION_LENGTH} characters")

    if "version" not in fields:
        errors.append("Missing recommended frontmatter field: version")
    if not has_metadata_block(frontmatter):
        errors.append("Missing frontmatter metadata block")

    if not body.strip():
        errors.append("SKILL.md body must not be empty")

    if len(text) > MAX_SKILL_CONTENT_CHARS:
        errors.append(
            f"SKILL.md exceeds {MAX_SKILL_CONTENT_CHARS:,} characters "
            f"(got {len(text):,})"
        )

    # Allowed support directories only
    for child in skill_dir.iterdir():
        if child.name.startswith("."):
            continue
        if child.is_dir() and child.name not in ALLOWED_SUBDIRS:
            errors.append(
                f"Disallowed support directory: {child.name}/ "
                f"(allowed: {', '.join(sorted(ALLOWED_SUBDIRS))})"
            )

    for path in skill_dir.rglob("*"):
        if path.name == "__pycache__" or path.suffix == ".pyc":
            errors.append(f"Python cache file/directory must not ship: {path.relative_to(skill_dir)}")

    # Collect hermes paths and markdown links
    hermes_paths = HERMES_PATH_RE.findall(text)
    md_links = MD_LINK_RE.findall(text)

    linked_rel: Set[str] = set()
    for rel in hermes_paths:
        rel_clean = rel.split("#")[0].split("?")[0].rstrip("/")
        if ".." in Path(rel_clean).parts:
            errors.append(f"Path traversal in ${{HERMES_SKILL_DIR}} path: {rel}")
            continue
        if rel_clean.startswith("/") or re.match(r"^[A-Za-z]:\\", rel_clean):
            errors.append(f"Absolute path not allowed under HERMES_SKILL_DIR: {rel}")
            continue
        linked_rel.add(rel_clean)
        target = skill_dir / rel_clean
        if not target.exists():
            errors.append(f"Broken ${{HERMES_SKILL_DIR}} path: {rel}")

    for _label, href in md_links:
        href = href.strip()
        if href.startswith(("http://", "https://", "mailto:", "#")):
            continue
        if href.startswith("${HERMES_SKILL_DIR}/"):
            continue  # already handled
        href_path = url_unquote(urlsplit(href).path)
        if ".." in Path(href_path).parts:
            errors.append(f"Path traversal in markdown link: {href}")
            continue
        local = (skill_dir / href_path).resolve()
        try:
            local.relative_to(skill_dir)
        except ValueError:
            errors.append(f"Markdown link escapes skill directory: {href}")
            continue
        if not local.exists():
            errors.append(f"Broken relative link: {href}")
        else:
            linked_rel.add(href_path)

    # Runtime support files should be linked (scripts at minimum if present)
    for scripts_dir in (skill_dir / "scripts",):
        if scripts_dir.is_dir():
            for py in scripts_dir.glob("*.py"):
                rel = f"scripts/{py.name}"
                # allow unlinked helper modules; main entrypoints should be referenced
                if py.name in {"inspect_project.py", "doctor.py", "fetch_official_docs.py"}:
                    if not any(rel in p or py.name in p for p in linked_rel) and rel not in text:
                        # soft requirement: mention in body or hermes path
                        if py.name not in text and rel not in text:
                            errors.append(f"Runtime script not linked from SKILL.md: {rel}")

    # File size limits for support files
    for path in skill_dir.rglob("*"):
        if path.is_file() and path.stat().st_size > MAX_SKILL_FILE_BYTES:
            errors.append(
                f"Support file exceeds 1 MiB: {path.relative_to(skill_dir)} "
                f"({path.stat().st_size} bytes)"
            )

    # Stdlib-only scripts
    scripts_dir = skill_dir / "scripts"
    if scripts_dir.is_dir():
        for py in scripts_dir.rglob("*.py"):
            imports = collect_python_imports(py)
            non_std = sorted(m for m in imports if not is_stdlib_module(m))
            # allow importing sibling modules in scripts/
            non_std = [m for m in non_std if not (scripts_dir / f"{m}.py").exists()]
            if non_std:
                errors.append(
                    f"Non-stdlib import in {py.relative_to(skill_dir)}: {', '.join(non_std)} "
                    "(scripts must use Python stdlib only)"
                )

    # source-manifest and AGENTS
    if not (skill_dir / "references" / "source-manifest.json").is_file():
        # also accept top-level under references with different layout
        if not list((skill_dir / "references").glob("**/source-manifest.json")) if (skill_dir / "references").is_dir() else True:
            errors.append("Missing references/source-manifest.json")

    if not (skill_dir / "AGENTS.md").is_file():
        errors.append("Missing skill-root AGENTS.md")
    elif not (skill_dir / "references" / "AGENTS.md").is_file():
        errors.append(
            "Missing references/AGENTS.md packaged mirror for installers that omit skill-root support files"
        )

    # project-level AGENTS.md and LICENSE: search parents
    found_project_agents = False
    found_license = False
    for parent in [skill_dir.parent.parent, skill_dir.parent, skill_dir]:
        if (parent / "AGENTS.md").is_file() and parent != skill_dir:
            found_project_agents = True
        if (parent / "LICENSE").is_file() or (parent / "LICENSE.md").is_file():
            found_license = True
    # skill tree under skills/tldraw — project root is parents[1]
    repo_guess = skill_dir
    for _ in range(4):
        if (repo_guess / "project.md").is_file() or (repo_guess / ".git").exists():
            if (repo_guess / "AGENTS.md").is_file():
                found_project_agents = True
            if (repo_guess / "LICENSE").is_file() or (repo_guess / "LICENSE.md").is_file():
                found_license = True
            break
        if repo_guess.parent == repo_guess:
            break
        repo_guess = repo_guess.parent

    if not found_project_agents:
        errors.append("Missing project-root AGENTS.md")
    if not found_license:
        errors.append("Missing LICENSE notice at project root")

    # Stale anti-patterns in executable snippets (fenced code), allow pitfalls prose
    for lang, code, offset in extract_fenced_code(text):
        if lang in {"", "text", "markdown", "md", "bash", "sh", "shell", "console", "json", "yaml", "yml"}:
            # shell checked separately; skip non-TS/JS for stale tldraw APIs
            if lang in {"bash", "sh", "shell", "console"}:
                for rx, label in [(p, p.pattern) for p in UNSAFE_SHELL + DESTRUCTIVE]:
                    if rx.search(code):
                        errors.append(f"Unsafe/destructive shell pattern in fenced code: {label}")
            continue
        if lang not in {"ts", "tsx", "js", "jsx", "typescript", "javascript"}:
            continue
        for rx, label in STALE_PATTERNS:
            if rx.search(code):
                if line_context_is_pitfall(text, offset):
                    continue
                errors.append(
                    f"Stale tldraw anti-pattern in executable snippet: {label} "
                    "(allowed only in clearly labeled pitfalls prose)"
                )

    # Also scan .ts/.tsx templates for stale patterns
    for ext in ("*.ts", "*.tsx", "*.js", "*.jsx"):
        for path in skill_dir.rglob(ext):
            try:
                content = path.read_text(encoding="utf-8")
            except OSError:
                continue
            for rx, label in STALE_PATTERNS:
                if rx.search(content):
                    errors.append(
                        f"Stale tldraw anti-pattern in {path.relative_to(skill_dir)}: {label}"
                    )

    # Secret / unsafe patterns across skill text files
    for path in skill_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".md", ".py", ".ts", ".tsx", ".js", ".json", ".txt", ".yml", ".yaml"}:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for rx in SECRET_PATTERNS:
            if rx.search(content):
                errors.append(f"Secret-like pattern in {path.relative_to(skill_dir)}")
                break
        for rx in DESTRUCTIVE:
            if rx.search(content):
                errors.append(f"Destructive command pattern in {path.relative_to(skill_dir)}")
                break

    return errors


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in {"-h", "--help"}:
        print(__doc__.strip())
        return 2 if not args else 0
    skill_dir = Path(args[0])
    if not skill_dir.exists():
        print(f"ERROR: path does not exist: {skill_dir}", file=sys.stderr)
        return 2
    print(f"Validating skill: {skill_dir.resolve()}")
    try:
        errors = validate_skill(skill_dir)
    except OSError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if errors:
        for err in errors:
            print(f"  ERROR: {err}")
        print(f"FAILED with {len(errors)} error(s)")
        return 1
    print("  OK: skill structure and security checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
