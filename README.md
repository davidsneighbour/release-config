# @dnbhq/release-config

Reusable `release-it` configuration for @davidsneighbour's projects.

The package provides a TypeScript config factory that keeps the usual release setup in one place while still allowing project-level overrides.

## What it configures

* `release-it` with npm publishing disabled by default.
* Releases only from the `main` branch and only from a clean working directory (see [Release branch](#release-branch) and [Clean working directory](#clean-working-directory)).
* Git release commits and tags in the format `chore(release): v${version}` and `v${version}`.
* GitHub releases using `GITHUB_TOKEN_CONTENT_PRIVATE` by default.
* Conventional changelog generation through `@release-it/conventional-changelog`.
* Changelog URLs generated from the consuming project's `package.json` `repository.url`, also for repository names with a dot (see [Repository names with a dot](#repository-names-with-a-dot)).
* Configurable conventional changelog types, scopes, and subscopes. They control the changelog sections and the release level (major, minor, or patch).
* A built-in `before:git:release` hook that updates `CITATION.cff` when that file exists (see [Built-in CITATION.cff hook](#built-in-citationcff-hook)).

## Configuration options

There are two ways to use this configuration:

| Option | Use it when | Install |
| --- | --- | --- |
| [Extend the defaults from GitHub](#extend-the-defaults-from-github) | You want the defaults 1:1 and no code in your project. | `release-it`, `@release-it/conventional-changelog` |
| [TypeScript config factory](#installation) | You want to change scopes, the token, the changelog file, hooks, or other settings. | `@dnbhq/release-config`, `release-it`, `@release-it/conventional-changelog` |

## Extend the defaults from gitHub

release-it can extend a configuration that lives in a GitHub repository. Use this for a 1:1 integration of the defaults of this package.

Install release-it and the changelog plugin:

```bash
npm install --save-dev release-it @release-it/conventional-changelog
```

Create `.release-it.json` in the consuming repository:

```json
{
  "$schema": "https://unpkg.com/release-it@21/schema/release-it.json",
  "extends": "github:davidsneighbour/release-config"
}
```

If you already have a release-it config (for example `.release-it.json` or the `release-it` key in `package.json`), add only the `extends` key:

```json
"extends": "github:davidsneighbour/release-config"
```

How it works:

* On each run, release-it downloads this repository into `node_modules/.c12/` and loads its root [`.release-it.ts`](.release-it.ts). That file calls `createReleaseConfig()` without options, so you get exactly the [default behaviour](#default-behaviour). Each run needs network access to GitHub.
* You do not need to install `@dnbhq/release-config` for this option.
* The repository URL for changelog links still comes from your project's `package.json` (see [Minimal setup](#minimal-setup)).
* Without a ref, release-it uses the latest commit on `main`. To pin a version, add a release tag: `github:davidsneighbour/release-config#vX.Y.Z`. Tags up to and including `v1.1.5` do not work with `extends`, because their `.release-it.ts` imports the built package, which is not in the repository.
* Settings in your own config are deep-merged on top of the defaults. Arrays are joined, with your entries first. For example, your `before:git:release` hooks run before the built-in [CITATION.cff hook](#built-in-citationcff-hook). This is the opposite order of `overrides.hooks` in the factory.
* You cannot remove a default by leaving it out. If you need more control, use the TypeScript config factory.

## Installation

Install the package together with its peer dependencies:

```bash
npm install --save-dev @dnbhq/release-config release-it @release-it/conventional-changelog
```

The package expects the consuming project to use ESM and a TypeScript release-it config.

## Minimal setup

Create `.release-it.ts` in the consuming repository:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig();

export default config;
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "release": "release-it",
    "release:dry": "release-it --dry-run"
  }
}
```

Make sure `package.json` contains repository information:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/dnbhq/example-package.git"
  }
}
```

The repository URL is normalised before it is passed to conventional changelog. These forms are supported:

```json
{
  "repository": "https://github.com/dnbhq/example-package.git"
}
```

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/dnbhq/example-package.git"
  }
}
```

```json
{
  "repository": {
    "type": "git",
    "url": "git@github.com:dnbhq/example-package.git"
  }
}
```

## Default behaviour

The default config is equivalent to this release-it setup:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  changelogFile: "CHANGELOG.md",
  githubTokenRef: "GITHUB_TOKEN_CONTENT_PRIVATE"
});

export default config;
```

Default release rules:

* `feat`, `prompt`, `instructions`, and `skill` create a minor release.
* `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`, `ci`, and `chore` create a patch release.
* `feat(fix)`, `prompt(fix)`, `instructions(fix)`, and `skill(fix)` create a patch release. They stay in the changelog section of their type.
* A breaking change creates a major release: `!` after the type or scope (`fix!:`, `feat(api)!:`), or a `BREAKING CHANGE:` footer.
* Other types do not change the release level. If no commit sets a level, release-it creates a patch release.

The package sets its own `whatBump` function on `@release-it/conventional-changelog` to apply these rules. The `conventionalcommits` preset alone creates a minor release only for `feat` commits.

## Release branch

By default, release-it stops with `Must be on branch main` when the current branch is not `main` (`git.requireBranch: "main"`).

If your main branch has a different name, set it through `overrides`:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  overrides: {
    git: {
      requireBranch: "master"
    }
  }
});

export default config;
```

With the [GitHub extends option](#extend-the-defaults-from-github), set it in `.release-it.json`:

```json
{
  "$schema": "https://unpkg.com/release-it@21/schema/release-it.json",
  "extends": "github:davidsneighbour/release-config",
  "git": {
    "requireBranch": "master"
  }
}
```

`requireBranch` also accepts an array of branch names or patterns, for example `["main", "release/*"]`. Use `false` to turn off the branch check.

## Clean working directory

By default, release-it stops with `Working dir must be clean` when there are uncommitted changes (`git.requireCleanWorkingDir: true`).

To turn off the check, set it through `overrides`:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  overrides: {
    git: {
      requireCleanWorkingDir: false
    }
  }
});

export default config;
```

With the [GitHub extends option](#extend-the-defaults-from-github), set it in `.release-it.json`:

```json
{
  "$schema": "https://unpkg.com/release-it@21/schema/release-it.json",
  "extends": "github:davidsneighbour/release-config",
  "git": {
    "requireCleanWorkingDir": false
  }
}
```

To skip the check for one run only, use the release-it flag:

```bash
npx release-it --no-git.requireCleanWorkingDir
```

## Show the full config

The package has a `release-config-print` command. It loads your release-it config the same way release-it does and prints the result as JSON: the release-it defaults, the `extends` source, and your local settings, merged. It does not release anything and does not change files.

Add a script to `package.json` in the consuming repository:

```json
{
  "scripts": {
    "release:config": "release-config-print"
  }
}
```

Then run:

```bash
npm run release:config
```

Without options, the command uses the same lookup as release-it (`.release-it.ts`, `.release-it.json`, the `release-it` key in `package.json`, and other release-it config files). For a config file in another place, use `--config`:

```json
{
  "scripts": {
    "release:config": "release-config-print --config config/release-it.ts"
  }
}
```

The command needs `@dnbhq/release-config` installed as a dev dependency. This is also true when you use the [GitHub extends option](#extend-the-defaults-from-github).

## Configure conventional changelog types and subscopes

Use `scopes.minorTypes` to define the commit types that should be treated as minor-level changelog groups:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  scopes: {
    minorTypes: ["feat", "prompt", "instructions", "skill"],
    minorExclusionSubscopes: {
      feat: ["fix"],
      prompt: ["fix"],
      instructions: ["fix"],
      skill: ["fix"]
    }
  }
});

export default config;
```

This keeps commits such as these visible in the changelog without letting the `fix` subscope act like a minor change:

```text
feat(fix): repair generated changelog link
prompt(fix): correct release note generation prompt
instructions(fix): repair repository setup instructions
skill(fix): fix package export instructions
```

### Allow a minor release only for some subscopes

Use `scopes.minorInclusionSubscopes` when only some subscopes of a type create a minor release. Commits of that type with another subscope or without a subscope create a patch release. Each type in `minorInclusionSubscopes` must also be in `minorTypes`, otherwise `createReleaseConfig` throws an error.

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  scopes: {
    minorTypes: ["feat", "content"],
    minorInclusionSubscopes: {
      content: ["new"]
    }
  }
});

export default config;
```

With this config:

```text
content(new): add page about boat tours   -> minor
content(fix): correct opening hours       -> patch
content: update photos                    -> patch
feat: add search                          -> minor
```

The subscope must match exactly. `minorExclusionSubscopes` is applied first, so a subscope in both lists creates a patch release.

## Configure patch-level groups

Use `scopes.patchTypes` when a project needs a narrower or broader changelog grouping:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  scopes: {
    patchTypes: ["fix", "docs", "ci", "chore"]
  }
});

