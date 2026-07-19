# Security Policy

Report vulnerabilities in this skill repository privately through GitHub's security-advisory interface after publication. Do not include API keys, tldraw license keys, private canvas contents, or user documents in an issue.

The project inspector and doctor are read-only and use only Python's standard library. The official-document fetcher also uses only the standard library and writes solely to its dedicated cache under `${XDG_CACHE_HOME:-~/.cache}/hermes/tldraw/`; it never mutates an inspected project. The development bridge must be active only on localhost in a development build and must not expose arbitrary evaluation, shell execution, filesystem access, or environment values.

For vulnerabilities in tldraw itself, follow tldraw's current security-reporting policy rather than disclosing them here.
