Reusable `release-it` configuration for @davidsneighbour's projects.

The package provides a TypeScript config factory that keeps the usual release setup in one place while still allowing project-level overrides.

## What it configures

* `release-it` with npm publishing disabled by default.
* Releases only from the `main` branch and only from a clean working directory (see [Release branch](#release-branch) and [Clean working directory](#clean-working-directory)).
* Git release commits and tags in the format `chore(release): v${version}` and `v${version}`.
* GitHub releases using `GITHUB_TOKEN_CONTENT_PRIVATE` by default.
* Conventional changelog generation through `@release-it/conventional-changelog`.
* Changelog URLs generated from the consuming project's `package.json` `repository.url`.
* Configurable conventional changelog types, scopes, and subscopes.
* A built-in `before:git:release` hook that updates `CITATION.cff` when that file exists (see [Built-in CITATION.cff hook](#built-in-citationcff-hook)).

## Configuration options

There are two ways to use this configuration:

| Option | Use it when | Install |
|---|---|---|
| [Extend the defaults from GitHub](#extend-the-defaults-from-github) | You want the defaults 1:1 and no code in your project. | `release-it`, `@release-it/conventional-changelog` |
| [TypeScript config factory](#installation) | You want to change scopes, the token, the changelog file, hooks, or other settings. | `@dnbhq/release-config`, `release-it`, `@release-it/conventional-changelog` |

## Extend the defaults from GitHub

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

* `feat`, `prompt`, `instructions`, and `skill` are configured as minor-level groups.
* `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `build`, `ci`, and `chore` are configured as patch-level groups.
* The subscopes `feat(fix)`, `prompt(fix)`, `instructions(fix)`, and `skill(fix)` are explicitly listed as changelog entries but excluded from the minor-type set.

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

Use `overrides` for project-specific release-it settings. The merge is shallow for the main `git`, `github`, `npm`, and `plugins` objects. Hooks are merged by concatenation — see [Built-in CITATION.cff hook](#built-in-citationcff-hook) for details.

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

## Built-in CITATION.cff hook

Every config produced by `createReleaseConfig` includes a `before:git:release` hook that updates `CITATION.cff` if that file exists in the project root. When the file is absent the hook exits silently, so repositories without a `CITATION.cff` are unaffected.

The hook sets three fields (only if the line already exists in the file):

| Field | Updated to |
|---|---|
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

```
[
  "<built-in CITATION.cff hook>",
  "node scripts/update-version-file.mjs"
]
```

Hook arrays for different lifecycle events (e.g. `after:git:release`) are carried through as-is without any built-in entries from this package.

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

## Custom package.json path

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

