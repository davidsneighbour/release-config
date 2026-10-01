import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from 'release-it';

type Hooks = NonNullable<Config['hooks']>;
type HookKey = keyof Hooks;
type HookValue = string | string[];

const CITATION_CFF_HOOK =
  `if [ -f CITATION.cff ]; then last_commit=$(git rev-parse HEAD); release_date=$(date +%F); sed -Ei "s/^version: .*/version: v\${version}/" CITATION.cff; sed -Ei "s/^date-released: .*/date-released: $release_date/" CITATION.cff; sed -Ei "s/^commit: .*/commit: $last_commit/" CITATION.cff; git add CITATION.cff; fi`;

type JsonObject = Record<string, unknown>;

export interface ChangelogScopeOptions {
  /**
   * Commit types that create a minor release when they are not excluded by a matching subscope.
   *
   * @example ["feat", "prompt", "instructions", "skill"]
   */
  minorTypes?: readonly string[];

  /**
   * Commit types that create a patch release.
   *
   * @example ["fix", "perf", "refactor"]
   */
  patchTypes?: readonly string[];

  /**
   * Subscopes that prevent a commit type from being treated as a minor release.
   *
   * @example { feat: ["fix"], prompt: ["fix"] }
   */
  minorExclusionSubscopes?: Readonly<Record<string, readonly string[]>>;
}

export interface RepositoryOptions {
  /**
   * Path to the consumer repository package.json.
   *
   * @default "package.json"
   */
  packageJsonPath?: string;

  /**
   * Explicit repository URL fallback when package.json does not contain repository information.
   */
  fallbackUrl?: string;
}

export interface ReleaseConfigOptions {
  /**
   * Generate or update this changelog file.
   *
   * @default "CHANGELOG.md"
   */
  changelogFile?: string;

  /**
   * Token name used by release-it GitHub releases.
   *
   * @default "GITHUB_TOKEN_CONTENT_PRIVATE"
   */
  githubTokenRef?: string;

  /**
   * Repository URL detection settings.
   */
  repository?: RepositoryOptions;

  /**
   * Conventional changelog type, scope, and subscope settings.
   */
  scopes?: ChangelogScopeOptions;

  /**
   * Extra release-it config merged shallowly on top of the shared defaults.
   */
  overrides?: Partial<Config>;
}

interface PackageJson {
  repository?: string | {
    type?: string;
    url?: string;
  };
}

const DEFAULT_MINOR_TYPES = ["feat", "prompt", "instructions", "skill"] as const;
const DEFAULT_PATCH_TYPES = ["fix", "perf", "refactor", "docs", "style", "test", "build", "ci", "chore"] as const;
const DEFAULT_MINOR_EXCLUSION_SUBSCOPES: Readonly<Record<string, readonly string[]>> = {
  feat: ["fix"],
  instructions: ["fix"],
  prompt: ["fix"],
  skill: ["fix"]
};

/**
 * Create a reusable release-it configuration.
 *
 * The generated config reads the repository URL from the consuming project's package.json
 * and uses it for conventional changelog commit, compare, issue, and user links.
 *
 * @param options - Optional project-specific configuration overrides.
 * @returns A release-it configuration object.
 *
 * @example
 * ```ts
 * import { createReleaseConfig } from "@dnbhq/release-config";
 * import type { Config } from "release-it";
 *
 * const config: Config = createReleaseConfig();
 *
 * export default config;
 * ```
 */
export function createReleaseConfig(options: ReleaseConfigOptions = {}): Config {
  const repositoryUrl = getRepositoryUrl(options.repository ?? {});
  const changelogScopes = createChangelogScopes(options.scopes ?? {});
  const changelogFile = options.changelogFile ?? "CHANGELOG.md";
  const githubTokenRef = options.githubTokenRef ?? "GITHUB_TOKEN_CONTENT_PRIVATE";

  const baseConfig: Config = {
    "$schema": "https://unpkg.com/release-it@20/schema/release-it.json",
    quiet: true, // don't print changelog
    hooks: {
      "before:git:release": [CITATION_CFF_HOOK]
    },
    npm: {
      publish: false
    },
    // https://github.com/release-it/release-it/blob/main/docs/git.md
    git: {
      requireBranch: "main",
      requireCleanWorkingDir: true,
      commit: true,
      commitMessage: "chore(release): v${version}",
      commitArgs: ["--no-verify"],
      tag: true,
      tagName: "v${version}",
      push: true,
      pushArgs: ["--follow-tags"]
    },
    // https://github.com/release-it/release-it/blob/main/docs/github-releases.md
    github: {
      release: true,
      releaseName: "v${version}",
      skipChecks: true,
      tokenRef: githubTokenRef,
      comments: {
        submit: true
      }
    },
    plugins: {
      "@release-it/conventional-changelog": {
        infile: changelogFile,
        preset: {
          name: "conventionalcommits",
          commitUrlFormat: `${repositoryUrl}/commit/{{hash}}`,
          compareUrlFormat: `${repositoryUrl}/compare/{{previousTag}}...{{currentTag}}`,
          issueUrlFormat: `${repositoryUrl}/issues/{{id}}`,
          userUrlFormat: "https://github.com/{{user}}",
          types: changelogScopes
        }
      }
    }
  };

  return mergeConfig(baseConfig, options.overrides ?? {});
}