export default config;
```

## Override release-it settings

Use `overrides` for project-specific release-it settings. The merge is shallow for the main `git`, `github`, `npm`, and `plugins` objects. If you set `overrides.plugins["@release-it/conventional-changelog"]`, it replaces the complete plugin config of this package, including the changelog file, the link context, and the `whatBump` function. Hooks are merged by concatenation — see [Built-in CITATION.cff hook](#built-in-citationcff-hook) for details.

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  overrides: {
    git: {
      requireCleanWorkingDir: true,
      commitMessage: "chore(release): v${version}",
      tagName: "v${version}"
    },
    github: {
      release: true,
      skipChecks: true
    }
  }
});

export default config;
```

## Built-in CITATION.Cff hook

Every config produced by `createReleaseConfig` includes a `before:git:release` hook that updates `CITATION.cff` if that file exists in the project root. When the file is absent the hook exits silently, so repositories without a `CITATION.cff` are unaffected.

The hook sets three fields (only if the line already exists in the file):

| Field | Updated to |
| --- | --- |
| `version` | `v<new-version>` |
| `date-released` | today's date in `yyyy-mm-dd` format |
| `commit` | the HEAD commit hash at the point the hook runs (the last real code commit, before the release-it bump commit) |

After updating the file the hook stages it with `git add CITATION.cff` so it is included in the release commit.

