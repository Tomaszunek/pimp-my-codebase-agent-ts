import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_PROJECT_CONFIG } from "./defaults.js";
import { loadProjectConfig, parseProjectConfig } from "./load-config.js";

void describe("loadProjectConfig", () => {
  void it("falls back to safe defaults when config is missing", async () => {
    const result = await loadProjectConfig(path.join(process.cwd(), ".missing-pmc-config-test"));

    assert.equal(result.source, "defaults");
    assert.deepEqual(result.errors, []);
    assert.equal(result.config.packageManager, "pnpm");
    assert.equal(result.config.projectType, "frontend");
    assert.equal(result.config.privacy.readSecrets, false);
    assert.deepEqual(result.config.privacy.ignore, DEFAULT_PROJECT_CONFIG.privacy.ignore);
  });
});

void describe("parseProjectConfig", () => {
  void it("normalizes a project config file", () => {
    const expectedLlmTimeoutSeconds = Number("45");
    const expectedCheckTimeoutSeconds = Number("90");
    const result = parseProjectConfig(
      JSON.stringify({
        checks: [
          {
            command: "pnpm run quality",
            id: "quality",
            timeoutSeconds: expectedCheckTimeoutSeconds
          }
        ],
        generatedFileAllowlist: ["src/generated/**"],
        llm: {
          baseUrl: "http://localhost:1234/v1",
          enabled: true,
          model: "local-model",
          provider: "lmstudio",
          timeoutSeconds: expectedLlmTimeoutSeconds
        },
        packageManager: "pnpm",
        privacy: {
          ignore: [".env", ".npmrc"],
          readGitHistory: false,
          readSecrets: false
        },
        projectType: "frontend",
        skills: ["modernize"]
      }),
      "config.json"
    );

    const [checkGuard] = result.config.checks;

    assert.equal(result.source, "file");
    assert.deepEqual(result.errors, []);
    assert.equal(result.config.llm.enabled, true);
    assert.equal(result.config.llm.timeoutSeconds, expectedLlmTimeoutSeconds);
    assert.equal(result.config.generatedFileAllowlist[0], "src/generated/**");
    assert.ok(checkGuard);
    assert.equal(checkGuard.id, "quality");
    assert.equal(checkGuard.purpose, "custom");
    assert.equal(checkGuard.timeoutSeconds, expectedCheckTimeoutSeconds);
  });

  void it("returns clear validation errors for invalid config fields", () => {
    const result = parseProjectConfig(
      JSON.stringify({
        checks: [{ command: "", id: "", purpose: "unsafe", timeoutSeconds: -1 }],
        generatedFileAllowlist: ["dist/**", ""],
        llm: {
          enabled: "yes",
          provider: "remote"
        },
        packageManager: "pip",
        privacy: {
          readSecrets: "never"
        },
        projectType: "backend",
        skills: ["quality", ""]
      })
    );

    assert.deepEqual(result.errors, [
      "projectType must be one of: frontend, fullstack, node, unknown.",
      "packageManager must be one of: bun, npm, pnpm, unknown, yarn.",
      "checks[0].id must be a non-empty string.",
      "checks[0].command must be a non-empty string.",
      "checks[0].timeoutSeconds must be a positive integer.",
      "checks[0].purpose must be one of: build, custom, format, lint, test, typecheck.",
      "generatedFileAllowlist must be an array of non-empty strings.",
      "llm.provider must be one of: lmstudio.",
      "llm.enabled must be a boolean.",
      "privacy.readSecrets must be a boolean.",
      "skills must be an array of non-empty strings."
    ]);
  });

  void it("returns a clear parse error for invalid JSON", () => {
    const result = parseProjectConfig("{");

    assert.equal(result.source, "file");
    assert.equal(result.config.packageManager, DEFAULT_PROJECT_CONFIG.packageManager);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0] ?? "", /^Invalid JSON in config\.json:/u);
  });
});
