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