### Adding your own hooks

Pass additional hooks through `overrides.hooks`. The built-in CITATION.cff hook is always placed first in the array so it runs before any project-level hooks. All other entries from `overrides.hooks` are appended in the order you supply them:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  overrides: {
    hooks: {
      "before:git:release": ["node scripts/update-version-file.mjs"],
      "after:git:release": ["echo release tagged"]
    }
  }
});

export default config;
```

The resulting `before:git:release` array will be:

```json
[
  "<built-in CITATION.cff hook>",
  "node scripts/update-version-file.mjs"
]
```

Hook arrays for different lifecycle events (e.g. `after:git:release`) are carried through as-is without any built-in entries from this package.

## Update the version in other files

The built-in hook updates only `CITATION.cff`. To write the new version into other files, use the [`@release-it/bumper`](https://github.com/release-it/bumper) plugin. It supports JSON, YAML, TOML, INI, XML, HTML, and text files, and it can set a version at a path such as `metadata.version`.

```bash
npm install --save-dev @release-it/bumper
```

Add the plugin through `overrides.plugins`. The other plugins of this package stay in place:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  overrides: {
    plugins: {
      "@release-it/bumper": {
        out: [
          { file: "manifest.json", path: "version" },
          { file: "src/version.ts", type: "text/plain" }
        ]
      }
    }
  }
});

export default config;
```

For text files, the plugin replaces each occurrence of the current version with the new version. If the current version is not in the file, the file does not change. Make sure that the version string does not occur in the file for other reasons, for example as a dependency version.

