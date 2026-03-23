#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $(basename "$0") <path-to.specialist.yaml>" >&2
  exit 64
fi

file="$1"

if [[ ! -f "$file" ]]; then
  echo "File not found: $file" >&2
  exit 66
fi

bun -e '''
import { readFileSync } from "node:fs";
import { parseSpecialist } from "./src/specialist/schema.ts";

const file = process.argv[1];
const yaml = readFileSync(file, "utf8");

try {
  await parseSpecialist(yaml);
  console.log(`OK ${file}`);
} catch (error) {
  console.error(`Invalid ${file}`);
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    for (const issue of error.issues) {
      const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "<root>";
      console.error(`- ${path}: ${issue.message}`);
    }
  } else if (error && typeof error === "object" && "message" in error) {
    console.error(String(error.message));
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
''' "$file"
