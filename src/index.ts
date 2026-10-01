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

  /**
   * Subscopes that a minor type needs to create a minor release. Commits of that type with
   * another subscope or without a subscope create a patch release. Each key must be in `minorTypes`.
   *
   * @example { content: ["new"] }
   */
  minorInclusionSubscopes?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The parts of a parsed conventional commit that the release level depends on.
 */
export interface BumpCommit {
  type?: string | null;
  scope?: string | null;
  header?: string | null;
  notes?: readonly { title?: string | null }[];
}

/**
 * Release level recommendation: 0 is major, 1 is minor, and 2 is patch.
 */
export interface BumpRecommendation {
  level: 0 | 1 | 2;
  reason: string;
}

export type WhatBump = (commits: readonly BumpCommit[]) => BumpRecommendation | null;

/**
 * Repository values for the conventional changelog writer context.
 */
export interface RepositoryContext {
  host?: string;
  owner?: string;
  repository?: string;
  repoUrl: string;
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
const BREAKING_HEADER_PATTERN = /^(\w*)(?:\((.*)\))?!: (.*)$/u;
const BREAKING_NOTE_TITLES = ["BREAKING CHANGE", "BREAKING-CHANGE"];

type ResolvedScopeOptions = Required<ChangelogScopeOptions>;

/**
 * Create a reusable release-it configuration.
 *
 * The generated config reads the repository URL from the consuming project's package.json
 * and uses it for conventional changelog commit, compare, issue, and user links. The release
 * level comes from the configured scopes (see {@link createWhatBump}).
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
  const whatBump = createWhatBump(options.scopes ?? {});
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
        // conventional-changelog derives these values from the git remote when they are not set,
        // and its URL parser cuts repository names with a dot (`kollitsch.dev` -> `kollitsch`).
        // https://github.com/TrigenSoftware/simple-libs/issues/51
        context: getRepositoryContext(repositoryUrl),
        whatBump,
        // The *UrlFormat keys are read by conventional-changelog-conventionalcommits 9.x
        // (@release-it/conventional-changelog 11.x). Version 10.x builds the URLs from `context`.
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
  const { minorTypes, patchTypes, minorExclusionSubscopes } = resolveScopeOptions(options);

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
 * Build the `whatBump` function that selects the release level from the commits since the last release.
 *
 * The conventional commits preset only creates a minor release for `feat` commits. This function
 * uses the configured scopes instead:
 *
 * - A breaking change (`!` after the type or scope, or a `BREAKING CHANGE` footer) creates a major release.
 * - A commit of a type in `minorTypes` creates a minor release, unless its subscope is in
 *   `minorExclusionSubscopes`, or the type has `minorInclusionSubscopes` that do not contain its subscope.
 * - All other commits of a type in `minorTypes` or `patchTypes` create a patch release.
 * - Commits of other types do not change the release level.
 *
 * @param options - Type and subscope settings.
 * @returns A `whatBump` function for `@release-it/conventional-changelog`.
 */
export function createWhatBump(options: ChangelogScopeOptions = {}): WhatBump {
  const resolved = resolveScopeOptions(options);

  return function whatBump(commits) {
    let level: BumpRecommendation["level"] | null = null;
    const counts: [number, number, number] = [0, 0, 0];

    for (const commit of commits) {
      const commitLevel = getCommitLevel(commit, resolved);

      if (commitLevel === null) {
        continue;
      }

      counts[commitLevel] += 1;

      if (level === null || commitLevel < level) {
        level = commitLevel;
      }
    }

    if (level === null) {
      return null;
    }

    const [breaking, minor, patch] = counts;

    return {
      level,
      reason: `There are ${breaking} breaking, ${minor} minor, and ${patch} patch changes`
    };
  };
}

function getCommitLevel(commit: BumpCommit, options: ResolvedScopeOptions): BumpRecommendation["level"] | null {
  if (isBreakingCommit(commit)) {
    return 0;
  }

  const type = (commit.type ?? "").toLowerCase();
  const scope = commit.scope ?? undefined;

  if (options.minorTypes.includes(type)) {
    return isMinorScope(type, scope, options) ? 1 : 2;
  }

  return options.patchTypes.includes(type) ? 2 : null;
}

function isMinorScope(type: string, scope: string | undefined, options: ResolvedScopeOptions): boolean {
  if (scope !== undefined && options.minorExclusionSubscopes[type]?.includes(scope) === true) {
    return false;
  }

  const inclusions = options.minorInclusionSubscopes[type];

  return inclusions === undefined || (scope !== undefined && inclusions.includes(scope));
}

function isBreakingCommit(commit: BumpCommit): boolean {
  const hasBreakingNote = (commit.notes ?? []).some((note) =>
    BREAKING_NOTE_TITLES.includes((note.title ?? "").toUpperCase())
  );

  return hasBreakingNote || BREAKING_HEADER_PATTERN.test(commit.header ?? "");
}

function resolveScopeOptions(options: ChangelogScopeOptions): ResolvedScopeOptions {
  const resolved: ResolvedScopeOptions = {
    minorTypes: options.minorTypes ?? DEFAULT_MINOR_TYPES,
    patchTypes: options.patchTypes ?? DEFAULT_PATCH_TYPES,
    minorExclusionSubscopes: options.minorExclusionSubscopes ?? DEFAULT_MINOR_EXCLUSION_SUBSCOPES,
    minorInclusionSubscopes: options.minorInclusionSubscopes ?? {}
  };

  for (const type of Object.keys(resolved.minorInclusionSubscopes)) {
    if (!resolved.minorTypes.includes(type)) {
      throw new Error(`scopes.minorInclusionSubscopes contains "${type}", which is not in scopes.minorTypes.`);
    }
  }

  return resolved;
}

/**
 * Split a normalised repository URL into the values of the conventional changelog writer context.
 *
 * @param repositoryUrl - Repository URL as returned by {@link getRepositoryUrl}.
 * @returns The host, owner, repository name, and URL. Only `repoUrl` is set when the URL has no owner and name.
 */
export function getRepositoryContext(repositoryUrl: string): RepositoryContext {
  if (!URL.canParse(repositoryUrl)) {
    return { repoUrl: repositoryUrl };
  }

  const url = new URL(repositoryUrl);
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const repository = segments.pop();

  if (repository === undefined || segments.length === 0) {
    return { repoUrl: repositoryUrl };
  }

  return {
    host: url.origin,
    owner: segments.join("/"),
    repository,
    repoUrl: repositoryUrl
  };
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
