# Changelog

## [2.0.0](https://github.com/davidsneighbour/release-config/compare/v1.1.5...v2.0.0) (2026-10-01)

### ⚠ BREAKING CHANGES

* release-it now stops with "Must be on branch main" when
  a release runs on any other branch. Projects that release from another
  branch must set overrides.git.requireBranch (or git.requireBranch when
  they extend the config from GitHub).

### Feat

* add release-config-print command to show the full config ([f7f179d](https://github.com/davidsneighbour/release-config/commit/f7f179d846084116ed3ef67bb3e8bc46e90f3557))
* apply scopes to the release level and keep dots in repo names ([284933a](https://github.com/davidsneighbour/release-config/commit/284933a87c880c1e0f334f78ccff34d5969d75c7))
* require the main branch for releases ([df440d0](https://github.com/davidsneighbour/release-config/commit/df440d008ce0432e75522dd48783cebb612de70d))
* show functions in the release-config-print output ([8e58899](https://github.com/davidsneighbour/release-config/commit/8e5889909e492aa5e13639b0e99718d5b4f97b24))

### Fix

* allow extending the config from GitHub ([a45087d](https://github.com/davidsneighbour/release-config/commit/a45087ddcdde663cc6420d16befd634fc1436ec8))
* point repository URLs to davidsneighbour/release-config ([52210e8](https://github.com/davidsneighbour/release-config/commit/52210e8ce96db40f6a8a6b701f7fc5b47dad7ee0))
* remove the engines.npm requirement ([e53bbf3](https://github.com/davidsneighbour/release-config/commit/e53bbf37944aaac06028750eee150e0a1e64133a))

### Docs

* add CITATION.cff ([8ba29d1](https://github.com/davidsneighbour/release-config/commit/8ba29d1687d69057c6b73284b855b5d5d6bea83b))
* fix markdownlint findings in README.md ([888bdf0](https://github.com/davidsneighbour/release-config/commit/888bdf027092bfaa2fb1bd9861ae9463b14960a6))

### Build

* add @dnbhq/markdownlint-config and markdown lint scripts ([b4ad711](https://github.com/davidsneighbour/release-config/commit/b4ad7117054287c405e1097b196ba5dc7a6afb02))

### Ci

* add a weekly Node.js version policy check ([a09cb82](https://github.com/davidsneighbour/release-config/commit/a09cb82c30d1ad14668f92f6cb5326ed35ecf47e))

## [1.1.5](https://github.com/davidsneighbour/release-config/compare/v1.1.4...v1.1.5) (2026-10-01)

### Build

* **fix:** remove dnbhq config and add release:force ([a5a0905](https://github.com/davidsneighbour/release-config/commit/a5a090502695ea12f36f193554dc92d01ec0e3fe))

## [1.1.4](https://github.com/dnbhq/release-config/compare/v1.1.3...v1.1.4) (2026-10-01)

### Fix

* update dependencies and override undici requirements ([300e585](https://github.com/dnbhq/release-config/commit/300e585702dca0454d62d6f4aecd3dd6d62420e2))

## [1.1.3](https://github.com/dnbhq/release-config/compare/v1.1.2...v1.1.3) (2026-07-27)

### Fix

* **ci:** resolve zizmor findings and pin actions to hashes ([54f705f](https://github.com/dnbhq/release-config/commit/54f705f70e50889cf580e5d5c9654a6f0fbdf5c4))

## [1.1.2](https://github.com/dnbhq/release-config/compare/v1.1.1...v1.1.2) (2026-07-27)

### Fix

* node 25 is eol ([3bef38c](https://github.com/dnbhq/release-config/commit/3bef38c1d75e9d30fc0b30192ae6423360689446))

### Build

* **deps:** update dependencies ([bcdefe7](https://github.com/dnbhq/release-config/commit/bcdefe7529507ead52744e32b9682321b833d8f0))

## [1.1.1](https://github.com/dnbhq/release-config/compare/v1.1.0...v1.1.1) (2026-07-27)

### Fix

* widen peerDependency ranges for release-it@21 and conventional-changelog@12 ([ed1b4d6](https://github.com/dnbhq/release-config/commit/ed1b4d65a3672e394a45d53586ac72f0201a1480))

## [1.1.0](https://github.com/dnbhq/release-config/compare/v1.0.2...v1.1.0) (2026-06-16)

### Feat

* add built-in CITATION.cff hook to createReleaseConfig ([8fb6beb](https://github.com/dnbhq/release-config/commit/8fb6beb54e558560789e5d3ccd5db028cf799380))

### Docs

* document built-in CITATION.cff hook and hook extension ([b725524](https://github.com/dnbhq/release-config/commit/b72552436cad6decf456eeef865fa439f42f69df))

### Test

* add test suite for CITATION.cff hook and hook merging ([3ea2e85](https://github.com/dnbhq/release-config/commit/3ea2e85cd384b5cf42b31639c884b9d8dc4748a0))

## [1.0.2](https://github.com/dnbhq/release-config/compare/v1.0.1...v1.0.2) (2026-06-13)

### Fix

* override noEmit so tsc actually emits dist/ on publish ([335506b](https://github.com/dnbhq/release-config/commit/335506b13e415f30ef124c959586d99cbbfa560a))

## [1.0.1](https://github.com/dnbhq/release-config/compare/v1.0.0...v1.0.1) (2026-06-12)

### Fix

* ensure dist is built and included in published npm package ([5780e67](https://github.com/dnbhq/release-config/commit/5780e67b52f77ffbeb7d1fa4a624a561b457a961))

## [1.0.0](https://github.com/dnbhq/release-config/compare/v0.2.1...v1.0.0) (2026-06-10)

### Fix

* add comments and silence changes ([a134b31](https://github.com/dnbhq/release-config/commit/a134b31e2e328ebe10f264cdb3b6924e32aa2396))

## [0.2.1](https://github.com/dnbhq/release-config/compare/v0.2.0...v0.2.1) (2026-06-10)

### Build

* add release process ([e7ea42a](https://github.com/dnbhq/release-config/commit/e7ea42aad8a8be85f0a3368e266f5b25dc83cb40))

## 0.2.0 (2026-06-10)

### Feat

* initial setup ([ae53c5c](https://github.com/dnbhq/release-config/commit/ae53c5c994d6c6c34af90ac86cf85dbeeedc14b6))

### Ci

* add release workflow ([d7d58b7](https://github.com/dnbhq/release-config/commit/d7d58b7926065ca5a31daeaa919f0d4e07cf8228))

### Chore

* initial commit, adding LICENSE.md ([233e550](https://github.com/dnbhq/release-config/commit/233e550c99c993fa58ccff1ef3687c97c0875104))
