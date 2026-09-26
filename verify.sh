#!/usr/bin/env bash
# Verification for the hack47-offgrid entry: the doc-stage structural checks, then the
# real test suite and lint now that application code exists.
# Kept compatible with the bash 3.2 that ships on macOS: no mapfile, no negative
# array indices.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

fail() { echo "ERROR: $1" >&2; exit 1; }

# bin/publish.sh leaves SPEC.md out of the public repo, so the spec checks run only inside
# the monorepo; the published copy still runs the README gate, the tests and lint.
in_monorepo=false
[ -f ../../bin/publish.sh ] && [ -f ../../bin/verify.sh ] && in_monorepo=true

echo "== entry root files =="
for f in README.md LICENSE; do
  [ -f "$f" ] || fail "$f is missing from the entry root"
  echo "  ok: $f"
done

echo "== LICENSE is MIT and visible =="
grep -q '^MIT License' LICENSE || fail "LICENSE is not the MIT licence text"

if [ "$in_monorepo" = true ]; then
  [ -f SPEC.md ] || fail "SPEC.md is missing from the entry root"
  echo "  ok: SPEC.md"

  echo "== SPEC.md sections, in the order the spec fixes =="
  expected=(
    "1. Customer Confusion"
    "2. Concept"
    "3. What the agent does, what only the human does"
    "4. Tool list"
    "5. Data model"
    "6. Demo script"
    "7. Stack pin"
    "8. File layout"
    "9. Test plan"
    "10. Submission checklist"
  )
  found=()
  while IFS= read -r line; do
    found+=("$line")
  done < <(grep -E '^## ' SPEC.md)

  [ "${#found[@]}" -eq "${#expected[@]}" ] ||
    fail "SPEC.md has ${#found[@]} top-level sections, expected ${#expected[@]}"

  i=0
  while [ "$i" -lt "${#expected[@]}" ]; do
    case "${found[$i]}" in
      "## ${expected[$i]}"*) echo "  ok: ${expected[$i]}" ;;
      *) fail "section $((i + 1)) is '${found[$i]}', expected to start with '## ${expected[$i]}'" ;;
    esac
    i=$((i + 1))
  done

  echo "== the submission checklist is the final section =="
  last="${found[$((${#found[@]} - 1))]}"
  [ "$last" = "## 10. Submission checklist" ] ||
    fail "the last section of SPEC.md is '$last', not the submission checklist"

  echo "== the checklist covers every rule item (live-checked 24 Sep 2026) =="
  items=(
    "Project Name"
    "Short Description"
    "Demo Link"
    "Source Code"
    "Demo Video"
    "Tech Stack"
    "Build Process"
    "Oct 2026"
  )
  for item in "${items[@]}"; do
    grep -qi -- "$item" SPEC.md || fail "the submission checklist does not mention: $item"
    echo "  ok: $item"
  done
fi

echo "== no unresolved placeholders =="
placeholder_files=(README.md)
[ "$in_monorepo" = true ] && placeholder_files+=(SPEC.md)
if grep -nE 'TODO|TBD' "${placeholder_files[@]}"; then
  fail "${placeholder_files[*]} still contains a placeholder"
fi

echo "== the structural human-approval gate is named, not just described =="
grep -qi "never registered as a tool" README.md ||
  fail "README.md no longer states the approve/reject tool-registry exclusion"

# A fresh worktree has no node_modules — bootstrap deterministically from the committed
# lockfile before running anything that needs them. Checked against
# node_modules/.package-lock.json, not just the directory's existence, so an interrupted
# npm ci still triggers a real reinstall instead of silently skipping one.
[ -f node_modules/.package-lock.json ] || npm ci

echo "== Running tests =="
npm test

echo "== Running linter =="
npm run lint:check

echo "hack47-offgrid: all checks passed."
