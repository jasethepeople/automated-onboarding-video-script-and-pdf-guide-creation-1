#!/usr/bin/env python3
"""Validate and protect an approved replacement Playwright storage state.

This tool intentionally does NOT automate password entry, SSO, MFA, OTP, or
session creation. Its headless mode only validates a state file already
captured by an authorized human through the organization-approved login flow.

Examples:
  # Validate a manually captured state in headless Chromium, then seal it.
  export SESSION_STATE_ENCRYPTION_KEY="$(openssl rand -base64 32)"
  python session_state_recovery.py seal \
    --state .asana_auth.json \
    --workspace-url https://app.asana.com/0/home \
    --output asana_session.sealed.json

  # Decrypt a sealed state to a temporary local file for an approved CI handoff.
  python session_state_recovery.py unseal \
    --input asana_session.sealed.json \
    --output .asana_auth.json

The encryption key is read from SESSION_STATE_ENCRYPTION_KEY by default. Keep
that key separate from the sealed output and never commit either artifact.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from playwright.async_api import async_playwright

AAD = b"asana-playwright-storage-state/v1"
DEFAULT_SELECTOR = "button:has-text('Create'), [aria-label*='Create'], button[title*='Create']"


class RecoveryError(RuntimeError):
    """Raised when an input state is unsafe, invalid, or not authenticated."""


def write_private_bytes(path: Path, data: bytes) -> None:
    """Atomically write a file readable only by the current user."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if temporary.exists():
            temporary.unlink(missing_ok=True)


def load_state(path: Path) -> tuple[dict[str, Any], bytes]:
    if not path.is_file():
        raise RecoveryError(f"State file does not exist: {path}")
    raw = path.read_bytes()
    if not raw:
        raise RecoveryError("State file is empty.")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RecoveryError("State file is not valid JSON.") from exc
    if not isinstance(parsed, dict):
        raise RecoveryError("Storage state must be a JSON object.")
    cookies = parsed.get("cookies")
    origins = parsed.get("origins")
    if not isinstance(cookies, list) or not isinstance(origins, list):
        raise RecoveryError("Storage state must contain list-valued cookies and origins fields.")
    if not cookies and not origins:
        raise RecoveryError("Storage state contains neither cookies nor origins and cannot authenticate a browser.")
    return parsed, raw


def key_from_environment(variable_name: str) -> bytes:
    value = os.environ.get(variable_name)
    if not value:
        raise RecoveryError(f"Missing {variable_name}. Supply a base64-encoded 32-byte AES key through an approved secret manager.")
    try:
        key = base64.b64decode(value, validate=True)
    except Exception as exc:
        raise RecoveryError(f"{variable_name} is not valid base64.") from exc
    if len(key) != 32:
        raise RecoveryError(f"{variable_name} must decode to exactly 32 bytes for AES-256-GCM.")
    return key


