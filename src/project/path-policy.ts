const GENERATED_FILE_SUFFIXES = [
  ".generated.css",
  ".generated.js",
  ".generated.jsx",
  ".generated.ts",
  ".generated.tsx",
  ".gen.js",
  ".gen.jsx",
  ".gen.ts",
  ".gen.tsx"
] as const;

const GENERATED_PATH_SEGMENTS = new Set(["__generated__", "codegen", "generated"]);

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/^\.\/+/u, "");
}

export function matchesPathPattern(relativePath: string, pattern: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedPattern = normalizeRelativePath(pattern);

  if (normalizedPattern.length === 0) {
    return false;
  }

  if (normalizedPattern.endsWith("/**")) {
    const patternPrefix = normalizedPattern.slice(0, -"/**".length);
    return normalizedPath === patternPrefix || normalizedPath.startsWith(`${patternPrefix}/`);
  }

  if (normalizedPattern.endsWith("*")) {
    const patternPrefix = normalizedPattern.slice(0, -"*".length);
    return normalizedPath.startsWith(patternPrefix) || normalizedPath.split("/").some((segment) => segment.startsWith(patternPrefix));
  }

  if (normalizedPattern.includes("/")) {
    return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
  }

  return normalizedPath.split("/").includes(normalizedPattern);
}

export function isGeneratedPath(relativePath: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const segments = normalizedPath.split("/");
  const fileName = segments.at(-1) ?? normalizedPath;

  return segments.some((segment) => GENERATED_PATH_SEGMENTS.has(segment)) || GENERATED_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

export function isIgnoredPath(relativePath: string, ignorePatterns: readonly string[]): boolean {
  return ignorePatterns.some((pattern) => matchesPathPattern(relativePath, pattern));
}

export function isPathAllowed(relativePath: string, allowPatterns: readonly string[]): boolean {
  return allowPatterns.some((pattern) => matchesPathPattern(relativePath, pattern));
}
