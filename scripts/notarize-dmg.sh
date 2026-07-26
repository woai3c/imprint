#!/usr/bin/env bash
set -euo pipefail

artifact="${1:?'Usage: scripts/notarize-dmg.sh path/to/Imprint.dmg'}"
: "${APPLE_API_KEY:?'APPLE_API_KEY is required'}"
: "${APPLE_API_KEY_ID:?'APPLE_API_KEY_ID is required'}"
: "${APPLE_API_ISSUER:?'APPLE_API_ISSUER is required'}"

if [ ! -f "$artifact" ]; then
  echo "DMG not found: $artifact" >&2
  exit 1
fi

output="$(mktemp -t imprint-notary.XXXXXX).json"
trap 'rm -f "$output"' EXIT

read_json_field() {
  node -e "
    const fs = require('node:fs')
    const payload = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))
    process.stdout.write(String(payload[process.argv[2]] || ''))
  " "$output" "$1"
}

submission_id=""
for attempt in 1 2 3 4 5; do
  if xcrun notarytool submit "$artifact" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --no-wait \
    --output-format json >"$output"; then
    submission_id="$(read_json_field id)"
    if [ -n "$submission_id" ]; then
      break
    fi
  fi

  echo "DMG notarization submission failed (${attempt}/5); retrying in 20 seconds..." >&2
  sleep 20
done

if [ -z "$submission_id" ]; then
  echo "Could not obtain a notarization submission ID." >&2
  exit 1
fi

echo "DMG submitted for notarization: $submission_id"
status=""
for attempt in 1 2 3 4 5; do
  if xcrun notarytool wait "$submission_id" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --timeout 1200 \
    --output-format json >"$output"; then
    status="$(read_json_field status)"
  else
    status="$(read_json_field status 2>/dev/null || true)"
  fi

  if [ "$status" = "Accepted" ]; then
    break
  fi

  if [ "$status" = "Invalid" ] || [ "$status" = "Rejected" ]; then
    break
  fi

  echo "DMG notarization status is unavailable (${attempt}/5); retrying in 20 seconds..." >&2
  sleep 20
done

if [ "$status" != "Accepted" ]; then
  echo "DMG notarization failed with status: ${status:-unknown}" >&2
  xcrun notarytool log "$submission_id" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" || true
  exit 1
fi

xcrun stapler staple "$artifact"
xcrun stapler validate "$artifact"
codesign --verify --verbose=2 "$artifact"
echo "DMG notarization and stapling verified."
