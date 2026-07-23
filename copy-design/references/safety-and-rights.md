# Safety, privacy, and rights

Use this reference for private, authenticated, internal, or brand-heavy sources.

## Safe browsing

- Restrict automatic discovery to user-scoped origins.
- Deny localhost and private-network sources unless the user explicitly places them in scope.
- Never access cloud metadata endpoints or expand to unrelated local ports.
- Do not bypass authentication, CAPTCHA, paywalls, region controls, or anti-bot measures.
- Stop when safe access is unavailable; accept screenshots instead.

## Safe interaction

Allowed by default:

- Hover
- Focus and blur
- Opening and closing a demonstrably display-only menu or dialog
- Switching a local presentation-only tab

Forbidden by default:

- Form submission
- Login, registration, or verification-code requests
- Purchase, payment, booking, or checkout
- Delete, publish, like, follow, or subscribe
- File upload
- Sending messages, email, or notifications
- Any click with uncertain effects

The bundled capture script intentionally never clicks.

## Sensitive data

Never persist:

- Cookies
- Authorization headers
- Browser storage values
- Passwords
- Form values
- Session, signature, token, email, or account query parameters
- User names, orders, messages, or private business records

Use a user-controlled authenticated browser session only when the execution environment supports it without exposing credentials. Prefer user-supplied redacted screenshots.

Treat screenshots as potentially sensitive. Store evidence in an OS temporary directory and clean it after verified output unless the user explicitly requests a reusable evidence profile.

## Source and asset boundaries

Extract observable design rules, not implementation ownership:

- Do not copy full HTML, JavaScript, CSS, API behavior, or page copy.
- Do not download or redistribute logos, trademarks, proprietary icons, illustrations, photography, or restricted font binaries by default.
- Record asset role, dimensions, crop, contrast, stroke, and visual style so a licensed replacement can be created.
- Keep source attribution and evidence scope in the managed block.
- Avoid instructions intended to impersonate the source service or mislead users.

Users remain responsible for rights and release review. When commercial publication would closely resemble a protected brand or product, flag the need for appropriate legal and design review rather than offering a legal conclusion.

## Project-file safety

- Write only root-level `AGENTS.md`, `CLAUDE.md`, or `DESIGN.md`.
- Modify only the matching managed block.
- Stop on malformed, nested, mismatched, or duplicate markers.
- Preserve user-authored rules and user overrides.
- When both agent instruction files exist, keep their managed blocks identical.
- Do not leave a partial two-file update.
