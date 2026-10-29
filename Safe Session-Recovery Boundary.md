# Safe Session-Recovery Boundary

The browser-state recovery component is designed to **validate and protect** an already approved replacement session. It does not attempt to create that replacement by driving a sign-in form, entering a password, collecting an OTP, completing MFA, or circumventing SSO. An expired state therefore remains a fail-closed condition until an authorized identity owner supplies a newly captured test-account state.

| Recovery capability | Included | Reason |
|---|---:|---|
| Parse and validate Playwright storage-state JSON | Yes | Reject malformed or empty input before it reaches CI storage. |
| Verify state in a headless Chromium browser | Yes | Confirms the supplied state reaches the expected authenticated workspace without creating SaaS data. |
| Encrypt validated state with AES-256-GCM | Yes | Produces an authenticated encrypted handoff artifact for an approved secret-management process. |
| Print, upload, or commit state content | No | A storage state is credential material. |
| Headless password/SSO/MFA/OTP login | No | Would subvert or weaken the intended identity controls. |
| Update GitHub environment secrets from an untrusted runner | No | Requires separate, tightly controlled secret-administration authority. |

## Approved operating model

1. The scheduled health check detects expiration and opens the existing renewal issue.
2. An authorized owner signs in manually to the dedicated test account, completing the organization’s normal identity checks.
3. The owner captures a new `.asana_auth.json` using the existing auth-only command.
4. The recovery script validates that fresh file headlessly and encrypts it locally with a key from the approved secret manager.
5. The approved secret-management procedure replaces the protected `ASANA_STORAGE_STATE_B64` value. The CI workflow then runs its session-health setup project to confirm recovery.

> The term **headless fallback** means a headless validation attempt of a supplied replacement state. It does **not** mean headless authentication fallback.

## Key-management contract

The encryption key is a 32-byte random AES key, supplied as a base64 string in `SESSION_STATE_ENCRYPTION_KEY`. Store it separately from the encrypted output. In a production setup, use an enterprise KMS or approved secrets manager to generate and hold the key; do not store it in the repository, workflow file, or a browser-state secret.

GitHub recommends least privilege for credentials and warns that structured secret data can be difficult to redact reliably in logs.[1] The recovery tool consequently prints only statuses and output paths, never serialized state or ciphertext.

## References

[1]: https://docs.github.com/en/actions/reference/security/secure-use "GitHub Docs — Secure use reference"

---

**Prepared by Manus AI.**
