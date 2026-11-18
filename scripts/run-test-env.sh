#!/bin/bash
# Starts mock Supabase + fake Gemini + the built app on port 3100 (TEST ONLY).
cd "$(dirname "$0")/.."
set -a; . ./scripts/test.env; set +a
[ -n "$GEMINI_MODEL_OVERRIDE" ] && export GEMINI_MODEL="$GEMINI_MODEL_OVERRIDE"
mkdir -p scripts/.tmp
nohup node scripts/mock-supabase.mjs > scripts/.tmp/sb.log 2>&1 &
nohup node scripts/fake-gemini.mjs > scripts/.tmp/gm.log 2>&1 &
export GEMINI_IP_HOURLY=5000 WRITE_IP_HOURLY=20000 CONSOLE_IP_HOURLY=20000
export LABOPS_TEST_PREFER=ad-lockout-stale-creds,ad-password-reset,ad-onboarding-new-hire,dns-apipa,dns-wrong-client-dns,dhcp-not-authorized,ad-logon-restrictions
nohup npx next start -p 3100 > scripts/.tmp/app.log 2>&1 &
sleep 5
echo started
