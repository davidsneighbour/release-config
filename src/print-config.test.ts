import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = join(import.meta.dirname, '..');
const script = join(projectRoot, 'dist', 'print-config.js');

describe('release-config-print', () => {
  test('prints the resolved release-it config as JSON', async () => {
    const { stdout } = await execFileAsync('node', [script, '--config', '.release-it.ts'], { cwd: projectRoot });
    const config = JSON.parse(stdout) as { git: Record<string, unknown>; npm: Record<string, unknown> };

    assert.equal(config.git['requireBranch'], 'main');
    assert.equal(config.git['requireCleanWorkingDir'], true);
    // A release-it default that this package does not set, to show the defaults are included.
    assert.equal(config.git['requireUpstream'], true);
    assert.equal(config.npm['publish'], false);
  });

  test('prints usage with --help', async () => {
    const { stdout } = await execFileAsync('node', [script, '--help'], { cwd: projectRoot });

    assert.match(stdout, /^Usage:/);
  });

  test('fails with a non-zero exit code for an unknown option', async () => {
    await assert.rejects(
      execFileAsync('node', [script, '--unknown'], { cwd: projectRoot }),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 1
    );
  });
});
