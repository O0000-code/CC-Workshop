#!/usr/bin/env bash
# Run claude -p with the prompt for the given strategy.
# Usage: run.sh <A|B|C|D> [--first N] [--out FILE]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

STRATEGY="${1:-}"
shift || true
FIRST_ARG=""
OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --first) FIRST_ARG="--first $2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

if [[ -z "$STRATEGY" ]]; then
  echo "Usage: run.sh <A|B|C|D> [--first N] [--out FILE]" >&2
  exit 1
fi
if [[ -z "$OUT" ]]; then
  OUT="03_run_${STRATEGY}.json"
fi
# Make OUT absolute (we cd to /tmp before running claude)
if [[ "$OUT" != /* ]]; then
  OUT="$HERE/$OUT"
fi

# Build prompt (writes to file to avoid argv-length limits)
PROMPT_FILE="$(mktemp -t classify_prompt.XXXXXX)"
python3 build_prompt.py $STRATEGY $FIRST_ARG > "$PROMPT_FILE"
PROMPT_BYTES=$(wc -c < "$PROMPT_FILE")
echo "[run.sh] strategy=$STRATEGY prompt_bytes=$PROMPT_BYTES out=$OUT" >&2

# Mirror classify.rs schema verbatim
SCHEMA='{"type":"object","properties":{"classifications":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"category":{"type":"string"},"parent_category":{"type":"string"},"tags":{"type":"array","items":{"type":"string","pattern":"^[a-z]+$"},"minItems":1,"maxItems":2},"icon":{"type":"string"}},"required":["id","category","tags","icon"]}}},"required":["classifications"]}'

# Exec claude -p mirroring the Tauri classify.rs flags. Run from /tmp so the
# only inherited CLAUDE.md is `~/.claude/CLAUDE.md` (which the production app
# also inherits via its launched cwd). This excludes project-specific noise.
# Pass prompt via stdin (claude reads stdin when prompt arg is empty) to dodge
# argv-too-long for D-strategy (390 KB).
START=$(date +%s)
set +e
( cd /tmp && claude -p \
  --output-format json \
  --json-schema "$SCHEMA" \
  --dangerously-skip-permissions \
  --no-session-persistence \
  --model sonnet < "$PROMPT_FILE" > "$OUT" 2> "${OUT}.stderr" )
EXIT=$?
set -e
END=$(date +%s)
ELAPSED=$((END - START))

echo "[run.sh] exit=$EXIT elapsed=${ELAPSED}s output_bytes=$(wc -c < "$OUT" 2>/dev/null || echo 0)" >&2
if [[ $EXIT -ne 0 ]]; then
  echo "[run.sh] STDERR:" >&2
  cat "${OUT}.stderr" >&2
fi

rm -f "$PROMPT_FILE"
exit $EXIT
