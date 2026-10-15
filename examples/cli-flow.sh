#!/usr/bin/env bash
# cli-flow.sh — the full clinic flow through the CLI surface only.
# Every command below calls the same defineAction the agent and the UI use.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1. Find a cardiologist working Monday =="
pnpm action find-doctor --specialty Cardiology --day Mon

echo "== 2. Book an appointment =="
pnpm action book-appointment --doctor "Dr. Ayesha Khan" --day Mon --time 10:00 \
  --patient_name "Demo Patient" --phone "+92-300-0000001"

echo "== 3. Double-booking the same slot must fail =="
pnpm action book-appointment --doctor "Dr. Ayesha Khan" --day Mon --time 10:00 \
  --patient_name "Second Patient" --phone "+92-300-0000002" || echo "(rejected as expected)"

echo "== 4. Triage assessment =="
pnpm action triage-assess --patient_name "Demo Patient" \
  --symptoms '["chest pain", "shortness of breath"]'

echo "== 5. Dashboard =="
pnpm action clinic-dashboard
