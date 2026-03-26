import { readFileSync } from "node:fs";
import { parseSpecialist } from "../../../src/specialist/schema.ts";

function printUsage(): void {
  console.error("Usage: bun skills/specialist-author/scripts/validate-specialist.ts <path-to.specialist.yaml>");
}

const file = process.argv[2];

if (!file) {
  printUsage();
  process.exit(64);
}

let yaml: string;
try {
  yaml = readFileSync(file, "utf8");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`File not found or unreadable: ${file}`);
  console.error(message);
  process.exit(66);
}

try {
  await parseSpecialist(yaml);
  console.log(`OK ${file}`);
} catch (error) {
  console.error(`Invalid ${file}`);
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    for (const issue of error.issues) {
      const path = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "<root>";
      console.error(`- ${path}: ${issue.message}`);
    }
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