/**
 * Build conventional changelog type configuration from project options.
 *
 * Minor exclusions allow commits such as `feat(fix): ...` to remain grouped in the changelog
 * without being configured as minor release triggers.
 *
 * @param options - Type and subscope settings.
 * @returns Conventional changelog type definitions.
 */
export function createChangelogScopes(options: ChangelogScopeOptions = {}): JsonObject[] {
  const minorTypes = options.minorTypes ?? DEFAULT_MINOR_TYPES;
  const patchTypes = options.patchTypes ?? DEFAULT_PATCH_TYPES;
  const minorExclusionSubscopes = options.minorExclusionSubscopes ?? DEFAULT_MINOR_EXCLUSION_SUBSCOPES;

  const types: JsonObject[] = [];

  for (const type of minorTypes) {
    const excludedSubscopes = minorExclusionSubscopes[type] ?? [];

    types.push({
      section: titleCase(type),
      type,
      hidden: false
    });

    for (const scope of excludedSubscopes) {
      types.push({
        section: titleCase(type),
        scope,
        type,
        hidden: false
      });
    }
  }

  for (const type of patchTypes) {
    if (minorTypes.includes(type)) {
      continue;
    }

    types.push({
      section: titleCase(type),
      type,
      hidden: false
    });
  }

  return types;
}

/**
 * Read and normalise the repository URL from package.json.
 *
 * @param options - Package lookup and fallback settings.
 * @returns A normalised GitHub repository URL without `.git` suffix.
 */
export function getRepositoryUrl(options: RepositoryOptions = {}): string {
  const packageJsonPath = options.packageJsonPath ?? join(process.cwd(), "package.json");

  if (!existsSync(packageJsonPath)) {
    return requireFallbackRepositoryUrl(options, `No package.json found at ${packageJsonPath}.`);
  }

  const parsed = parsePackageJson(packageJsonPath);
  const repository = parsed.repository;

  if (typeof repository === "string") {
    return normaliseRepositoryUrl(repository);
  }

  if (isJsonObject(repository) && typeof repository.url === "string") {
    return normaliseRepositoryUrl(repository.url);
  }

  return requireFallbackRepositoryUrl(options, `No repository URL found in ${packageJsonPath}.`);
}

function parsePackageJson(packageJsonPath: string): PackageJson {
  try {
    const content = readFileSync(packageJsonPath, "utf8");
    const parsed: unknown = JSON.parse(content);

    if (!isJsonObject(parsed)) {
      throw new TypeError(`Expected ${packageJsonPath} to contain a JSON object.`);
    }

    return parsed;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${packageJsonPath}: ${message}`);
  }
}

function requireFallbackRepositoryUrl(options: RepositoryOptions, reason: string): string {
  if (typeof options.fallbackUrl === "string" && options.fallbackUrl.length > 0) {
    return normaliseRepositoryUrl(options.fallbackUrl);
  }

  throw new Error(`${reason} Configure repository.fallbackUrl or add repository.url to package.json.`);
}

function normaliseRepositoryUrl(url: string): string {
  const withoutGitPrefix = url.replace(/^git\+/, "");
  const withoutGitSuffix = withoutGitPrefix.replace(/\.git$/, "");

  if (withoutGitSuffix.startsWith("git@github.com:")) {
    return withoutGitSuffix.replace(/^git@github\.com:/, "https://github.com/");
  }

  return withoutGitSuffix;
}

function mergeConfig(baseConfig: Config, overrides: Partial<Config>): Config {
  return {
    ...baseConfig,
    ...overrides,
    git: {
      ...baseConfig.git,
      ...overrides.git
    },
    github: {
      ...baseConfig.github,
      ...overrides.github
    },
    npm: {
      ...baseConfig.npm,
      ...overrides.npm
    },
    plugins: {
      ...baseConfig.plugins,
      ...overrides.plugins
    },
    hooks: mergeHooks(baseConfig.hooks ?? {}, overrides.hooks ?? {})
  };
}

function mergeHooks(base: Hooks, overrides: Hooks): Hooks {
  const result: Hooks = {};
  const allKeys = new Set([
    ...Object.keys(base) as HookKey[],
    ...Object.keys(overrides) as HookKey[]
  ]);

  for (const key of allKeys) {
    const toArr = (v: HookValue | undefined): string[] =>
      v === undefined ? [] : Array.isArray(v) ? v : [v];
    (result as Record<string, string[]>)[key as string] = [
      ...toArr(base[key]),
      ...toArr(overrides[key])
    ];
  }

  return result;
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const config = createReleaseConfig();

export default config;
