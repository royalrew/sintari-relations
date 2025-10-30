from __future__ import annotations

from typing import Iterable


ALLOWED_PATH_PREFIXES: Iterable[str] = (
    "agents/",
    "sintari-relations/",
    "tests/",
    "scripts/",
    "docs/",
)

DENY_SUBSTRINGS: Iterable[str] = (
    "/.ssh/",
    "/secrets/",
    "node_modules/",
)


def is_allowed_path(path: str) -> bool:
    return path.startswith(tuple(ALLOWED_PATH_PREFIXES)) and not any(
        s in path for s in DENY_SUBSTRINGS
    )


__all__ = ["is_allowed_path"]


