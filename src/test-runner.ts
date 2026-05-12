import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_FILE_SUFFIX = ".test.js";

async function findTestFiles(directoryPath: string): Promise<readonly string[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Test runner recursively scans compiled project output.
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const testFiles: string[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        testFiles.push(...(await findTestFiles(entryPath)));
        return;
      }

      if (entry.isFile() && entry.name.endsWith(TEST_FILE_SUFFIX)) {
        testFiles.push(entryPath);
      }
    })
  );

  // eslint-disable-next-line unicorn/no-array-sort -- The project lib is ES2022, so Array#toSorted is not available to TypeScript.
  return [...testFiles].sort((left: string, right: string) => left.localeCompare(right));
}

const distributionRoot = path.dirname(fileURLToPath(import.meta.url));
const testFiles = await findTestFiles(distributionRoot);

await Promise.all(
  testFiles.map(async (testFile): Promise<void> => {
    await import(pathToFileURL(testFile).href);
  })
);
