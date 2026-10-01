import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseConfig } from './index.ts';

const CITATION_HOOK_MARKER = 'CITATION.cff';

describe('createReleaseConfig – CITATION.cff hook', () => {
  test('includes the built-in hook in before:git:release', () => {
    const config = createReleaseConfig({ scopes: { minorTypes: ['feat'] } });
    const hooks = config.hooks as Record<string, string[]>;

    assert.ok(hooks, 'config should have hooks');
    assert.ok(Array.isArray(hooks['before:git:release']), 'before:git:release should be an array');
    assert.ok(
      hooks['before:git:release'][0].includes(CITATION_HOOK_MARKER),
      'first hook should be the CITATION.cff hook'
    );
  });

  test('contains only the built-in hook when no overrides are passed', () => {
    const config = createReleaseConfig();
    const hooks = config.hooks as Record<string, string[]>;

    assert.equal(hooks['before:git:release'].length, 1);
    assert.ok(hooks['before:git:release'][0].includes(CITATION_HOOK_MARKER));
  });

  test('prepends built-in hook before caller-supplied hooks', () => {
    const config = createReleaseConfig({
      overrides: {
        hooks: { 'before:git:release': ['echo starting release'] }
      }
    });
    const hooks = config.hooks as Record<string, string[]>;

    assert.equal(hooks['before:git:release'].length, 2);
    assert.ok(hooks['before:git:release'][0].includes(CITATION_HOOK_MARKER));
    assert.equal(hooks['before:git:release'][1], 'echo starting release');
  });

  test('preserves caller hooks for other hook keys', () => {
    const config = createReleaseConfig({
      overrides: {
        hooks: { 'after:git:release': ['echo done'] }
      }
    });
    const hooks = config.hooks as Record<string, string[]>;

    assert.deepEqual(hooks['after:git:release'], ['echo done']);
  });
});

describe('createReleaseConfig – git requirements', () => {
  test('requires the main branch by default', () => {
    const config = createReleaseConfig();

    assert.equal(config.git?.requireBranch, 'main');
  });

  test('allows a different release branch through overrides', () => {
    const config = createReleaseConfig({
      overrides: {
        git: { requireBranch: 'develop' }
      }
    });

    assert.equal(config.git?.requireBranch, 'develop');
  });

  test('allows disabling the branch check through overrides', () => {
    const config = createReleaseConfig({
      overrides: {
        git: { requireBranch: false }
      }
    });

    assert.equal(config.git?.requireBranch, false);
  });

  test('requires a clean working directory by default', () => {
    const config = createReleaseConfig();

    assert.equal(config.git?.requireCleanWorkingDir, true);
  });

  test('allows disabling the clean working directory check through overrides', () => {
    const config = createReleaseConfig({
      overrides: {
        git: { requireCleanWorkingDir: false }
      }
    });

    assert.equal(config.git?.requireCleanWorkingDir, false);
  });

  test('keeps the other git defaults when one git setting is overridden', () => {
    const config = createReleaseConfig({
      overrides: {
        git: { requireBranch: 'develop' }
      }
    });

    assert.equal(config.git?.requireCleanWorkingDir, true);
    assert.equal(config.git?.tagName, 'v${version}');
  });
});