With the [GitHub extends option](#extend-the-defaults-from-github), add the same `plugins` key to `.release-it.json`.

## Repository names with a dot

`@release-it/conventional-changelog` reads the repository from the git remote. Its URL parser cuts the part after the last dot from the repository name, for example `kollitsch.dev` becomes `kollitsch` ([release-it/conventional-changelog#153](https://github.com/release-it/conventional-changelog/issues/153), [TrigenSoftware/simple-libs#51](https://github.com/TrigenSoftware/simple-libs/issues/51)). The changelog and GitHub release links then point to a repository that does not exist.

To prevent this, the package sets `host`, `owner`, `repository`, and `repoUrl` in the plugin's `context` from the `package.json` repository URL. These values have priority over the values from the git remote. You do not need a project-level workaround. If your `.release-it.ts` sets `context` or the `*UrlFormat` preset options after `createReleaseConfig()` for this reason, you can remove that code.

## Repository URL fallback

In unusual repositories where `package.json` does not contain a `repository` field, pass a fallback URL explicitly:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  repository: {
    fallbackUrl: "https://github.com/dnbhq/example-package"
  }
});

export default config;
```

## Custom package.Json path

By default, the config reads `package.json` from `process.cwd()`. For unusual repository layouts, pass an explicit path:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  repository: {
    packageJsonPath: "./packages/example/package.json",
    fallbackUrl: "https://github.com/dnbhq/example-package"
  }
});

export default config;
```

## Build and test this package

```bash
npm install
npm run build
npm test
```

`npm test` runs the TypeScript build and then the test suite with Node's built-in test runner.

## Node version policy

This package follows the *latest active release* policy for libraries. The policy is set in [`.github/node-version-policy.json`](.github/node-version-policy.json). The active Node.js release lines come from the [official Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).

* `engines.node` in `package.json` covers every active release line: all active LTS lines and the Current line. The minimum patch versions come from the `engines` of `release-it` and `@release-it/conventional-changelog`.
* The publish workflow uses the newest active release line.
* The "Test" workflow tests every active release line.

Check the declarations locally:

```bash
node scripts/check-node-version-policy.ts --check
```

Update the declarations that can be fixed automatically:

```bash
node scripts/check-node-version-policy.ts --write
```

The `--write` option keeps the minimum patch version of release lines that stay supported and adds `^<major>.0.0` for new release lines. Use `--help` for all options.

The workflow [`.github/workflows/check-node-version-policy.yml`](.github/workflows/check-node-version-policy.yml) runs this check every Monday at 03:17 UTC and can also be started manually. When a declaration is stale, the run fails, and the job summary lists each file with its current and expected value. Findings marked "manual" need a manual fix, for example `npm@latest` installations or an `engines.npm` range that excludes the npm version bundled with a supported Node.js release.

## Test in another repository before publishing

From this package directory:

```bash
npm pack
```

Then install the generated tarball in another repository:

```bash
npm install --save-dev ../release-config/dnbhq-release-config-0.1.0.tgz
```

Create or update `.release-it.ts` in that repository:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig();

export default config;
```

Run a dry release:

```bash
npx release-it --dry-run
```

Check that:

* the changelog links point to the repository defined in that project's `package.json`;
* `feat`, `prompt`, `instructions`, and `skill` are grouped as expected;
* `feat(fix)`, `prompt(fix)`, `instructions(fix)`, and `skill(fix)` do not behave like normal minor scopes;
* GitHub release settings use the intended token reference.

## Suggested consumer configuration

For most projects, keep `.release-it.ts` small and project-specific only where necessary:

```ts
import { createReleaseConfig } from "@dnbhq/release-config";
import type { Config } from "release-it";

const config: Config = createReleaseConfig({
  scopes: {
    minorTypes: ["feat", "prompt", "instructions", "skill"],
    minorExclusionSubscopes: {
      feat: ["fix"],
      prompt: ["fix"],
      instructions: ["fix"],
      skill: ["fix"]
    }
  }
});

export default config;
```
