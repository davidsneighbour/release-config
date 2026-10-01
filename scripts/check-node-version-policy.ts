#!/usr/bin/env node

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

type Policy = 'lts' | 'active-latest';
type PackageType = 'application' | 'library';
type LineStatus = 'current' | 'active-lts' | 'maintenance';
type Version = [number, number, number];

interface PolicyConfig {
  policy: Policy;
  packageType: PackageType;
  includeAllActiveLts: boolean;
  includeCurrentForLibraries: boolean;
}

interface ReleaseLine {
  major: number;
  status: LineStatus;
  isLts: boolean;
  start: string;
  lts: string | null;
  maintenance: string | null;
  end: string;
}

interface Expectation {
  today: string;
  primary: ReleaseLine;
  supported: number[];
  lines: ReleaseLine[];
}

interface Finding {
  file: string;
  line: number | null;
  subject: string;
  current: string;
  expected: string;
  fixable: boolean;
}

interface CheckResult {
  findings: Finding[];
  // The new file content when the file has fixable findings, otherwise null.
  updated: string | null;
}

interface Options {
  mode: 'check' | 'write';
  format: 'text' | 'json';
  verbose: boolean;
  today: string;
  scheduleFile: string | undefined;
}

interface DistRelease {
  version: string;
  npm?: string;
}

interface RangePart {
  text: string;
  majors: number[];
}

class UsageError extends Error {}

const SCRIPT_NAME = basename(process.argv[1] ?? 'check-node-version-policy.ts');
const ROOT = process.cwd();
const POLICY_FILE = '.github/node-version-policy.json';
const SCHEDULE_URL = 'https://raw.githubusercontent.com/nodejs/Release/main/schedule.json';
const DIST_INDEX_URL = 'https://nodejs.org/dist/index.json';
const FETCH_TIMEOUT_MS = 30_000;
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cache']);
const STATUS_LABELS: Record<LineStatus, string> = {
  'current': 'Current',
  'active-lts': 'Active LTS',
  'maintenance': 'Maintenance'
};

function usage(): string {
  return `
Usage:
  ${SCRIPT_NAME} [--check | --write] [--format=<text|json>] [--verbose]
  ${SCRIPT_NAME} [--today=<YYYY-MM-DD>] [--schedule-file=<path>]
  ${SCRIPT_NAME} --help

Compares the Node.js and npm declarations of this repository with the
official Node.js release schedule and ${POLICY_FILE}.

Options:
  --check                 Report stale declarations without changing files (default).
                          Exit code 0: current, 1: stale, 2: error.
  --write                 Update the declarations that can be fixed automatically.
                          Exit code 1 when findings remain that need a manual fix.
  --format=<text|json>    Output format. Default: text.
  --verbose               Show the lifecycle table, inspected files, and skipped values.
  --today=<YYYY-MM-DD>    Evaluate the schedule for this UTC date. Default: today.
  --schedule-file=<path>  Read the release schedule from a local file instead of
                          ${SCHEDULE_URL}
  -h, --help              Show this help.
`.trim();
}

function parseOptions(argv: string[]): Options | null {
  const { values } = parseArgs({
    args: argv,
    options: {
      'check': { type: 'boolean' },
      'write': { type: 'boolean' },
      'format': { type: 'string' },
      'verbose': { type: 'boolean' },
      'today': { type: 'string' },
      'schedule-file': { type: 'string' },
      'help': { type: 'boolean', short: 'h' }
    }
  });

  if (values.help === true) {
    return null;
  }

  if (values.check === true && values.write === true) {
    throw new UsageError('Use either --check or --write, not both.');
  }

  const format = values.format ?? 'text';

  if (format !== 'text' && format !== 'json') {
    throw new UsageError(`--format must be "text" or "json", not "${format}".`);
  }

  const today = values.today ?? new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today)) {
    throw new UsageError(`--today must be a date in the format YYYY-MM-DD, not "${today}".`);
  }

  return {
    mode: values.write === true ? 'write' : 'check',
    format,
    verbose: values.verbose === true,
    today,
    scheduleFile: values['schedule-file']
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readText(file: string): string {
  return readFileSync(resolve(ROOT, file), 'utf8');
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readText(file));
  } catch (error: unknown) {
    throw new Error(`Could not read ${file}: ${errorMessage(error)}`);
  }
}