def seal(raw_state: bytes, key: bytes) -> dict[str, str | int]:
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, raw_state, AAD)
    return {
        "version": 1,
        "algorithm": "AES-256-GCM",
        "aad": AAD.decode("ascii"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "nonce_b64": base64.b64encode(nonce).decode("ascii"),
        "ciphertext_b64": base64.b64encode(ciphertext).decode("ascii"),
    }


def unseal(envelope: dict[str, Any], key: bytes) -> bytes:
    required = {"version", "algorithm", "aad", "nonce_b64", "ciphertext_b64"}
    if not required.issubset(envelope):
        raise RecoveryError("Encrypted state envelope is missing required fields.")
    if envelope["version"] != 1 or envelope["algorithm"] != "AES-256-GCM" or envelope["aad"] != AAD.decode("ascii"):
        raise RecoveryError("Encrypted state envelope has an unsupported algorithm, version, or associated-data value.")
    try:
        nonce = base64.b64decode(envelope["nonce_b64"], validate=True)
        ciphertext = base64.b64decode(envelope["ciphertext_b64"], validate=True)
    except Exception as exc:
        raise RecoveryError("Encrypted state envelope contains invalid base64.") from exc
    if len(nonce) != 12:
        raise RecoveryError("Encrypted state envelope has an invalid AES-GCM nonce length.")
    try:
        return AESGCM(key).decrypt(nonce, ciphertext, AAD)
    except Exception as exc:
        raise RecoveryError("Encrypted state could not be authenticated. Check the key and envelope integrity.") from exc


async def verify_authenticated_state(state_path: Path, workspace_url: str, selector: str, headed: bool) -> None:
    """Open only the supplied state; never interact with authentication controls."""
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=not headed)
        context = await browser.new_context(
            storage_state=str(state_path),
            viewport={"width": 1440, "height": 900},
        )
        page = await context.new_page()
        try:
            await page.goto(workspace_url, wait_until="domcontentloaded", timeout=30_000)
            await page.wait_for_timeout(750)
            if any(token in page.url().lower() for token in ("login", "signin", "sso", "auth")):
                raise RecoveryError("Replacement state was redirected to an authentication page and is not valid for unattended use.")
            await page.locator(selector).first.wait_for(state="visible", timeout=12_000)
        except RecoveryError:
            raise
        except Exception as exc:
            raise RecoveryError("Replacement state could not reach the expected authenticated workspace UI.") from exc
        finally:
            await context.close()
            await browser.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate and securely seal or unseal approved Playwright browser state. No login automation is performed.")
    subcommands = parser.add_subparsers(dest="command", required=True)

    seal_parser = subcommands.add_parser("seal", help="Validate an approved state headlessly, then AES-GCM encrypt it.")
    seal_parser.add_argument("--state", required=True, help="Manually captured Playwright storage-state JSON.")
    seal_parser.add_argument("--workspace-url", required=True, help="Expected signed-in workspace URL.")
    seal_parser.add_argument("--expected-selector", default=DEFAULT_SELECTOR, help="Authenticated UI selector required after navigation.")
    seal_parser.add_argument("--output", required=True, help="Private output path for the encrypted JSON envelope.")
    seal_parser.add_argument("--key-env", default="SESSION_STATE_ENCRYPTION_KEY", help="Environment variable containing a base64 AES-256 key.")
    seal_parser.add_argument("--headed", action="store_true", help="Show the browser for validation troubleshooting; does not enable login automation.")
    seal_parser.add_argument("--skip-browser-validation", action="store_true", help="Skip headless validation only for offline cryptographic testing. Not recommended for CI replacement state.")

    unseal_parser = subcommands.add_parser("unseal", help="Decrypt an envelope to a local private state file.")
    unseal_parser.add_argument("--input", required=True, help="Encrypted state envelope JSON.")
    unseal_parser.add_argument("--output", required=True, help="Private path for the decrypted storage-state JSON.")
    unseal_parser.add_argument("--key-env", default="SESSION_STATE_ENCRYPTION_KEY", help="Environment variable containing a base64 AES-256 key.")
    return parser.parse_args()


async def async_main(args: argparse.Namespace) -> None:
    key = key_from_environment(args.key_env)
    if args.command == "seal":
        state_path = Path(args.state).expanduser().resolve()
        _, raw_state = load_state(state_path)
        if not args.skip_browser_validation:
            await verify_authenticated_state(state_path, args.workspace_url, args.expected_selector, args.headed)
        envelope = seal(raw_state, key)
        write_private_bytes(Path(args.output).expanduser().resolve(), (json.dumps(envelope, separators=(",", ":")) + "\n").encode("utf-8"))
        print(f"Validated and encrypted browser state written to: {Path(args.output).expanduser().resolve()}")
        return

    envelope_path = Path(args.input).expanduser().resolve()
    if not envelope_path.is_file():
        raise RecoveryError(f"Encrypted state envelope does not exist: {envelope_path}")
    try:
        envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RecoveryError("Encrypted state envelope is not valid JSON.") from exc
    raw_state = unseal(envelope, key)
    try:
        json.loads(raw_state)
    except json.JSONDecodeError as exc:
        raise RecoveryError("Decrypted payload is not valid JSON storage state.") from exc
    write_private_bytes(Path(args.output).expanduser().resolve(), raw_state)
    print(f"Decrypted browser state written to private path: {Path(args.output).expanduser().resolve()}")


def main() -> int:
    try:
        asyncio.run(async_main(parse_args()))
        return 0
    except RecoveryError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("ERROR: operation cancelled", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
