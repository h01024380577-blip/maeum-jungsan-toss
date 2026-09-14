#!/usr/bin/env node

/**
 * .ait 아티팩트 무결성 검증 (Apps-in-Toss SDK 3.x 레이아웃)
 *
 * 2.x 와 레이아웃이 완전히 다르다:
 *   2.x — `outdir`(=dist) 전체를 담아 `web/index.html` + RN 번들(bundle.ios.*)
 *   3.x — `webBundleDir`(=dist/web) 을 있는 그대로 `sources/` 아래 담고,
 *         루트에 `bundle.json` · `project-package.json`. RN 번들은 없다.
 *
 * scripts/build-ait.sh 가 dist/web 에서 서버 전용 산출물을 걷어내는데,
 * 3.x 는 그 디렉터리를 통째로 싣기 때문에 청소가 새면 서버 코드가 그대로
 * 번들에 실린다. 그 사고를 여기서 잡는다.
 */

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

const requiredEntries = ['sources/index.html', 'bundle.json', 'project-package.json'];
const missingEntries = requiredEntries.filter((entry) => !entrySet.has(entry));

const hasNextStatic = entries.some((entry) => entry.startsWith('sources/_next/static/'));

// next build 가 커스텀 distDir 에 남기는 서버/빌드 전용 산출물.
// WebView 번들에 실리면 안 된다 (용량 + 서버 코드 유출).
const forbiddenEntryPrefixes = [
  'sources/build/',
  'sources/cache/',
  'sources/dev/',
  'sources/diagnostics/',
  'sources/node_modules/',
  'sources/server/',
  'sources/turbopack/',
  'sources/types/',
];
const forbiddenEntries = entries.filter((entry) =>
  forbiddenEntryPrefixes.some((prefix) => entry.startsWith(prefix))
);

// macOS 가 남기는 잔재 — 3.x 는 디렉터리를 그대로 싣기 때문에 실제로 들어간다.
const junkEntries = entries.filter((entry) => basename(entry) === '.DS_Store');

if (missingEntries.length > 0) {
  fail(`missing required entries: ${missingEntries.join(', ')}`);
}

if (!hasNextStatic) {
  fail('missing Next.js static assets under sources/_next/static/');
}

if (forbiddenEntries.length > 0) {
  fail(`contains server/build-only entries: ${forbiddenEntries.slice(0, 10).join(', ')}`);
}

if (junkEntries.length > 0) {
  fail(`contains junk files: ${junkEntries.slice(0, 10).join(', ')}`);
}

// bundle.json 을 읽어 2.x 로 조용히 되돌아가거나 webBundleDir 이 틀어지는 사고를 막는다.
let bundle;
try {
  bundle = JSON.parse(new TextDecoder().decode(await reader.readEntry('bundle.json')));
} catch (error) {
  fail(`could not read bundle.json: ${error instanceof Error ? error.message : String(error)}`);
}

const sdkVersion = bundle?.sdk?.version;
if (typeof sdkVersion !== 'string' || !sdkVersion.startsWith('3.')) {
  fail(`expected SDK 3.x, got ${sdkVersion ?? '(none)'}`);
}

const webBundleDir = bundle?.config?.webBundleDir;
if (webBundleDir !== 'dist/web') {
  fail(`expected webBundleDir 'dist/web', got ${JSON.stringify(webBundleDir)}`);
}

console.log(
  `AIT artifact verified: ${basename(artifactPath)} (${entries.length} files, SDK ${sdkVersion}, deploymentId ${reader.deploymentId})`
);
