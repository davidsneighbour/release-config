import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseConfig, createWhatBump, getRepositoryContext } from './index.ts';
import type { BumpCommit } from './index.ts';

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

describe('getRepositoryContext', () => {
  test('keeps a dot in the repository name', () => {
    assert.deepEqual(getRepositoryContext('https://github.com/davidsneighbour/kollitsch.dev'), {
      host: 'https://github.com',
      owner: 'davidsneighbour',
      repository: 'kollitsch.dev',
      repoUrl: 'https://github.com/davidsneighbour/kollitsch.dev'
    });
  });

  test('keeps nested groups in the owner', () => {
    const context = getRepositoryContext('https://gitlab.com/group/subgroup/project');

    assert.equal(context.owner, 'group/subgroup');
    assert.equal(context.repository, 'project');
  });

  test('sets only repoUrl when the URL has no owner and name', () => {
    assert.deepEqual(getRepositoryContext('not a url'), { repoUrl: 'not a url' });
    assert.deepEqual(getRepositoryContext('https://github.com/project'), { repoUrl: 'https://github.com/project' });
  });
});

describe('createReleaseConfig – changelog context', () => {
  test('sets the writer context from package.json', () => {
    const config = createReleaseConfig({
      repository: { packageJsonPath: '/nonexistent/package.json', fallbackUrl: 'git@github.com:davidsneighbour/samui-samui.de.git' }
    });
    const plugin = config.plugins?.['@release-it/conventional-changelog'];

    assert.deepEqual(plugin?.['context'], {
      host: 'https://github.com',
      owner: 'davidsneighbour',
      repository: 'samui-samui.de',
      repoUrl: 'https://github.com/davidsneighbour/samui-samui.de'
    });
  });

  test('sets the whatBump function', () => {
    const config = createReleaseConfig();
    const plugin = config.plugins?.['@release-it/conventional-changelog'];

    assert.equal(typeof plugin?.['whatBump'], 'function');
  });
});

function commit(header: string, notes: string[] = []): BumpCommit {
  const match = /^(\w+)(?:\(([^)]*)\))?!?: /u.exec(header);

  return {
    header,
    type: match?.[1] ?? null,
    scope: match?.[2] ?? null,
    notes: notes.map((title) => ({ title }))
  };
}

describe('createWhatBump', () => {
  test('creates a minor release for every default minor type', () => {
    const whatBump = createWhatBump();

    for (const type of ['feat', 'prompt', 'instructions', 'skill']) {
      assert.equal(whatBump([commit(`${type}: add something`)])?.level, 1, type);
    }
  });

  test('creates a patch release for default minor types with the fix subscope', () => {
    const whatBump = createWhatBump();

    assert.equal(whatBump([commit('feat(fix): repair something')])?.level, 2);
    assert.equal(whatBump([commit('prompt(fix): repair something')])?.level, 2);
  });

  test('creates a patch release for patch types', () => {
    assert.equal(createWhatBump()([commit('docs: update readme')])?.level, 2);
  });

  test('creates no release for types that are not configured', () => {
    assert.equal(createWhatBump()([commit('wip: something')]), null);
    assert.equal(createWhatBump()([]), null);
  });

  test('creates a major release for a breaking change in the header or a footer', () => {
    const whatBump = createWhatBump();

    assert.equal(whatBump([commit('fix!: drop old option')])?.level, 0);
    assert.equal(whatBump([commit('docs(api)!: drop old option')])?.level, 0);
    assert.equal(whatBump([commit('fix: drop old option', ['BREAKING CHANGE'])])?.level, 0);
    assert.equal(whatBump([commit('fix: drop old option', ['breaking-change'])])?.level, 0);
  });

  test('ignores footers that are not breaking changes', () => {
    assert.equal(createWhatBump()([commit('fix: something', ['Refs'])])?.level, 2);
  });

  test('uses the highest level of all commits', () => {
    const result = createWhatBump()([commit('fix: a'), commit('feat: b'), commit('docs: c')]);

    assert.equal(result?.level, 1);
    assert.equal(result?.reason, 'There are 0 breaking, 1 minor, and 2 patch changes');
  });

  test('creates a minor release for a custom minor type', () => {
    const whatBump = createWhatBump({ minorTypes: ['feat', 'content'] });

    assert.equal(whatBump([commit('content: add page')])?.level, 1);
    assert.equal(whatBump([commit('content(blog): add post')])?.level, 1);
  });

  test('creates a minor release only for included subscopes', () => {
    const whatBump = createWhatBump({
      minorTypes: ['feat', 'content'],
      minorInclusionSubscopes: { content: ['new'] }
    });

    assert.equal(whatBump([commit('content(new): add page')])?.level, 1);
    assert.equal(whatBump([commit('content(fix): repair page')])?.level, 2);
    assert.equal(whatBump([commit('content: update page')])?.level, 2);
    assert.equal(whatBump([commit('feat: add search')])?.level, 1);
  });

  test('rejects included subscopes for a type that is not a minor type', () => {
    assert.throws(
      () => createWhatBump({ minorTypes: ['feat'], minorInclusionSubscopes: { content: ['new'] } }),
      /"content", which is not in scopes.minorTypes/u
    );
  });
});
