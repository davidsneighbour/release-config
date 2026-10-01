#!/usr/bin/env node

import { basename } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

interface ReleaseItConfigLoader {
  init(): Promise<void>;
  getContext(): Record<string, unknown>;
}

type ReleaseItConfigConstructor = new (options: Record<string, unknown>) => ReleaseItConfigLoader;

const SCRIPT_NAME = basename(process.argv[1] ?? 'release-config-print');

function usage(): string {
  return `
Usage:
  ${SCRIPT_NAME} [--config <path>] [--help]

Prints the full release-it configuration as JSON: the release-it defaults,
any "extends" source, and the local configuration, merged the same way
release-it merges them. Nothing is released and no files are changed.

Options:
  -c, --config <path>  Path to the release-it configuration file.
                       Default: release-it's own lookup (.release-it.*, package.json)
  -h, --help           Show this help.
`.trim();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c' },
      help: { type: 'boolean', short: 'h' }
    }
  });

  if (values.help === true) {
    console.log(usage());
    return;
  }

  // release-it exports its Config class at runtime, but not in its type declarations.
  const releaseIt = (await import('release-it')) as unknown as { Config: ReleaseItConfigConstructor };
  const config = new releaseIt.Config(values.config === undefined ? {} : { config: values.config });

  await config.init();
  console.log(JSON.stringify(config.getContext(), showFunctions, 2));
}

// JSON.stringify drops functions such as the plugin's whatBump. Show them by name instead.
function showFunctions(_key: string, value: unknown): unknown {
  return typeof value === 'function' ? `[Function ${value.name || 'anonymous'}]` : value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${SCRIPT_NAME}: ${message}`);
  process.exitCode = 1;
});
