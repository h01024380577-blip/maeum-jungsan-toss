#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { AITReader } from '@apps-in-toss/ait-format';

const artifactPath = process.argv[2] ?? 'maeum-jungsan.ait';

function fail(message) {
  console.error(`AIT artifact verification failed: ${message}`);
  process.exit(1);
}

let reader;

try {
  reader = AITReader.fromBuffer(readFileSync(artifactPath));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const entries = reader.listEntries();
const entrySet = new Set(entries);
const requiredEntries = [
  'bundle.ios.0_84_0.js',
  'bundle.android.0_84_0.js',
  'bundle.ios.0_72_6.js',
  'bundle.android.0_72_6.js',
  'web/index.html',
];

const missingEntries = requiredEntries.filter((entry) => !entrySet.has(entry));
const hasNextStatic = entries.some((entry) => entry.startsWith('web/_next/static/'));
const forbiddenEntryPrefixes = [
  'web/build/',
  'web/cache/',
  'web/dev/',
  'web/diagnostics/',
  'web/node_modules/',
  'web/server/',
  'web/types/',
];
const forbiddenEntries = entries.filter((entry) =>
  forbiddenEntryPrefixes.some((prefix) => entry.startsWith(prefix))
);

if (missingEntries.length > 0) {
  fail(`missing required entries: ${missingEntries.join(', ')}`);
}

if (!hasNextStatic) {
  fail('missing Next.js static assets under web/_next/static/');
}

if (forbiddenEntries.length > 0) {
  fail(`contains server/build-only entries: ${forbiddenEntries.slice(0, 10).join(', ')}`);
}

console.log(
  `AIT artifact verified: ${basename(artifactPath)} (${entries.length} files, deploymentId ${reader.deploymentId})`
);
