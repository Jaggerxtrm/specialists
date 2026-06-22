#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <pack-json> <required-asset>..." >&2
  exit 2
fi

pack_json=$1
shift

if [[ ! -f $pack_json ]]; then
  echo "package payload check failed: missing dry-run json: $pack_json" >&2
  exit 2
fi

missing=()
mapfile -t payload_files < <(
  jq -r '.[0].files[]?.path // empty' "$pack_json"
)

for asset in "$@"; do
  found=false
  for payload in "${payload_files[@]}"; do
    if [[ "$payload" == "$asset" ]]; then
      found=true
      break
    fi
  done
  if [[ "$found" != true ]]; then
    missing+=("$asset")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "package payload check failed: missing required assets:" >&2
  printf ' - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "package payload check passed: all required assets present"
