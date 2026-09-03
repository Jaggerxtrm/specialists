import { chmod, lstat, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_SHEBANG = '#!/usr/bin/env node';
const BUN_SHEBANG = '#!/usr/bin/env bun';

function isWithinRoot(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveContainedPath(rootPath, candidatePath) {
  const entry = await lstat(candidatePath);
  if (entry.isSymbolicLink()) {
    throw new Error(`refusing to follow symlink: ${candidatePath}`);
  }

  const candidateRealPath = await realpath(candidatePath);
  if (!isWithinRoot(rootPath, candidateRealPath)) {
    throw new Error(`path escapes root: ${candidatePath}`);
  }

  return candidateRealPath;
}

async function resolveContainedRegularFile(rootPath, candidatePath) {
  const candidateRealPath = await resolveContainedPath(rootPath, candidatePath);
  const fileStatus = await stat(candidateRealPath);
  if (!fileStatus.isFile()) {
    throw new Error(`expected regular file: ${candidatePath}`);
  }

  return { candidateRealPath, fileStatus };
}

async function resolveContainedDirectoryRoot(lexicalPath, ...parentRealPaths) {
  const entry = await lstat(lexicalPath);
  if (entry.isSymbolicLink()) {
    throw new Error(`refusing to follow symlink: ${lexicalPath}`);
  }
  if (!entry.isDirectory()) {
    throw new Error(`expected directory: ${lexicalPath}`);
  }
  const realPath = await realpath(lexicalPath);
  for (const parentRealPath of parentRealPaths) {
    if (!isWithinRoot(parentRealPath, realPath)) {
      throw new Error(`path escapes root: ${lexicalPath}`);
    }
  }
  return realPath;
}

async function rewriteCliShebang(distRootPath) {
  const cliPath = path.join(distRootPath, 'index.js');
  const { candidateRealPath, fileStatus } = await resolveContainedRegularFile(distRootPath, cliPath);
  const cliSource = await readFile(candidateRealPath, 'utf8');
  const normalizedSource = cliSource.startsWith(NODE_SHEBANG)
    ? BUN_SHEBANG + cliSource.slice(NODE_SHEBANG.length)
    : cliSource;

  if (normalizedSource !== cliSource) {
    await writeFile(candidateRealPath, normalizedSource);
  }

  await chmod(candidateRealPath, fileStatus.mode | 0o111);
}

async function normalizeDeclarationFile(distTypesRootPath, declarationPath) {
  const { candidateRealPath } = await resolveContainedRegularFile(distTypesRootPath, declarationPath);
  const source = await readFile(candidateRealPath, 'utf8');
  const normalized = source.replace(/[\t ]+$/gm, '');

  if (normalized !== source) {
    await writeFile(candidateRealPath, normalized);
  }
}

async function walkDeclarations(distTypesRootPath, currentPath = distTypesRootPath) {
  const currentRealPath = await resolveContainedPath(distTypesRootPath, currentPath);
  const entries = await readdir(currentRealPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentRealPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to follow symlink: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      await walkDeclarations(distTypesRootPath, entryPath);
      continue;
    }
    if (!entry.name.endsWith('.d.ts')) {
      continue;
    }
    await normalizeDeclarationFile(distTypesRootPath, entryPath);
  }
}

export async function postprocessBuild(projectRootPath = process.cwd()) {
  const rootRealPath = await realpath(projectRootPath);
  const distLexicalPath = path.join(rootRealPath, 'dist');
  const distRealPath = await resolveContainedDirectoryRoot(distLexicalPath, rootRealPath);
  const distTypesLexicalPath = path.join(distLexicalPath, 'types');
  const distTypesRealPath = await resolveContainedDirectoryRoot(
    distTypesLexicalPath,
    rootRealPath,
    distRealPath,
  );
  await rewriteCliShebang(distRealPath);
  await walkDeclarations(distTypesRealPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await postprocessBuild().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
