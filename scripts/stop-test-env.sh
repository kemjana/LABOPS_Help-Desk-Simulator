#!/bin/bash
for p in $(pgrep -f "scripts/mock-supabase.mjs") $(pgrep -f "scripts/fake-gemini.mjs") $(pgrep -f "next-server") $(pgrep -f "next start"); do kill $p 2>/dev/null; done
sleep 1
