#!/usr/bin/env python3
"""Validate that a generated SaaS onboarding operations suite implements its declared features."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="Root directory of the generated suite")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "templates" / "suite-feature-manifest.json",
        help="Feature manifest JSON; paths are relative to --root",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    manifest_path = args.manifest.resolve()

    if not root.is_dir():
        print(f"ERROR: suite root does not exist: {root}", file=sys.stderr)
        return 2
    if not manifest_path.is_file():
        print(f"ERROR: manifest does not exist: {manifest_path}", file=sys.stderr)
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    features = manifest.get("features", [])
    if not isinstance(features, list) or not features:
        print("ERROR: manifest must contain a non-empty features list", file=sys.stderr)
        return 2

    missing: list[str] = []
    for feature in features:
        feature_id = feature.get("id", "unnamed-feature")
        paths = feature.get("required_paths", [])
        if not paths:
            missing.append(f"{feature_id}: no required_paths declared")
            continue
        absent = [relative for relative in paths if not (root / relative).is_file()]
        if absent:
            missing.append(f"{feature_id}: missing {', '.join(absent)}")

    if missing:
        print("FEATURE COVERAGE FAILED")
        for line in missing:
            print(f"- {line}")
        return 1

    print(f"FEATURE COVERAGE PASSED: {len(features)}/{len(features)} declared capabilities have source coverage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