function readPolicy(): PolicyConfig {
  if (!existsSync(join(ROOT, POLICY_FILE))) {
    throw new Error(`${POLICY_FILE} not found. Create it to select the Node.js version policy.`);
  }

  const raw = readJson(POLICY_FILE);

  if (!isRecord(raw)) {
    throw new Error(`${POLICY_FILE} must contain a JSON object.`);
  }

  const { policy, packageType, includeAllActiveLts, includeCurrentForLibraries } = raw;

  if (policy !== 'lts' && policy !== 'active-latest') {
    throw new Error(`${POLICY_FILE}: "policy" must be "lts" or "active-latest".`);
  }

  if (packageType !== 'application' && packageType !== 'library') {
    throw new Error(`${POLICY_FILE}: "packageType" must be "application" or "library".`);
  }

  if (typeof includeAllActiveLts !== 'boolean' || typeof includeCurrentForLibraries !== 'boolean') {
    throw new Error(`${POLICY_FILE}: "includeAllActiveLts" and "includeCurrentForLibraries" must be true or false.`);
  }

  return { policy, packageType, includeAllActiveLts, includeCurrentForLibraries };
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error: unknown) {
    throw new Error(`Could not fetch ${url}: ${errorMessage(error)}. Check the network connection and run the command again.`);
  }

  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}. Run the command again later.`);
  }

  return response.json();
}

async function loadSchedule(scheduleFile: string | undefined): Promise<Record<string, unknown>> {
  const schedule = scheduleFile === undefined ? await fetchJson(SCHEDULE_URL) : readJson(scheduleFile);

  if (!isRecord(schedule)) {
    throw new Error('The Node.js release schedule is not a JSON object.');
  }

  return schedule;
}

function asDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

function getActiveLines(schedule: Record<string, unknown>, today: string): ReleaseLine[] {
  const lines: ReleaseLine[] = [];

  for (const [key, entry] of Object.entries(schedule)) {
    const match = /^v(\d+)$/u.exec(key);

    if (match === null || !isRecord(entry)) {
      continue;
    }

    const start = asDate(entry['start']);
    const end = asDate(entry['end']);

    if (start === null || end === null || start > today || end < today) {
      continue;
    }

    const lts = asDate(entry['lts']);
    const maintenance = asDate(entry['maintenance']);
    const isLts = lts !== null && lts <= today;
    let status: LineStatus = isLts ? 'active-lts' : 'current';

    if (maintenance !== null && maintenance <= today) {
      status = 'maintenance';
    }

    lines.push({ major: Number(match[1]), status, isLts, start, lts, maintenance, end });
  }

  return lines.sort((a, b) => a.major - b.major);
}

function computeExpectation(config: PolicyConfig, lines: ReleaseLine[], today: string): Expectation {
  const ltsLines = lines.filter((line) => line.isLts);
  const newestLts = ltsLines.at(-1);
  const primary = config.policy === 'lts' ? newestLts : lines.at(-1);

  if (primary === undefined) {
    const kind = config.policy === 'lts' ? 'LTS ' : '';
    throw new Error(`The release schedule has no active ${kind}Node.js release line on ${today}.`);
  }

  if (config.packageType === 'application') {
    return { today, primary, supported: [primary.major], lines };
  }

  const supported = new Set<number>([primary.major]);
  const ltsSelection = config.includeAllActiveLts ? ltsLines : newestLts === undefined ? [] : [newestLts];

  for (const line of ltsSelection) {
    supported.add(line.major);
  }

  if (config.includeCurrentForLibraries) {
    for (const line of lines) {
      if (line.status === 'current') {
        supported.add(line.major);
      }
    }
  }

  return { today, primary, supported: [...supported].sort((a, b) => a - b), lines };
}

function parseNodeRange(range: string): { parts: RangePart[]; unbounded: string[]; unknown: string[] } {
  const parts: RangePart[] = [];
  const unbounded: string[] = [];
  const unknown: string[] = [];

  for (const text of range.split('||').map((part) => part.trim()).filter((part) => part.length > 0)) {
    const single = /^[\^~]?v?(\d+)(?:\.(?:\d+|x|\*)){0,2}$/u.exec(text);
    const bounded = /^>=\s*v?(\d+)(?:\.\d+){0,2}\s+<\s*v?(\d+)(?:\.0){0,2}$/u.exec(text);

    if (single !== null) {
      parts.push({ text, majors: [Number(single[1])] });
    } else if (bounded !== null && Number(bounded[2]) > Number(bounded[1])) {
      const majors: number[] = [];

      for (let major = Number(bounded[1]); major < Number(bounded[2]); major += 1) {
        majors.push(major);
      }

      parts.push({ text, majors });
    } else if (/^>=?\s*v?\d+/u.test(text) && !text.includes('<')) {
      unbounded.push(text);
    } else {
      unknown.push(text);
    }
  }

  return { parts, unbounded, unknown };
}

function buildNodeRange(parts: RangePart[], supported: number[]): string {
  return supported
    .map((major) => parts.find((part) => part.majors.length === 1 && part.majors[0] === major)?.text ?? `^${major}.0.0`)
    .join(' || ');
}

function difference(left: Iterable<number>, right: Iterable<number>): number[] {
  const exclude = new Set(right);
  return [...new Set(left)].filter((value) => !exclude.has(value)).sort((a, b) => a - b);
}

function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// A small semver range check for the comparator forms that package.json ranges use in practice.
// Returns undefined when the range uses a form that this function does not evaluate.
function satisfies(versionText: string, range: string): boolean | undefined {
  const version = parseVersion(versionText);

  if (version === null) {
    return undefined;
  }

  let matched = false;

  for (const alternative of range.split('||')) {
    const comparators = alternative.trim().split(/\s+/u).filter((comparator) => comparator.length > 0);

    if (comparators.length === 0 || comparators.every((comparator) => comparator === '*' || comparator === 'x')) {
      return true;
    }

    let all = true;

    for (const comparator of comparators) {
      const result = matchComparator(version, comparator);

      if (result === undefined) {
        return undefined;
      }

      all &&= result;
    }

    matched ||= all;
  }

  return matched;
}

function matchComparator(version: Version, comparator: string): boolean | undefined {
  const match = /^(>=|<=|>|<|=|\^|~)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/u.exec(comparator);

  if (match === null) {
    return undefined;
  }

  const operator = match[1] ?? '';
  const major = Number(match[2]);
  const minor = match[3] === undefined || /[x*]/u.test(match[3]) ? null : Number(match[3]);
  const patch = minor === null || match[4] === undefined || /[x*]/u.test(match[4]) ? null : Number(match[4]);
  const lower: Version = [major, minor ?? 0, patch ?? 0];
  const comparison = compareVersions(version, lower);

  switch (operator) {
    case '':
    case '=':
      return version[0] === major && (minor === null || version[1] === minor) && (patch === null || version[2] === patch);
    case '^': {
      const upper: Version = major > 0 || minor === null ? [major + 1, 0, 0] : minor > 0 || patch === null ? [0, minor + 1, 0] : [0, 0, patch + 1];
      return comparison >= 0 && compareVersions(version, upper) < 0;
    }
    case '~': {
      const upper: Version = minor === null ? [major + 1, 0, 0] : [major, minor + 1, 0];
      return comparison >= 0 && compareVersions(version, upper) < 0;
    }
    case '>=':
      return comparison >= 0;
    case '<':
      return comparison < 0;
    case '>':
      return patch === null ? undefined : comparison > 0;
    case '<=':
      return patch === null ? undefined : comparison <= 0;
    default:
      return undefined;
  }
}

let distIndex: Promise<DistRelease[]> | undefined;

function loadDistIndex(): Promise<DistRelease[]> {
  distIndex ??= fetchJson(DIST_INDEX_URL).then((index) => {
    if (!Array.isArray(index)) {
      throw new Error(`${DIST_INDEX_URL} is not a JSON array.`);
    }

    return index.filter((release): release is DistRelease => isRecord(release) && typeof release['version'] === 'string');
  });

  return distIndex;
}

async function checkPackageJson(expectation: Expectation): Promise<CheckResult> {
  const file = 'package.json';
  const content = readText(file);
  const manifest = readJson(file);
  const engines = isRecord(manifest) && isRecord(manifest['engines']) ? manifest['engines'] : {};
  const nodeRange = engines['node'];
  const npmRange = engines['npm'];
  const findings: Finding[] = [];
  let updated: string | null = null;

  if (typeof nodeRange !== 'string') {
    findings.push({
      file,
      line: null,
      subject: 'engines.node',
      current: '(not set)',
      expected: buildNodeRange([], expectation.supported),
      fixable: false
    });
  } else {
    const { parts, unbounded, unknown } = parseNodeRange(nodeRange);
    const declared = parts.flatMap((part) => part.majors);
    const missing = difference(expectation.supported, declared);
    const extra = difference(declared, expectation.supported);
    const expected = buildNodeRange(parts, expectation.supported);

    if (missing.length > 0 || extra.length > 0 || unbounded.length > 0 || unknown.length > 0) {
      const fixable = unknown.length === 0;

      findings.push({ file, line: null, subject: 'engines.node', current: nodeRange, expected, fixable });

      if (fixable) {
        updated = content.replace(
          /("engines"\s*:\s*\{[^{}]*?"node"\s*:\s*)"(?:[^"\\]|\\.)*"/u,
          (_match, prefix: string) => `${prefix}${JSON.stringify(expected)}`
        );
      }
    }
  }

  if (typeof npmRange === 'string') {
    const releases = await loadDistIndex();

    for (const major of expectation.supported) {
      // The index lists the newest release first.
      const release = releases.find((candidate) => candidate.version.startsWith(`v${major}.`));

      if (release?.npm === undefined) {
        continue;
      }

      const result = satisfies(release.npm, npmRange);

      if (result !== true) {
        findings.push({
          file,
          line: null,
          subject: 'engines.npm',
          current: npmRange,
          expected: result === undefined
            ? `a range that this script can evaluate (npm ${release.npm} is bundled with Node.js ${release.version})`
            : `a range that includes npm ${release.npm}, bundled with Node.js ${release.version}`,
          fixable: false
        });
      }
    }
  }

  return { findings, updated };
}

function checkVersionFile(file: string, expectation: Expectation, skipped: string[]): CheckResult {
  const value = readText(file).trim();
  const match = /^(v?)(\d+)(?:\.\d+){0,2}$/u.exec(value);

  if (match === null) {
    skipped.push(`${file}: "${value}" is not a version number`);
    return { findings: [], updated: null };
  }

  if (Number(match[2]) === expectation.primary.major) {
    return { findings: [], updated: null };
  }

  const expected = `${match[1] ?? ''}${expectation.primary.major}`;

  return {
    findings: [{ file, line: 1, subject: 'development Node.js version', current: value, expected, fixable: true }],
    updated: `${expected}\n`
  };
}

function stripYamlComment(text: string): string {
  return text.replace(/\s+#.*$/u, '');
}

function unquote(text: string): string {
  return text.trim().replace(/^(["'])(.*)\1$/u, '$2');
}

function majorOf(item: string): number | null {
  const match = /^v?(\d+)(?:\.(?:\d+|x|\*)){0,2}$/u.exec(unquote(item));
  return match === null ? null : Number(match[1]);
}

function formatListItem(major: number, sample: string): string {
  const quote = /^["']/u.exec(sample.trim())?.[0] ?? '';
  return `${quote}${major}${quote}`;
}

function checkWorkflow(file: string, expectation: Expectation, skipped: string[]): CheckResult {
  const lines = readText(file).split('\n');
  const output: string[] = [];
  const findings: Finding[] = [];
  const { supported, primary } = expectation;
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    output.push(line);

    if (/^\s*#/u.test(line)) {
      continue;
    }

    if (/\bnpm@latest\b/u.test(stripYamlComment(line))) {
      findings.push({
        file,
        line: lineNumber,
        subject: 'npm installation',
        current: 'npm@latest',
        expected: 'the npm bundled with Node.js, or the exact version from packageManager',
        fixable: false
      });
    }

    const match = /^(\s*)(-\s+)?node-version:(\s*)(.*)$/u.exec(line);

    if (match === null) {
      continue;
    }

    const indent = (match[1] ?? '').length + (match[2] ?? '').length;
    const value = stripYamlComment(match[4] ?? '').trim();

    if (value.includes('${{')) {
      skipped.push(`${file}:${lineNumber}: expression ${value}`);
      continue;
    }

    if (value === '' || value.startsWith('[')) {
      // A list of versions, usually a test matrix: it must contain exactly the supported majors.
      const blockItems: string[] = [];

      if (value === '') {
        for (let next = index + 1; next < lines.length; next += 1) {
          const item = /^(\s*)-\s+(.*)$/u.exec(lines[next] ?? '');

          if (item === null || (item[1] ?? '').length <= indent) {
            break;
          }

          blockItems.push(stripYamlComment(item[2] ?? ''));
        }
      }

      const items = value === ''
        ? blockItems
        : value.replace(/^\[|\]$/gu, '').split(',').map((item) => item.trim()).filter((item) => item.length > 0);
      const majors = items.map(majorOf);

      if (items.length === 0) {
        continue;
      }

      if (majors.some((major) => major === null)) {
        skipped.push(`${file}:${lineNumber}: list with aliases or expressions`);
        continue;
      }

      const declared = majors.filter((major): major is number => major !== null);

      if (difference(supported, declared).length === 0 && difference(declared, supported).length === 0) {
        continue;
      }

      const sample = items[0] ?? '';

      findings.push({
        file,
        line: lineNumber,
        subject: 'node-version list',
        current: `[${declared.join(', ')}]`,
        expected: `[${supported.join(', ')}]`,
        fixable: true
      });
      changed = true;

      if (value === '') {
        const itemIndent = /^(\s*)-/u.exec(lines[index + 1] ?? '')?.[1] ?? `${' '.repeat(indent + 2)}`;

        output.push(...supported.map((major) => `${itemIndent}- ${formatListItem(major, sample)}`));
        index += blockItems.length;
      } else {
        output[output.length - 1] = line.replace(
          /\[[^\]]*\]/u,
          `[${supported.map((major) => formatListItem(major, sample)).join(', ')}]`
        );
      }

      continue;
    }

    const major = majorOf(value);

    if (major === null) {
      skipped.push(`${file}:${lineNumber}: alias ${value}`);
      continue;
    }

    if (!supported.includes(major)) {
      findings.push({
        file,
        line: lineNumber,
        subject: 'node-version',
        current: unquote(value),
        expected: `${primary.major} (or another supported line: ${supported.join(', ')})`,
        fixable: true
      });
      changed = true;
      output[output.length - 1] = line.replace(
        /(node-version:\s*["']?)v?\d+(?:\.(?:\d+|x|\*)){0,2}/u,
        (_match, prefix: string) => `${prefix}${primary.major}`
      );
    }
  }

  return { findings, updated: changed ? output.join('\n') : null };
}

function checkDockerfile(file: string, expectation: Expectation): CheckResult {
  const lines = readText(file).split('\n');
  const findings: Finding[] = [];
  let changed = false;

  const output = lines.map((line, index) => {
    const match = /^(\s*FROM\s+(?:--platform=\S+\s+)?(?:\S+\/)?node:)(v?\d+(?:\.\d+){0,2})(\S*)/iu.exec(line);

    if (match === null || expectation.supported.includes(majorOf(match[2] ?? '') ?? -1)) {
      return line;
    }

    // A digest pins the old image, so a new tag alone would not change the image.
    const fixable = !(match[3] ?? '').includes('@sha256:');

    findings.push({
      file,
      line: index + 1,
      subject: 'Docker base image',
      current: `node:${match[2] ?? ''}${match[3] ?? ''}`,
      expected: `node:${expectation.primary.major}${fixable ? match[3] ?? '' : `${(match[3] ?? '').split('@')[0] ?? ''} with a new digest`}`,
      fixable
    });

    if (!fixable) {
      return line;
    }

    changed = true;
    return `${match[1] ?? ''}${expectation.primary.major}${line.slice((match[1] ?? '').length + (match[2] ?? '').length)}`;
  });

  return { findings, updated: changed ? output.join('\n') : null };
}

function listFiles(directory: string, accept: (name: string) => boolean, recursive: boolean): string[] {
  const absolute = join(ROOT, directory);

  if (!existsSync(absolute)) {
    return [];
  }

  const files: string[] = [];

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = relative(ROOT, join(absolute, entry.name));

    if (entry.isDirectory()) {
      if (recursive && !EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...listFiles(path, accept, recursive));
      }
    } else if (entry.isFile() && accept(entry.name)) {
      files.push(path);
    }
  }

  return files.sort();
}

function describeLine(line: ReleaseLine): string {
  return `Node.js ${line.major} (${STATUS_LABELS[line.status]})`;
}

function formatFinding(finding: Finding): string {
  const location = finding.line === null ? finding.file : `${finding.file}:${finding.line}`;
  const manual = finding.fixable ? '' : ' [manual fix]';
  return `${location}: ${finding.subject} is "${finding.current}", expected ${finding.expected}${manual}`;
}

function writeStepSummary(markdown: string): void {
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];

  if (summaryFile !== undefined && summaryFile.length > 0) {
    appendFileSync(summaryFile, `${markdown}\n`);
  }
}

function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|');
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));

  if (options === null) {
    console.log(usage());
    return 0;
  }

  const config = readPolicy();
  const schedule = await loadSchedule(options.scheduleFile);
  const expectation = computeExpectation(config, getActiveLines(schedule, options.today), options.today);
  const inspected: string[] = [];
  const skipped: string[] = [];
  const findings: Finding[] = [];
  const changed: string[] = [];

  const record = (file: string, result: CheckResult): void => {
    inspected.push(file);
    findings.push(...result.findings);

    if (options.mode === 'write' && result.updated !== null) {
      writeFileSync(join(ROOT, file), result.updated);
      changed.push(file);
    }
  };

  record('package.json', await checkPackageJson(expectation));

  for (const file of ['.nvmrc', '.node-version'].filter((name) => existsSync(join(ROOT, name)))) {
    record(file, checkVersionFile(file, expectation, skipped));
  }

  const isYaml = (name: string): boolean => /\.ya?ml$/u.test(name);
  const workflowFiles = [
    ...listFiles('.github/workflows', isYaml, false),
    ...listFiles('.github/actions', (name) => /^action\.ya?ml$/u.test(name), true)
  ];

  for (const file of workflowFiles) {
    record(file, checkWorkflow(file, expectation, skipped));
  }

  for (const file of listFiles('.', (name) => /^Dockerfile/u.test(name), true)) {
    record(file, checkDockerfile(file, expectation));
  }

  const fixed = options.mode === 'write' ? findings.filter((finding) => finding.fixable) : [];
  const remaining = options.mode === 'write' ? findings.filter((finding) => !finding.fixable) : findings;
  const status = remaining.length > 0 ? 'stale' : fixed.length > 0 ? 'updated' : 'current';
  const policyLabel = `${config.policy === 'lts' ? 'Latest active LTS' : 'Latest active release'} (${config.packageType})`;

  if (options.format === 'json') {
    console.log(JSON.stringify({
      status,
      today: options.today,
      policy: config,
      primary: expectation.primary.major,
      supported: expectation.supported,
      lines: expectation.lines,
      inspected,
      skipped,
      findings: remaining,
      fixed,
      changed
    }, null, 2));
  } else {
    const heading = {
      current: 'Node.js version policy is current',
      updated: 'Node.js version policy updated',
      stale: 'Node.js version policy needs attention'
    }[status];
    const output = [
      heading,
      '',
      `Policy: ${policyLabel}`,
      `Primary version: ${describeLine(expectation.primary)}`,
      `Supported release lines: ${expectation.supported.join(', ')}`,
      `Date: ${options.today} (UTC)`
    ];

    if (options.verbose) {
      output.push('', 'Active release lines:');
      output.push(...expectation.lines.map((line) => `- ${describeLine(line)}: start ${line.start}, LTS ${line.lts ?? '-'}, maintenance ${line.maintenance ?? '-'}, end ${line.end}`));
      output.push('', 'Inspected files:', ...inspected.map((file) => `- ${file}`));

      if (skipped.length > 0) {
        output.push('', 'Skipped values:', ...skipped.map((entry) => `- ${entry}`));
      }
    }

    if (changed.length > 0) {
      output.push('', 'Changed:', ...changed.map((file) => `- ${file}`));
    }

    if (remaining.length > 0) {
      output.push('', 'Findings:', ...remaining.map((finding) => `- ${formatFinding(finding)}`));

      if (remaining.some((finding) => finding.fixable)) {
        output.push('', `Run "node scripts/check-node-version-policy.ts --write" to update the values that can be fixed automatically.`);
      }
    }

    console.log(output.join('\n'));
  }

  const summary = [
    `## ${status === 'stale' ? 'Node.js version policy needs attention' : 'Node.js version policy is current'}`,
    '',
    `* Policy: ${policyLabel}`,
    `* Primary version: ${describeLine(expectation.primary)}`,
    `* Supported release lines: ${expectation.supported.join(', ')}`
  ];

  if (remaining.length > 0) {
    summary.push('', '| File | Value | Current | Expected | Fix |', '| --- | --- | --- | --- | --- |');
    summary.push(...remaining.map((finding) => `| ${escapeCell(finding.line === null ? finding.file : `${finding.file}:${finding.line}`)} | ${escapeCell(finding.subject)} | \`${escapeCell(finding.current)}\` | ${escapeCell(finding.expected)} | ${finding.fixable ? '`--write`' : 'manual'} |`));
  }

  writeStepSummary(summary.join('\n'));

  return remaining.length > 0 ? 1 : 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(`${SCRIPT_NAME}: ${errorMessage(error)}`);

    if (error instanceof UsageError || (isRecord(error) && typeof error['code'] === 'string' && error['code'].startsWith('ERR_PARSE_ARGS'))) {
      console.error(`Run "${SCRIPT_NAME} --help" for usage.`);
    }

    process.exitCode = 2;
  }
);
