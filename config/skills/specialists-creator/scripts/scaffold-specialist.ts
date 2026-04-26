import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { SpecialistSchema } from "../../../../src/specialist/schema.ts";

const DEAD_FIELDS = new Set<string>([]);

interface AddedField {
  path: string;
  value: unknown;
}

interface ScaffoldResult {
  value: unknown;
  added: AddedField[];
  changed: boolean;
}

function printUsage(): void {
  console.error("Usage: node scripts/scaffold-specialist.ts <path-to-specialist.json>");
  console.error("   or: node scripts/scaffold-specialist.ts --all");
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodEffects
  ) {
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }

    if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
      continue;
    }

    current = current.unwrap();
  }
  return current;
}

function isOptionalWithoutDefault(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional) {
    return true;
  }
  if (schema instanceof z.ZodNullable) {
    return isOptionalWithoutDefault(schema.unwrap());
  }
  if (schema instanceof z.ZodEffects) {
    return isOptionalWithoutDefault(schema.innerType());
  }
  if (schema instanceof z.ZodDefault) {
    return false;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function scaffoldSchema(schema: z.ZodTypeAny, currentValue: unknown, path: string[]): ScaffoldResult {
  if (schema instanceof z.ZodEffects) {
    return scaffoldSchema(schema.innerType(), currentValue, path);
  }

  if (schema instanceof z.ZodDefault) {
    const inner = schema._def.innerType;
    if (currentValue === undefined) {
      const defaultValue = schema._def.defaultValue();
      const nested = scaffoldSchema(inner, defaultValue, path);
      return {
        value: nested.value,
        added: [{ path: path.join("."), value: nested.value }, ...nested.added],
        changed: true,
      };
    }
    return scaffoldSchema(inner, currentValue, path);
  }

  if (schema instanceof z.ZodOptional) {
    if (currentValue === undefined) {
      return { value: currentValue, added: [], changed: false };
    }
    return scaffoldSchema(schema.unwrap(), currentValue, path);
  }

  if (schema instanceof z.ZodNullable) {
    if (currentValue === null || currentValue === undefined) {
      return { value: currentValue, added: [], changed: false };
    }
    return scaffoldSchema(schema.unwrap(), currentValue, path);
  }

  if (schema instanceof z.ZodArray) {
    if (currentValue === undefined) {
      return {
        value: [],
        added: [{ path: path.join("."), value: [] }],
        changed: true,
      };
    }
    return { value: currentValue, added: [], changed: false };
  }

  if (schema instanceof z.ZodEnum) {
    return { value: currentValue, added: [], changed: false };
  }

  if (schema instanceof z.ZodObject) {
    const source = isRecord(currentValue) ? currentValue : undefined;
    const draft: Record<string, unknown> = source ? { ...source } : {};
    const added: AddedField[] = [];
    let changed = false;

    const shape = schema.shape;
    for (const [key, childSchema] of Object.entries(shape)) {
      if (DEAD_FIELDS.has(key)) {
        continue;
      }

      const childPath = [...path, key];
      const childValue = source?.[key];
      const childResult = scaffoldSchema(childSchema as z.ZodTypeAny, childValue, childPath);

      if (!childResult.changed) {
        continue;
      }

      draft[key] = childResult.value;
      added.push(...childResult.added);
      changed = true;
    }

    if (!source) {
      if (!changed || isOptionalWithoutDefault(schema)) {
        return { value: currentValue, added, changed: false };
      }
      return { value: draft, added, changed: true };
    }

    return { value: changed ? draft : currentValue, added, changed };
  }

  const unwrapped = unwrapSchema(schema);
  if (
    unwrapped instanceof z.ZodString ||
    unwrapped instanceof z.ZodNumber ||
    unwrapped instanceof z.ZodBoolean
  ) {
    return { value: currentValue, added: [], changed: false };
  }

  return { value: currentValue, added: [], changed: false };
}

function loadTargets(arg: string): string[] {
  if (arg !== "--all") {
    return [arg];
  }

  const specialistsDir = join(process.cwd(), "config", "specialists");
  return readdirSync(specialistsDir)
    .filter(file => file.endsWith(".specialist.json"))
    .sort()
    .map(file => join(specialistsDir, file));
}

function processFile(filePath: string): AddedField[] {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }

  const result = scaffoldSchema(SpecialistSchema, parsed, []);
  if (!result.changed) {
    return [];
  }

  writeFileSync(filePath, `${JSON.stringify(result.value, null, 2)}\n`, "utf8");
  return result.added;
}

function run(): void {
  const targetArg = process.argv[2];
  if (!targetArg) {
    printUsage();
    process.exit(64);
  }

  const targets = loadTargets(targetArg);
  if (targets.length === 0) {
    console.log("No specialist files found.");
    return;
  }

  for (const filePath of targets) {
    const addedFields = processFile(filePath);
    if (addedFields.length === 0) {
      continue;
    }

    for (const field of addedFields) {
      console.log(`${filePath}: ${field.path} = ${formatValue(field.value)}`);
    }
  }
}

run();
