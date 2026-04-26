#!/usr/bin/env python3
"""Verify design/current/invariants.yml against the repo."""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml


def load_config(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise SystemExit(f"{path}: expected mapping at top level")
    return data


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def iter_files(root: Path, patterns: list[str]) -> list[Path]:
    files: set[Path] = set()
    ignored_parts = {".venv", "node_modules", "__pycache__", ".svelte-kit", "build"}
    for pattern in patterns:
        for path in root.glob(pattern):
            if path.is_file() and not (ignored_parts & set(path.parts)):
                files.add(path)
    return sorted(files)


def is_ignored(root: Path, rel: str) -> bool:
    proc = subprocess.run(
        ["git", "check-ignore", "-q", rel],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return proc.returncode == 0


def extract_svelte_props(text: str) -> dict[str, bool]:
    match = re.search(r"\binterface\s+Props\s*\{", text)
    if match is None:
        return {}
    start = match.end()
    depth = 1
    end = start
    while end < len(text) and depth > 0:
        char = text[end]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        end += 1
    if depth != 0:
        return {}
    body = text[start : end - 1]
    props: dict[str, bool] = {}
    for prop_match in re.finditer(r"^\s*([A-Za-z_$][\w$]*)(\?)?\s*:", body, re.MULTILINE):
        props[prop_match.group(1)] = prop_match.group(2) != "?"
    return props


def verify_svelte_props(root: Path, item: dict[str, Any]) -> list[str]:
    path = root / str(item["file"])
    if not path.exists():
        return [f"{item['name']}: missing file {path.relative_to(root)}"]
    actual = extract_svelte_props(read(path))
    if not actual:
        return [f"{item['name']}: could not find interface Props in {path.relative_to(root)}"]
    errors: list[str] = []
    expected: dict[str, Any] = item.get("props", {})
    for prop, meta in expected.items():
        required = bool((meta or {}).get("required", False))
        if prop not in actual:
            errors.append(f"{item['name']}: missing prop {prop} in {path.relative_to(root)}")
            continue
        if actual[prop] != required:
            expected_label = "required" if required else "optional"
            actual_label = "required" if actual[prop] else "optional"
            errors.append(f"{item['name']}: prop {prop} is {actual_label}, expected {expected_label}")
    return errors


def verify_paths_absent(root: Path, item: dict[str, Any]) -> list[str]:
    return [f"{item['name']}: forbidden path exists: {rel}" for rel in item.get("paths", []) if (root / rel).exists()]


def verify_paths_present(root: Path, item: dict[str, Any]) -> list[str]:
    return [f"{item['name']}: required path missing: {rel}" for rel in item.get("paths", []) if not (root / rel).exists()]


def verify_paths_ignored(root: Path, item: dict[str, Any]) -> list[str]:
    return [f"{item['name']}: path is not gitignored: {rel}" for rel in item.get("paths", []) if not is_ignored(root, rel)]


def verify_file_contains(root: Path, item: dict[str, Any]) -> list[str]:
    path = root / str(item["file"])
    if not path.exists():
        return [f"{item['name']}: missing file {path.relative_to(root)}"]
    text = read(path)
    return [f"{item['name']}: {path.relative_to(root)} missing {pattern!r}" for pattern in item.get("patterns", []) if pattern not in text]


def verify_forbidden_text(root: Path, item: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for path in iter_files(root, item.get("globs", [])):
        text = read(path)
        rel = path.relative_to(root)
        for pattern in item.get("patterns", []):
            if pattern in text:
                errors.append(f"{item['name']}: forbidden text {pattern!r} in {rel}")
    return errors


def verify_forbidden_imports(root: Path, item: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for path in iter_files(root, item.get("globs", [])):
        text = read(path)
        rel = path.relative_to(root)
        for pattern in item.get("patterns", []):
            if re.search(pattern, text, re.MULTILINE):
                errors.append(f"{item['name']}: forbidden import pattern {pattern!r} in {rel}")
    return errors


VERIFY = {
    "svelte_props": verify_svelte_props,
    "paths_absent": verify_paths_absent,
    "paths_present": verify_paths_present,
    "paths_ignored": verify_paths_ignored,
    "file_contains": verify_file_contains,
    "forbidden_text": verify_forbidden_text,
    "forbidden_imports": verify_forbidden_imports,
}


def verify_items(root: Path, config: dict[str, Any], sections: set[str] | None = None) -> list[str]:
    errors: list[str] = []
    selected = sections or {"contracts", "architecture"}
    for section in selected:
        for item in config.get(section, []) or []:
            verifier = VERIFY.get(item.get("type"))
            if verifier is None:
                errors.append(f"{item.get('name', '<unnamed>')}: unknown invariant type {item.get('type')!r}")
                continue
            errors.extend(verifier(root, item))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--section", action="append", choices=["contracts", "architecture"])
    parser.add_argument("--summary", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    config = load_config(args.config.resolve())
    sections = set(args.section) if args.section else None
    errors = verify_items(root, config, sections)

    if args.summary:
        total = sum(len(config.get(section, []) or []) for section in ("contracts", "architecture"))
        if errors:
            print(f"Design status: DRIFT ({len(errors)} issue(s), {total} invariant(s))")
            for error in errors[:5]:
                print(f"  ✗ {error}")
            return 1
        print(f"Design status: sync ✓ ({total} invariant(s))")
        return 0

    if errors:
        print("Design verification failed:")
        for error in errors:
            print(f"✗ {error}")
        return 1

    total = sum(len(config.get(section, []) or []) for section in (sections or {"contracts", "architecture"}))
    print(f"✓ {total} design invariant(s) verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
