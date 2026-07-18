#!/usr/bin/env python3
"""Fetch and cache official tldraw LLM doc corpora (Python stdlib only).

Usage:
  python3 fetch_official_docs.py [--corpus index|docs|examples|releases|full]
                                 [--refresh] [--offline] [--json]

Cache root: ${XDG_CACHE_HOME:-~/.cache}/hermes/tldraw/

Behavior:
  - urllib only; atomic writes; ETag/Last-Modified conditional requests
  - Stores fetched time + SHA-256 metadata sidecar
  - Retains last valid cache on failure / partial download
  - Treats fetched text as data only (never executed)
  - --offline uses cache only; misses fail cleanly

Override base URLs for tests via env:
  TLDRAW_DOCS_INDEX_URL, TLDRAW_DOCS_DOCS_URL, TLDRAW_DOCS_EXAMPLES_URL,
  TLDRAW_DOCS_RELEASES_URL, TLDRAW_DOCS_FULL_URL, TLDRAW_DOCS_BASE_URL
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

DEFAULT_URLS = {
    "index": "https://tldraw.dev/llms.txt",
    "docs": "https://tldraw.dev/llms-docs.txt",
    "examples": "https://tldraw.dev/llms-examples.txt",
    "releases": "https://tldraw.dev/llms-releases.txt",
    "full": "https://tldraw.dev/llms-full.txt",
}

CORPUS_ALIASES = {
    "index": "index",
    "docs": "docs",
    "examples": "examples",
    "releases": "releases",
    "full": "full",
    "all": "all",
}

USER_AGENT = "hermes-tldraw-skill-fetch/1.0 (+stdlib urllib; cache-aware)"
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
MAX_CORPUS_BYTES = 16 * 1024 * 1024


def validate_corpus_url(url: str) -> str:
    """Allow official HTTPS corpora and loopback HTTP(S) fixtures only."""
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    host = (parsed.hostname or "").lower()
    if scheme not in {"http", "https"}:
        raise ValueError("corpus URL scheme must be http or https")
    if not host or parsed.username is not None or parsed.password is not None:
        raise ValueError("corpus URL must have a host and no embedded credentials")
    if host in LOOPBACK_HOSTS:
        return url
    if scheme != "https" or not (host == "tldraw.dev" or host.endswith(".tldraw.dev")):
        raise ValueError("non-loopback corpus URLs must use HTTPS on tldraw.dev")
    return url


def cache_root() -> Path:
    xdg = os.getenv("XDG_CACHE_HOME")
    if xdg:
        base = Path(xdg)
    else:
        base = Path.home() / ".cache"
    return base / "hermes" / "tldraw"


def corpus_url(name: str) -> str:
    overrides = {
        "index": os.getenv("TLDRAW_DOCS_INDEX_URL"),
        "docs": os.getenv("TLDRAW_DOCS_DOCS_URL"),
        "examples": os.getenv("TLDRAW_DOCS_EXAMPLES_URL"),
        "releases": os.getenv("TLDRAW_DOCS_RELEASES_URL"),
        "full": os.getenv("TLDRAW_DOCS_FULL_URL"),
    }
    override = overrides.get(name)
    if override:
        return validate_corpus_url(override)
    base = os.getenv("TLDRAW_DOCS_BASE_URL")
    if base:
        # map to path suffixes for test server
        suffixes = {
            "index": "/llms.txt",
            "docs": "/llms-docs.txt",
            "examples": "/llms-examples.txt",
            "releases": "/llms-releases.txt",
            "full": "/llms-full.txt",
        }
        return validate_corpus_url(base.rstrip("/") + suffixes[name])
    return validate_corpus_url(DEFAULT_URLS[name])


def corpus_paths(name: str, root: Path) -> Tuple[Path, Path]:
    """Return (data_path, meta_path)."""
    data = root / f"{name}.txt"
    meta = root / f"{name}.meta.json"
    return data, meta


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_meta(meta_path: Path) -> Dict[str, Any]:
    if not meta_path.is_file():
        return {}
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(str(tmp_path), str(path))
    except Exception:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
        raise


def atomic_write_text(path: Path, text: str) -> None:
    atomic_write(path, text.encode("utf-8"))


def validate_body(body: bytes, headers: Dict[str, str]) -> None:
    """Raise ValueError on incomplete/partial bodies when Content-Length set."""
    cl = headers.get("Content-Length") or headers.get("content-length")
    if cl is not None:
        try:
            expected = int(cl)
        except ValueError:
            return
        if len(body) != expected:
            raise ValueError(
                f"partial download: got {len(body)} bytes, Content-Length={expected}"
            )


def fetch_url(
    url: str,
    *,
    etag: Optional[str] = None,
    last_modified: Optional[str] = None,
    timeout: float = 60.0,
) -> Tuple[int, bytes, Dict[str, str]]:
    validate_corpus_url(url)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/plain, text/markdown, */*"}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            final_url = resp.geturl()
            try:
                validate_corpus_url(final_url)
            except ValueError as exc:
                raise ValueError(f"redirected corpus URL is not allowed: {final_url}") from exc
            status = getattr(resp, "status", None) or resp.getcode()
            raw_headers = {k: v for k, v in resp.headers.items()}
            content_length = raw_headers.get("Content-Length") or raw_headers.get("content-length")
            if content_length is not None:
                try:
                    expected_length = int(content_length)
                except ValueError:
                    expected_length = None
                if expected_length is not None and expected_length > MAX_CORPUS_BYTES:
                    raise ValueError(f"corpus body exceeds {MAX_CORPUS_BYTES} byte limit")
            body = resp.read(MAX_CORPUS_BYTES + 1)
            if len(body) > MAX_CORPUS_BYTES:
                raise ValueError(f"corpus body exceeds {MAX_CORPUS_BYTES} byte limit")
            validate_body(body, raw_headers)
            return int(status), body, raw_headers
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            raw_headers = {k: v for k, v in (exc.headers.items() if exc.headers else [])}
            return 304, b"", raw_headers
        raise


def load_cached(name: str, root: Path) -> Optional[Dict[str, Any]]:
    data_path, meta_path = corpus_paths(name, root)
    if not data_path.is_file():
        return None
    body = data_path.read_bytes()
    meta = read_meta(meta_path)
    digest = sha256_bytes(body)
    if meta.get("sha256") and meta["sha256"] != digest:
        # checksum mismatch — treat as invalid
        return None
    return {
        "ok": True,
        "corpus": name,
        "url": meta.get("url") or corpus_url(name),
        "path": str(data_path),
        "cache_path": str(data_path),
        "meta_path": str(meta_path),
        "sha256": digest,
        "checksum": digest,
        "etag": meta.get("etag"),
        "last_modified": meta.get("last_modified"),
        "fetched_at": meta.get("fetched_at"),
        "source": "cache",
        "bytes": len(body),
    }


def write_cache(
    name: str,
    root: Path,
    url: str,
    body: bytes,
    headers: Dict[str, str],
) -> Dict[str, Any]:
    data_path, meta_path = corpus_paths(name, root)
    digest = sha256_bytes(body)
    etag = headers.get("ETag") or headers.get("Etag") or headers.get("etag")
    last_mod = headers.get("Last-Modified") or headers.get("last-modified")
    meta = {
        "url": url,
        "corpus": name,
        "sha256": digest,
        "checksum": digest,
        "etag": etag,
        "last_modified": last_mod,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bytes": len(body),
    }
    atomic_write(data_path, body)
    atomic_write_text(meta_path, json.dumps(meta, indent=2, sort_keys=True) + "\n")
    return {
        "ok": True,
        "corpus": name,
        "url": url,
        "path": str(data_path),
        "cache_path": str(data_path),
        "meta_path": str(meta_path),
        "sha256": digest,
        "checksum": digest,
        "etag": etag,
        "last_modified": last_mod,
        "fetched_at": meta["fetched_at"],
        "source": "network",
        "bytes": len(body),
    }


def fetch_corpus(
    name: str,
    *,
    refresh: bool = False,
    offline: bool = False,
    root: Optional[Path] = None,
) -> Dict[str, Any]:
    root = root or cache_root()
    root.mkdir(parents=True, exist_ok=True)
    try:
        url = corpus_url(name)
    except ValueError as exc:
        return {
            "ok": False,
            "corpus": name,
            "url": None,
            "error": str(exc),
            "source": "configuration",
        }
    data_path, meta_path = corpus_paths(name, root)
    cached = load_cached(name, root)

    if offline:
        if cached:
            return cached
        return {
            "ok": False,
            "corpus": name,
            "url": url,
            "error": "offline miss: no valid cache",
            "source": "offline",
        }

    if cached and not refresh:
        # optional conditional revalidation is skippable for unit cache-hit
        return {**cached, "source": "cache"}

    meta = read_meta(meta_path)
    etag = None if refresh else meta.get("etag")
    last_mod = None if refresh else meta.get("last_modified")
    # On --refresh, still send validators unless we want unconditional; force unconditional
    if refresh:
        etag = None
        last_mod = None

    try:
        status, body, headers = fetch_url(url, etag=etag, last_modified=last_mod)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, OSError) as exc:
        if cached:
            return {
                **cached,
                "ok": True,
                "source": "cache",
                "warning": f"fetch failed, retained last valid cache: {exc}",
                "fetch_error": str(exc),
            }
        return {
            "ok": False,
            "corpus": name,
            "url": url,
            "error": str(exc),
            "source": "network",
        }

    if status == 304 and data_path.is_file():
        # touch meta fetched_at
        body_existing = data_path.read_bytes()
        result = write_cache(name, root, url, body_existing, {**meta, **headers})
        result["source"] = "not_modified"
        return result

    if status != 200:
        if cached:
            return {
                **cached,
                "ok": True,
                "source": "cache",
                "warning": f"HTTP {status}, retained last valid cache",
            }
        return {
            "ok": False,
            "corpus": name,
            "url": url,
            "error": f"HTTP {status}",
            "source": "network",
        }

    try:
        validate_body(body, headers)
    except ValueError as exc:
        if cached:
            return {
                **cached,
                "ok": True,
                "source": "cache",
                "warning": f"partial download retained last valid: {exc}",
                "fetch_error": str(exc),
            }
        return {
            "ok": False,
            "corpus": name,
            "url": url,
            "error": str(exc),
            "source": "network",
        }

    return write_cache(name, root, url, body, headers)


def resolve_corpora(spec: str) -> List[str]:
    if spec == "all" or spec == "full-set":
        return ["index", "docs", "examples", "releases"]
    if spec == "full":
        return ["full"]
    if spec not in CORPUS_ALIASES:
        raise ValueError(f"unknown corpus: {spec}")
    # default bundle when only "index" is default; caller passes one
    return [spec]


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch/cache official tldraw docs corpora")
    parser.add_argument(
        "--corpus",
        default="index",
        help="index|docs|examples|releases|full (default: index). Use comma-list for multiple.",
    )
    parser.add_argument("--refresh", action="store_true", help="Force network refresh")
    parser.add_argument("--offline", action="store_true", help="Cache only; fail on miss")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.refresh and args.offline:
        print("ERROR: --refresh and --offline are mutually exclusive", file=sys.stderr)
        return 2

    names: List[str] = []
    for part in args.corpus.split(","):
        part = part.strip().lower()
        if not part:
            continue
        if part == "all":
            names.extend(["index", "docs", "examples", "releases"])
        else:
            names.append(part)
    if not names:
        names = ["index"]

    # Default to index/docs not full when user passes nothing — argparse default is index.
    results: List[Dict[str, Any]] = []
    overall_ok = True
    for name in names:
        if name not in DEFAULT_URLS:
            results.append({"ok": False, "corpus": name, "error": f"unknown corpus {name}"})
            overall_ok = False
            continue
        result = fetch_corpus(name, refresh=args.refresh, offline=args.offline)
        results.append(result)
        if not result.get("ok"):
            overall_ok = False

    # Single-corpus convenience shape for tests
    payload: Dict[str, Any]
    if len(results) == 1:
        payload = dict(results[0])
        payload["files"] = [dict(results[0])] if results[0].get("path") else []
        payload["cache_root"] = str(cache_root())
    else:
        payload = {
            "ok": overall_ok,
            "files": list(results),
            "cache_root": str(cache_root()),
            "results": list(results),
        }

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        for r in results:
            status = "OK" if r.get("ok") else "FAIL"
            path = r.get("path") or r.get("cache_path") or "-"
            print(f"[{status}] {r.get('corpus')}: source={r.get('source')} path={path}")
            if r.get("sha256"):
                print(f"  sha256: {r['sha256']}")
            if r.get("error"):
                print(f"  error: {r['error']}")
            if r.get("warning"):
                print(f"  warning: {r['warning']}")
        print(f"cache_root: {cache_root()}")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
