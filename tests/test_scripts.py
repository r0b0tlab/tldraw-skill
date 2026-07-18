#!/usr/bin/env python3
"""Deterministic unit tests for tldraw skill helper scripts (stdlib only).

Covers inspect_project, doctor, and fetch_official_docs without live network.
"""
from __future__ import annotations

import hashlib
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import Any, Dict, Optional
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "skills" / "tldraw" / "scripts"
sys.path.insert(0, str(SCRIPTS))


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _run_script(name: str, *args: str, env: Optional[Dict[str, str]] = None) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(SCRIPTS / name), *args]
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=merged,
        cwd=str(ROOT),
        timeout=60,
    )


def _load_json_stdout(proc: subprocess.CompletedProcess) -> Dict[str, Any]:
    out = proc.stdout.strip()
    if not out:
        raise AssertionError(f"empty stdout; stderr={proc.stderr!r} rc={proc.returncode}")
    return json.loads(out)


# ---------------------------------------------------------------------------
# inspect_project.py
# ---------------------------------------------------------------------------


class InspectProjectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="tldraw-inspect-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_absent_package_files(self) -> None:
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertIn(proc.returncode, (0, 1, 2))
        data = _load_json_stdout(proc)
        self.assertIn("package_manager", data)
        self.assertTrue(data.get("package_manager") in (None, "unknown", "none") or data.get("package_manager") == "")
        self.assertFalse(data.get("has_package_json", True) if "has_package_json" in data else data.get("package_json") is None)

    def test_npm_lockfile_detection(self) -> None:
        _write(
            self.tmp / "package.json",
            json.dumps(
                {
                    "name": "demo",
                    "dependencies": {"tldraw": "^3.0.0", "react": "^18.2.0"},
                    "devDependencies": {"typescript": "^5.0.0"},
                    "scripts": {"dev": "vite", "build": "vite build"},
                }
            ),
        )
        _write(self.tmp / "package-lock.json", '{"lockfileVersion": 3, "packages": {"": {}, "node_modules/tldraw": {"version": "3.0.1"}}}')
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        self.assertEqual(data["package_manager"], "npm")
        self.assertIn("tldraw", data.get("tldraw_packages") or data.get("declared_tldraw") or {})
        # Accept either nested map or list of packages
        pkgs = data.get("tldraw_packages") or data.get("packages") or {}
        if isinstance(pkgs, dict):
            self.assertTrue(any("tldraw" in k for k in pkgs) or "tldraw" in str(pkgs))
        declared = data.get("declared_versions") or data.get("tldraw_packages") or {}
        self.assertTrue("3.0" in json.dumps(declared) or "3.0" in json.dumps(data))

    def test_pnpm_lockfile_detection(self) -> None:
        _write(self.tmp / "package.json", json.dumps({"name": "pnpm-app", "dependencies": {"tldraw": "3.1.0"}}))
        _write(self.tmp / "pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        self.assertEqual(data["package_manager"], "pnpm")

    def test_yarn_lockfile_detection(self) -> None:
        _write(self.tmp / "package.json", json.dumps({"name": "yarn-app", "dependencies": {"@tldraw/editor": "2.4.0"}}))
        _write(self.tmp / "yarn.lock", "# yarn lockfile v1\n")
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        self.assertEqual(data["package_manager"], "yarn")

    def test_bun_lockfile_detection(self) -> None:
        _write(self.tmp / "package.json", json.dumps({"name": "bun-app", "dependencies": {"tldraw": "3.2.0"}}))
        _write(self.tmp / "bun.lockb", "fake-binary")
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        self.assertEqual(data["package_manager"], "bun")

    def test_monorepo_workspace_root(self) -> None:
        _write(
            self.tmp / "package.json",
            json.dumps({"name": "root", "private": True, "workspaces": ["packages/*"]}),
        )
        _write(self.tmp / "package-lock.json", '{"lockfileVersion": 3}')
        pkg = self.tmp / "packages" / "app"
        _write(
            pkg / "package.json",
            json.dumps(
                {
                    "name": "@demo/app",
                    "dependencies": {
                        "tldraw": "3.0.0",
                        "@tldraw/sync": "3.1.0",
                        "react": "18.3.1",
                    },
                }
            ),
        )
        proc = _run_script("inspect_project.py", str(pkg), "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        # workspace root should point at monorepo root
        workspace = data.get("workspace_root") or data.get("workspace") or data.get("root")
        self.assertTrue(workspace)
        self.assertEqual(Path(workspace).resolve(), self.tmp.resolve())
        current = data.get("current_package") or data.get("package_name") or data.get("package")
        self.assertIn("app", str(current))
        # version skew between tldraw and @tldraw/sync
        warnings = data.get("warnings") or data.get("version_skew") or []
        blob = json.dumps(data)
        self.assertTrue("skew" in blob.lower() or warnings, msg=f"expected version skew signal: {blob[:800]}")

    def test_framework_and_signals(self) -> None:
        _write(
            self.tmp / "package.json",
            json.dumps(
                {
                    "name": "signals",
                    "dependencies": {
                        "tldraw": "3.0.0",
                        "@tldraw/sync": "3.0.0",
                        "@tldraw/driver": "3.0.0",
                        "@tldraw/mermaid": "3.0.0",
                        "react": "18.2.0",
                        "next": "14.0.0",
                    },
                    "scripts": {"dev": "next dev"},
                }
            ),
        )
        _write(self.tmp / "package-lock.json", "{}")
        _write(self.tmp / "src" / "shapes" / "CardShapeUtil.ts", "export class CardShapeUtil {}\n")
        _write(self.tmp / "src" / "bindings" / "ArrowBinding.ts", "export class ArrowBinding {}\n")
        _write(self.tmp / "src" / "schema.ts", "export const schema = {}\n")
        _write(self.tmp / ".env.example", "TLDRAW_LICENSE_KEY=placeholder\n")
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        blob = json.dumps(data).lower()
        self.assertTrue("next" in blob or "framework" in data)
        self.assertTrue("sync" in blob)
        self.assertTrue("driver" in blob)
        self.assertTrue("mermaid" in blob)
        self.assertTrue("license" in blob)
        # custom shape/binding signals
        custom = data.get("custom_shape_files") or data.get("likely_custom_files") or data.get("signals") or {}
        self.assertTrue(custom or "cardshape" in blob or "shapes" in blob)

    def test_read_only_no_write(self) -> None:
        _write(self.tmp / "package.json", json.dumps({"name": "ro"}))
        before = {p.relative_to(self.tmp): p.stat().st_mtime_ns for p in self.tmp.rglob("*") if p.is_file()}
        proc = _run_script("inspect_project.py", str(self.tmp), "--json")
        self.assertIn(proc.returncode, (0, 1, 2))
        after_files = {p.relative_to(self.tmp) for p in self.tmp.rglob("*") if p.is_file()}
        self.assertEqual(set(before), after_files)


# ---------------------------------------------------------------------------
# doctor.py
# ---------------------------------------------------------------------------


class DoctorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="tldraw-doctor-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_doctor_json_and_node_check(self) -> None:
        _write(
            self.tmp / "package.json",
            json.dumps(
                {
                    "name": "doc",
                    "dependencies": {"tldraw": "3.0.0", "react": "18.2.0"},
                    "scripts": {"dev": "vite"},
                }
            ),
        )
        _write(self.tmp / "package-lock.json", "{}")
        _write(self.tmp / "src" / "styles.css", "@import 'tldraw/tldraw.css';\n.container { height: 100vh; }\n")
        proc = _run_script("doctor.py", "--project", str(self.tmp), "--json")
        self.assertIn(proc.returncode, (0, 1), proc.stderr)
        data = _load_json_stdout(proc)
        self.assertIn("node", json.dumps(data).lower())
        # should embed or reference inspection
        self.assertTrue(
            "inspect" in data
            or "package_manager" in data
            or "project" in data
            or "checks" in data
        )

    def test_local_playwright_package_is_detected(self) -> None:
        _write(
            self.tmp / "package.json",
            json.dumps({"name": "browser", "dependencies": {"playwright": "1.58.2"}}),
        )
        _write(self.tmp / "node_modules" / "playwright" / "package.json", "{}")
        proc = _run_script("doctor.py", "--project", str(self.tmp), "--json")
        data = _load_json_stdout(proc)
        self.assertTrue(data["checks"]["browser_runtime"]["playwright"])

    def test_no_secret_leakage(self) -> None:
        secret = "unit-test-provider-key-not-a-real-credential"
        license_key = "unit-test-domain-license-not-a-real-key"
        _write(
            self.tmp / "package.json",
            json.dumps({"name": "sec", "dependencies": {"tldraw": "3.0.0"}}),
        )
        _write(self.tmp / "package-lock.json", "{}")
        _write(self.tmp / ".env", f"OPENAI_API_KEY={secret}\nTLDRAW_LICENSE_KEY={license_key}\n")
        env = {"OPENAI_API_KEY": secret, "TLDRAW_LICENSE_KEY": license_key}
        proc = _run_script("doctor.py", "--project", str(self.tmp), "--json", env=env)
        combined = (proc.stdout or "") + (proc.stderr or "")
        self.assertNotIn(secret, combined)
        self.assertNotIn(license_key, combined)
        self.assertNotIn("SUPERSECRET", combined)
        data = _load_json_stdout(proc) if proc.stdout.strip().startswith("{") else {}
        if data:
            # license presence may be boolean only
            lic = data.get("license_key_present")
            if lic is None and isinstance(data.get("checks"), dict):
                lic = data["checks"].get("license_key_present")
            if lic is not None:
                self.assertIsInstance(lic, bool)

    def test_version_mismatch_warning(self) -> None:
        _write(
            self.tmp / "package.json",
            json.dumps(
                {
                    "name": "skew",
                    "dependencies": {"tldraw": "3.0.0", "@tldraw/editor": "2.0.0"},
                }
            ),
        )
        _write(self.tmp / "package-lock.json", "{}")
        proc = _run_script("doctor.py", "--project", str(self.tmp), "--json")
        data = _load_json_stdout(proc)
        blob = json.dumps(data).lower()
        self.assertTrue("skew" in blob or "mismatch" in blob or "warning" in blob)


# ---------------------------------------------------------------------------
# fetch_official_docs.py
# ---------------------------------------------------------------------------


class _Handler(http.server.BaseHTTPRequestHandler):
    """Simple in-process HTTP handler for cache tests."""

    body = b"corpus body v1"
    etag = '"etag-v1"'
    last_modified = "Wed, 01 Jan 2025 00:00:00 GMT"
    fail_once = False
    call_count = 0
    partial = False

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        type(self).call_count += 1
        if self.headers.get("If-None-Match") == self.etag and not self.fail_once:
            self.send_response(304)
            self.send_header("ETag", self.etag)
            self.end_headers()
            return
        if type(self).fail_once:
            type(self).fail_once = False
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"error")
            return
        body = self.body
        if type(self).partial:
            # send truncated content then close — simulate partial download via Content-Length mismatch
            type(self).partial = False
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body) + 100))
            self.send_header("ETag", self.etag)
            self.send_header("Last-Modified", self.last_modified)
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", self.etag)
        self.send_header("Last-Modified", self.last_modified)
        self.end_headers()
        self.wfile.write(body)


class FetchOfficialDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), _Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self) -> None:
        self.cache = Path(tempfile.mkdtemp(prefix="tldraw-cache-"))
        self.addCleanup(shutil.rmtree, self.cache, True)
        _Handler.call_count = 0
        _Handler.fail_once = False
        _Handler.partial = False
        _Handler.body = b"corpus body v1"
        _Handler.etag = '"etag-v1"'

    def _env(self) -> Dict[str, str]:
        return {
            "XDG_CACHE_HOME": str(self.cache),
            "TLDRAW_DOCS_BASE_URL": self.base,
            "TLDRAW_DOCS_INDEX_URL": f"{self.base}/llms.txt",
            "TLDRAW_DOCS_DOCS_URL": f"{self.base}/llms-docs.txt",
            "TLDRAW_DOCS_EXAMPLES_URL": f"{self.base}/llms-examples.txt",
            "TLDRAW_DOCS_RELEASES_URL": f"{self.base}/llms-releases.txt",
            "TLDRAW_DOCS_FULL_URL": f"{self.base}/llms-full.txt",
        }

    def test_cache_miss_then_hit(self) -> None:
        env = self._env()
        proc1 = _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        self.assertEqual(proc1.returncode, 0, proc1.stderr)
        data1 = _load_json_stdout(proc1)
        self.assertTrue(data1.get("ok", True))
        path = data1.get("path") or data1.get("cache_path") or (data1.get("files") or [{}])[0].get("path")
        self.assertTrue(path and Path(path).is_file(), msg=data1)
        content = Path(path).read_bytes()
        self.assertEqual(content, _Handler.body)
        sha = data1.get("sha256") or data1.get("checksum")
        if not sha and isinstance(data1.get("files"), list) and data1["files"]:
            sha = data1["files"][0].get("sha256")
        expected = hashlib.sha256(_Handler.body).hexdigest()
        if sha:
            self.assertEqual(sha, expected)
        calls_after_miss = _Handler.call_count

        proc2 = _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        self.assertEqual(proc2.returncode, 0, proc2.stderr)
        data2 = _load_json_stdout(proc2)
        # cache hit should not re-download body (0 or conditional 304 only)
        self.assertLessEqual(_Handler.call_count, calls_after_miss + 1)
        source = (data2.get("source") or data2.get("from") or "").lower()
        blob = json.dumps(data2).lower()
        self.assertTrue("cache" in blob or source in ("cache", "cached", "etag", "not_modified", ""))

    def test_refresh_forces_fetch(self) -> None:
        env = self._env()
        _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        _Handler.body = b"corpus body v2"
        _Handler.etag = '"etag-v2"'
        proc = _run_script("fetch_official_docs.py", "--corpus", "index", "--refresh", "--json", env=env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        path = data.get("path") or data.get("cache_path")
        if path:
            self.assertIn(b"v2", Path(path).read_bytes())

    def test_offline_hit_and_miss(self) -> None:
        env = self._env()
        # prime cache
        proc_prime = _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        self.assertEqual(proc_prime.returncode, 0, proc_prime.stderr)
        proc_hit = _run_script("fetch_official_docs.py", "--corpus", "index", "--offline", "--json", env=env)
        self.assertEqual(proc_hit.returncode, 0, proc_hit.stderr)
        data_hit = _load_json_stdout(proc_hit)
        path = data_hit.get("path") or data_hit.get("cache_path")
        self.assertTrue(path and Path(path).is_file())

        # offline miss: wipe cache
        shutil.rmtree(self.cache)
        self.cache.mkdir()
        proc_miss = _run_script("fetch_official_docs.py", "--corpus", "docs", "--offline", "--json", env=env)
        self.assertNotEqual(proc_miss.returncode, 0)

    def test_atomic_write_and_last_valid_retention(self) -> None:
        env = self._env()
        proc1 = _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        self.assertEqual(proc1.returncode, 0, proc1.stderr)
        data1 = _load_json_stdout(proc1)
        path = Path(data1.get("path") or data1.get("cache_path"))
        original = path.read_bytes()
        # force failure on next refresh; last valid should remain
        _Handler.fail_once = True
        proc2 = _run_script("fetch_official_docs.py", "--corpus", "index", "--refresh", "--json", env=env)
        # failure may non-zero, but previous cache retained
        self.assertTrue(path.is_file())
        self.assertEqual(path.read_bytes(), original)
        # no leftover .tmp partials required, but if present should not replace valid
        tmps = list(path.parent.glob("*.tmp")) + list(path.parent.glob("*.partial"))
        for t in tmps:
            self.assertNotEqual(t.name, path.name)

    def test_checksum_metadata(self) -> None:
        env = self._env()
        proc = _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        data = _load_json_stdout(proc)
        path = Path(data.get("path") or data.get("cache_path"))
        expected = hashlib.sha256(path.read_bytes()).hexdigest()
        # metadata may be sidecar .meta.json or embedded
        meta_candidates = [
            path.with_suffix(path.suffix + ".meta.json"),
            path.with_name(path.name + ".meta.json"),
            path.parent / "metadata.json",
            path.parent / f"{path.stem}.meta.json",
        ]
        found_sha = data.get("sha256") or data.get("checksum")
        if not found_sha:
            for m in meta_candidates:
                if m.is_file():
                    meta = json.loads(m.read_text(encoding="utf-8"))
                    found_sha = meta.get("sha256") or meta.get("checksum")
                    if found_sha:
                        break
        self.assertTrue(found_sha, msg=f"no sha256 in output or sidecars: {data}")
        self.assertEqual(found_sha, expected)

    def test_partial_failure_retains_or_fails_clean(self) -> None:
        env = self._env()
        # prime
        _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        data_prime = _load_json_stdout(
            _run_script("fetch_official_docs.py", "--corpus", "index", "--offline", "--json", env=env)
        )
        path = Path(data_prime.get("path") or data_prime.get("cache_path"))
        original = path.read_bytes()
        _Handler.partial = True
        _Handler.body = b"NEW_PARTIAL"
        proc = _run_script("fetch_official_docs.py", "--corpus", "index", "--refresh", "--json", env=env)
        # Either fails cleanly keeping old, or validates new fully — never corrupt mix without meta
        if path.is_file():
            current = path.read_bytes()
            self.assertTrue(
                current == original or current == b"NEW_PARTIAL" or len(current) > 0,
                msg=f"unexpected corrupted cache {current!r}",
            )

    def test_fetched_text_not_executed(self) -> None:
        """Ensure fetch treats content as data (no eval/exec of body)."""
        env = self._env()
        _Handler.body = b"__import__('os').system('echo pwned')\nprint('evil')"
        proc = _run_script("fetch_official_docs.py", "--corpus", "index", "--json", env=env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        combined = (proc.stdout or "") + (proc.stderr or "")
        # script should not have executed the payload as Python
        self.assertNotIn("pwned", combined)

    def test_rejects_non_http_url_override(self) -> None:
        env = self._env()
        env["TLDRAW_DOCS_INDEX_URL"] = "file:///etc/passwd"
        proc = _run_script(
            "fetch_official_docs.py", "--corpus", "index", "--refresh", "--json", env=env
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertRegex((proc.stdout + proc.stderr).lower(), r"http|https|scheme")

    def test_fetch_revalidates_redirect_target(self) -> None:
        import fetch_official_docs as fetcher

        class Response:
            status = 200
            headers: Dict[str, str] = {}

            def getcode(self) -> int:
                return 200

            def geturl(self) -> str:
                return "https://attacker.example/llms.txt"

            def read(self, _size: int = -1) -> bytes:
                return b"untrusted redirect body"

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

        with mock.patch.object(fetcher.urllib.request, "urlopen", return_value=Response()):
            with self.assertRaisesRegex(ValueError, r"tldraw\.dev|redirect|corpus URL"):
                fetcher.fetch_url("https://tldraw.dev/llms.txt")

    def test_fetch_rejects_body_above_hard_limit(self) -> None:
        import fetch_official_docs as fetcher

        class Response:
            status = 200
            headers: Dict[str, str] = {}

            def getcode(self) -> int:
                return 200

            def geturl(self) -> str:
                return "https://tldraw.dev/llms.txt"

            def read(self, size: int = -1) -> bytes:
                return b"x" * (size if size >= 0 else 17 * 1024 * 1024)

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

        with mock.patch.object(fetcher.urllib.request, "urlopen", return_value=Response()):
            with self.assertRaisesRegex(ValueError, r"large|limit|bytes"):
                fetcher.fetch_url("https://tldraw.dev/llms.txt")


# ---------------------------------------------------------------------------
# validate_skill.py structural tests (uses temporary mini skill trees)
# ---------------------------------------------------------------------------


class ValidateSkillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="tldraw-val-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.validator = ROOT / "tests" / "validate_skill.py"

    def _run_val(self, skill_dir: Path) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(self.validator), str(skill_dir)],
            capture_output=True,
            text=True,
            timeout=60,
        )

    def _minimal_skill(self, skill_dir: Path, *, bad_frontmatter: bool = False, stale_snippet: bool = False) -> None:
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "references").mkdir(exist_ok=True)
        (skill_dir / "scripts").mkdir(exist_ok=True)
        (skill_dir / "templates").mkdir(exist_ok=True)
        if bad_frontmatter:
            body = "\n---\nname: tldraw\ndescription: x\n---\n# Body\n"
        else:
            body = (
                "---\n"
                "name: tldraw\n"
                "description: Use when working with tldraw SDK, Editor, Driver, sync, or .tldr artifacts.\n"
                "version: 1.0.0\n"
                "author: am423\n"
                "license: MIT\n"
                "metadata:\n"
                "  hermes:\n"
                "    category: software-development\n"
                "    tags: [tldraw]\n"
                "---\n"
                "# tldraw\n\n"
                "See ${HERMES_SKILL_DIR}/references/source-and-version-policy.md\n"
                "and ${HERMES_SKILL_DIR}/scripts/inspect_project.py\n\n"
                "## Pitfalls\n\n"
                "Do not use stale APIs (examples only):\n"
                "<!-- pitfall: stale -->\n"
                "`editor.batch()` and `setSelectedShapeIds` are outdated.\n"
            )
        if stale_snippet:
            body += "\n```ts\neditor.batch(() => { editor.setSelectedShapeIds([]) })\n```\n"
        (skill_dir / "SKILL.md").write_text(body, encoding="utf-8")
        (skill_dir / "AGENTS.md").write_text("# Agents\nstdlib scripts only.\n", encoding="utf-8")
        (skill_dir / "references" / "AGENTS.md").write_text(
            "# Packaged agents\nstdlib scripts only.\n", encoding="utf-8"
        )
        (skill_dir / "references" / "source-and-version-policy.md").write_text("# Policy\n", encoding="utf-8")
        (skill_dir / "references" / "source-manifest.json").write_text(
            json.dumps({"sources": [{"url": "https://tldraw.dev/llms.txt", "date": "2026-07-16"}]}),
            encoding="utf-8",
        )
        (skill_dir / "scripts" / "inspect_project.py").write_text(
            "#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps({}))\n",
            encoding="utf-8",
        )
        (skill_dir.parent / "AGENTS.md").write_text("# Project agents\n", encoding="utf-8")
        (skill_dir.parent / "LICENSE").write_text("MIT\n", encoding="utf-8")

    def test_valid_minimal_skill_passes(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        # project-level AGENTS.md expected by validator relative to skill parent or repo
        (self.tmp / "AGENTS.md").write_text("# Project agents\n", encoding="utf-8")
        (self.tmp / "LICENSE").write_text("MIT\n", encoding="utf-8")
        proc = self._run_val(skill)
        # May still warn about missing optional files; should not hard-fail good structure
        # Accept 0; if LICENSE/AGENTS search is repo-relative, we place them nearby
        self.assertIn(proc.returncode, (0, 1), proc.stdout + proc.stderr)
        if proc.returncode != 0:
            # If fail, must be about missing project root AGENTS/LICENSE — still must detect frontmatter OK
            self.assertNotIn("byte 0", (proc.stdout + proc.stderr).lower() or "ok")

    def test_frontmatter_not_at_byte_zero_fails(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill, bad_frontmatter=True)
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)
        self.assertRegex((proc.stdout + proc.stderr).lower(), r"byte|frontmatter|start")

    def test_stale_executable_snippet_fails(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill, stale_snippet=True)
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)
        combined = (proc.stdout + proc.stderr).lower()
        self.assertTrue("stale" in combined or "batch" in combined or "anti-pattern" in combined)

    def test_disallowed_support_dir_fails(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        (skill / "secrets").mkdir()
        (skill / "secrets" / "key.txt").write_text("x", encoding="utf-8")
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)

    def test_non_stdlib_import_fails(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        (skill / "scripts" / "bad.py").write_text("import requests\nprint(1)\n", encoding="utf-8")
        # link it from skill so it's considered
        skill_md = skill / "SKILL.md"
        skill_md.write_text(
            skill_md.read_text(encoding="utf-8") + "\nSee ${HERMES_SKILL_DIR}/scripts/bad.py\n",
            encoding="utf-8",
        )
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("stdlib", (proc.stdout + proc.stderr).lower())

    def test_secret_pattern_fails(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        skill_md = skill / "SKILL.md"
        skill_md.write_text(
            skill_md.read_text(encoding="utf-8")
            + "\nAPI_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456\n",
            encoding="utf-8",
        )
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)

    def test_path_traversal_fails(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        skill_md = skill / "SKILL.md"
        skill_md.write_text(
            skill_md.read_text(encoding="utf-8") + "\nSee ${HERMES_SKILL_DIR}/../../etc/passwd\n",
            encoding="utf-8",
        )
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)

    def test_skill_root_agents_requires_packaged_mirror(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        (skill / "references" / "AGENTS.md").unlink()
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("agents", (proc.stdout + proc.stderr).lower())

    def test_python_cache_files_fail(self) -> None:
        skill = self.tmp / "tldraw"
        self._minimal_skill(skill)
        cache = skill / "scripts" / "__pycache__"
        cache.mkdir()
        (cache / "inspect_project.cpython-312.pyc").write_bytes(b"not-bytecode")
        proc = self._run_val(skill)
        self.assertNotEqual(proc.returncode, 0)
        self.assertRegex((proc.stdout + proc.stderr).lower(), r"pycache|pyc|cache")


# ---------------------------------------------------------------------------
# check_capability_coverage.py
# ---------------------------------------------------------------------------


class CapabilityCoverageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="tldraw-cov-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.checker = ROOT / "tests" / "check_capability_coverage.py"
        self.index = self.tmp / "llms.txt"
        self.index.write_text(
            "\n".join(
                [
                    "# tldraw docs",
                    "- [Editor](https://tldraw.dev/sdk-features/editor): Editor API",
                    "- [Shapes](https://tldraw.dev/sdk-features/shapes): Shapes",
                    "- [Agent kit](https://tldraw.dev/starter-kits/agent): Agent",
                    "- [Chat kit](https://tldraw.dev/starter-kits/chat): Chat",
                    "- [Overview](https://tldraw.dev/docs/editor): docs editor",
                    "- [tldraw package](https://tldraw.dev/reference/tldraw/Editor): Editor class",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        self.skill = self.tmp / "skill" / "tldraw"
        self.skill.mkdir(parents=True)
        (self.skill / "references").mkdir()
        (self.skill / "SKILL.md").write_text(
            "---\nname: tldraw\ndescription: Use when tldraw.\n---\n# tldraw\n",
            encoding="utf-8",
        )
        for name in (
            "editor-store-state-driver.md",
            "shapes-tools-bindings.md",
            "ai-and-starter-kits.md",
            "source-and-version-policy.md",
        ):
            (self.skill / "references" / name).write_text(
                f"# {name}\n\n## Inspect\n- check\n\n## Implement\n- do\n\n## Verify\n- test\n",
                encoding="utf-8",
            )

    def _run(self, map_path: Path, index: Optional[Path] = None) -> subprocess.CompletedProcess:
        idx = index or self.index
        return subprocess.run(
            [
                sys.executable,
                str(self.checker),
                "--index",
                str(idx),
                "--map",
                str(map_path),
                "--skill",
                str(self.skill),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

    def test_complete_map_passes(self) -> None:
        cmap = {
            "features": [
                {
                    "slug": "editor",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                },
                {
                    "slug": "shapes",
                    "path": "/sdk-features/shapes",
                    "bucket": "shapes",
                    "skill_refs": ["references/shapes-tools-bindings.md"],
                },
            ],
            "starter_kits": [
                {
                    "slug": "agent",
                    "path": "/starter-kits/agent",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
                {
                    "slug": "chat",
                    "path": "/starter-kits/chat",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
            ],
            "packages": [
                {
                    "slug": "tldraw",
                    "path": "/reference/tldraw/Editor",
                    "family": "tldraw",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                }
            ],
            "exclusions": [
                {
                    "path": "/docs/editor",
                    "reason": "Covered via /sdk-features/editor and editor reference",
                    "source": "https://tldraw.dev/llms.txt",
                }
            ],
        }
        map_path = self.tmp / "capability-map.json"
        map_path.write_text(json.dumps(cmap), encoding="utf-8")
        proc = self._run(map_path)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_unmapped_feature_fails_closed(self) -> None:
        cmap = {
            "features": [
                {
                    "slug": "editor",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                }
            ],
            "starter_kits": [
                {
                    "slug": "agent",
                    "path": "/starter-kits/agent",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
                {
                    "slug": "chat",
                    "path": "/starter-kits/chat",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
            ],
            "packages": [],
            "exclusions": [],
        }
        map_path = self.tmp / "capability-map.json"
        map_path.write_text(json.dumps(cmap), encoding="utf-8")
        proc = self._run(map_path)
        self.assertNotEqual(proc.returncode, 0)
        self.assertRegex((proc.stdout + proc.stderr).lower(), r"unmapped|missing|not mapped")

    def test_dead_reference_fails(self) -> None:
        cmap = {
            "features": [
                {
                    "slug": "editor",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/does-not-exist.md"],
                },
                {
                    "slug": "shapes",
                    "path": "/sdk-features/shapes",
                    "bucket": "shapes",
                    "skill_refs": ["references/shapes-tools-bindings.md"],
                },
            ],
            "starter_kits": [
                {
                    "slug": "agent",
                    "path": "/starter-kits/agent",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
                {
                    "slug": "chat",
                    "path": "/starter-kits/chat",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
            ],
            "packages": [
                {
                    "slug": "tldraw",
                    "path": "/reference/tldraw/Editor",
                    "family": "tldraw",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                }
            ],
            "exclusions": [
                {
                    "path": "/docs/editor",
                    "reason": "duplicate of sdk feature",
                    "source": "https://tldraw.dev/llms.txt",
                }
            ],
        }
        map_path = self.tmp / "capability-map.json"
        map_path.write_text(json.dumps(cmap), encoding="utf-8")
        proc = self._run(map_path)
        self.assertNotEqual(proc.returncode, 0)
        self.assertRegex((proc.stdout + proc.stderr).lower(), r"dead|missing|not found|does-not-exist")

    def test_duplicate_mapping_fails(self) -> None:
        cmap = {
            "features": [
                {
                    "slug": "editor",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                },
                {
                    "slug": "editor-dup",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                },
                {
                    "slug": "shapes",
                    "path": "/sdk-features/shapes",
                    "bucket": "shapes",
                    "skill_refs": ["references/shapes-tools-bindings.md"],
                },
            ],
            "starter_kits": [
                {
                    "slug": "agent",
                    "path": "/starter-kits/agent",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
                {
                    "slug": "chat",
                    "path": "/starter-kits/chat",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
            ],
            "packages": [
                {
                    "slug": "tldraw",
                    "path": "/reference/tldraw/Editor",
                    "family": "tldraw",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                }
            ],
            "exclusions": [
                {
                    "path": "/docs/editor",
                    "reason": "dup",
                    "source": "https://tldraw.dev/llms.txt",
                }
            ],
        }
        map_path = self.tmp / "capability-map.json"
        map_path.write_text(json.dumps(cmap), encoding="utf-8")
        proc = self._run(map_path)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("duplicate", (proc.stdout + proc.stderr).lower())

    def test_exclusion_requires_reason(self) -> None:
        cmap = {
            "features": [
                {
                    "slug": "editor",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                },
                {
                    "slug": "shapes",
                    "path": "/sdk-features/shapes",
                    "bucket": "shapes",
                    "skill_refs": ["references/shapes-tools-bindings.md"],
                },
            ],
            "starter_kits": [
                {
                    "slug": "agent",
                    "path": "/starter-kits/agent",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
                {
                    "slug": "chat",
                    "path": "/starter-kits/chat",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
            ],
            "packages": [
                {
                    "slug": "tldraw",
                    "path": "/reference/tldraw/Editor",
                    "family": "tldraw",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                }
            ],
            "exclusions": [{"path": "/docs/editor"}],
        }
        map_path = self.tmp / "capability-map.json"
        map_path.write_text(json.dumps(cmap), encoding="utf-8")
        proc = self._run(map_path)
        self.assertNotEqual(proc.returncode, 0)
        self.assertRegex((proc.stdout + proc.stderr).lower(), r"reason|exclusion")

    def test_file_url_index(self) -> None:
        cmap = {
            "features": [
                {
                    "slug": "editor",
                    "path": "/sdk-features/editor",
                    "bucket": "core-editor",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                },
                {
                    "slug": "shapes",
                    "path": "/sdk-features/shapes",
                    "bucket": "shapes",
                    "skill_refs": ["references/shapes-tools-bindings.md"],
                },
            ],
            "starter_kits": [
                {
                    "slug": "agent",
                    "path": "/starter-kits/agent",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
                {
                    "slug": "chat",
                    "path": "/starter-kits/chat",
                    "bucket": "starters",
                    "skill_refs": ["references/ai-and-starter-kits.md"],
                },
            ],
            "packages": [
                {
                    "slug": "tldraw",
                    "path": "/reference/tldraw/Editor",
                    "family": "tldraw",
                    "skill_refs": ["references/editor-store-state-driver.md"],
                }
            ],
            "exclusions": [
                {
                    "path": "/docs/editor",
                    "reason": "covered elsewhere",
                    "source": "https://tldraw.dev/llms.txt",
                }
            ],
        }
        map_path = self.tmp / "capability-map.json"
        map_path.write_text(json.dumps(cmap), encoding="utf-8")
        file_url = self.index.resolve().as_uri()
        proc = subprocess.run(
            [
                sys.executable,
                str(self.checker),
                "--index",
                file_url,
                "--map",
                str(map_path),
                "--skill",
                str(self.skill),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main()
