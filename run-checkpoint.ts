#!/usr/bin/env node
/**
 * run-checkpoint.ts — Runner untuk checkpoint.test-cases.json
 *
 * Menjalankan seluruh test case di checkpoint.test-cases.json terhadap implementasi
 * di src/lib/logic.ts, lalu melaporkan hasilnya. Tidak butuh dependency apa pun:
 * Node >= 22.15 menjalankan TypeScript langsung via native type stripping, dan
 * resolusi import tanpa ekstensi ditangani lewat module hook di bawah.
 *
 * Pemakaian:
 *   node run-checkpoint.ts
 *   node run-checkpoint.ts --category=zero-division
 *   node run-checkpoint.ts --priority=critical --verbose
 *   node run-checkpoint.ts --function=getStockStatus
 *   node run-checkpoint.ts --filter=TC-BS
 *   node run-checkpoint.ts --impl=./src/lib/logic-v2.ts
 *   node run-checkpoint.ts --bail
 *
 * Exit code: 0 jika semua lulus, 1 jika ada yang gagal / belum diimplementasi.
 */

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import checkpointJson from './checkpoint.test-cases.json' with { type: 'json' };
import sampleDataJson from './sample_data.json' with { type: 'json' };

import type {
  ActionRadarViewModel,
  BudgetSafeMetrics,
  SampleData,
  SkuMetrics,
  UrgencyStatus,
} from './src/types.ts';

/**
 * Kode aplikasi memakai import relatif tanpa ekstensi (gaya bundler, mis. "./thresholds"),
 * yang tidak dikenal Node ESM. Hook ini menambal resolusi itu saat runtime supaya runner
 * bisa menguji source aplikasi apa adanya — tanpa perlu mengubah satu baris pun di src/.
 */
registerHooks({
  resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.')) {
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          try {
            return nextResolve(specifier + ext, context);
          } catch {
            // coba ekstensi berikutnya
          }
        }
      }
      throw err;
    }
  },
} as never);

/** Bentuk minimal yang dipakai test case — dipersempit dari SkuMetrics. */
type SortableSku = Pick<
  SkuMetrics,
  'sku' | 'overallStatus' | 'stockStatus' | 'marginStatus' | 'jamSampaiHabis'
>;
type BudgetInputSku = Pick<SkuMetrics, 'sku' | 'underCogs' | 'isBelowCogs'>;
type RecommendationInput = Pick<
  SkuMetrics,
  'isOversold' | 'stockStatus' | 'marginStatus' | 'jamSampaiHabis'
>;

// ===========================================================================
// Bentuk file checkpoint
// ===========================================================================

interface TestCase {
  id: string;
  function: string;
  specRef: string;
  category: string;
  priority: string;
  description: string;
  input: unknown;
  expected: unknown;
  tolerance?: number;
  assertNotNaNOrInfinity?: boolean;
  regressionFor?: string;
  note?: string;
}

interface CheckpointFile {
  meta: {
    name: string;
    derivedFrom: string;
    version: string;
    totalCases: number;
    coverageByFunction: Record<string, number>;
    coverageByCategory: Record<string, number>;
    regressionCoverage: Record<string, string[] | string>;
    [k: string]: unknown;
  };
  testCases: TestCase[];
}

const checkpoint = checkpointJson as unknown as CheckpointFile;
const sampleData = sampleDataJson as unknown as SampleData;

// ===========================================================================
// Kontrak implementasi yang diuji
// ===========================================================================

interface Implementation {
  calculateRunratePerJam(qty: number, elapsedHours: number): number;
  calculateJamSampaiHabis(totalSisaStock: number, runratePerJam: number): number | null;
  getStockStatus(jamSampaiHabis: number | null, isOversold: boolean): UrgencyStatus;
  getMarginStatus(underCogs: number, cogsPerUnit: number, qty: number): UrgencyStatus;
  getOverallStatus(stockStatus: UrgencyStatus, marginStatus: UrgencyStatus): UrgencyStatus;
  sortByPriority<T extends SortableSku>(list: readonly T[]): T[];
  calculateBudgetSafe(budgetCampaign: number, skuList: readonly BudgetInputSku[]): BudgetSafeMetrics;
  generateRecommendation(metrics: RecommendationInput): string;
  buildActionRadarViewModel(data: SampleData): ActionRadarViewModel;
}

// ===========================================================================
// CLI
// ===========================================================================

const HERE = dirname(fileURLToPath(import.meta.url));

interface Options {
  filter?: string;
  category?: string;
  priority?: string;
  functionName?: string;
  verbose: boolean;
  bail: boolean;
  implPath: string;
}

const DEFAULT_IMPL_PATH = './src/lib/logic.ts';

function parseArgs(argv: string[]): Options {
  const opts: Options = { verbose: false, bail: false, implPath: DEFAULT_IMPL_PATH };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--verbose' || arg === '-v') {
      opts.verbose = true;
    } else if (arg === '--bail') {
      opts.bail = true;
    } else if (arg.startsWith('--filter=')) {
      opts.filter = arg.slice('--filter='.length);
    } else if (arg.startsWith('--category=')) {
      opts.category = arg.slice('--category='.length);
    } else if (arg.startsWith('--priority=')) {
      opts.priority = arg.slice('--priority='.length);
    } else if (arg.startsWith('--function=')) {
      opts.functionName = arg.slice('--function='.length);
    } else if (arg.startsWith('--impl=')) {
      opts.implPath = arg.slice('--impl='.length);
    } else {
      console.error(`Argumen tidak dikenal: ${arg}\nJalankan dengan --help untuk daftar opsi.`);
      process.exit(2);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
Action Radar — Checkpoint Runner

  node run-checkpoint.ts [opsi]

Opsi:
  --filter=<teks>        Jalankan hanya case yang id-nya memuat <teks>   (mis. --filter=TC-BS)
  --category=<nama>      Filter kategori: happy-path | boundary | zero-division |
                         edge-case | integration | architecture | invariant
  --priority=<nama>      Filter prioritas: critical | high | medium | low
  --function=<nama>      Filter nama fungsi                             (mis. --function=getStockStatus)
  --impl=<path>          Modul implementasi yang diuji (default: ./src/lib/logic.ts)
  --verbose, -v          Tampilkan detail setiap assertion, termasuk yang lulus
  --bail                 Berhenti pada kegagalan pertama
  --help, -h             Tampilkan bantuan ini
`);
}

const options = parseArgs(process.argv.slice(2));

// ===========================================================================
// Warna terminal
// ===========================================================================

const useColor = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
const paint = (code: string) => (s: string) => (useColor ? `\u001B[${code}m${s}\u001B[0m` : s);
const c = {
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('36'),
  grey: paint('90'),
  bold: paint('1'),
};

// ===========================================================================
// Perbandingan nilai
// ===========================================================================

const DEFAULT_TOLERANCE = 1e-9;

/**
 * Objek dibandingkan secara PARTIAL: hanya key yang ada di `expected` yang dicek.
 * Ini disengaja — test case hanya menyebut field yang relevan, bukan seluruh objek.
 */
function valuesEqual(actual: unknown, expected: unknown, tol: number): boolean {
  if (expected === null || actual === null) return actual === expected;

  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected)) return Number.isNaN(actual);
    if (!Number.isFinite(expected)) return actual === expected;
    return Math.abs(actual - expected) <= tol;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((e, i) => valuesEqual(actual[i], e, tol));
  }

  if (typeof expected === 'object' && typeof actual === 'object') {
    return Object.entries(expected as Record<string, unknown>).every(([k, v]) =>
      valuesEqual((actual as Record<string, unknown>)[k], v, tol),
    );
  }

  return actual === expected;
}

function show(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

// ===========================================================================
// Pengumpul assertion per case
// ===========================================================================

interface Assertion {
  label: string;
  pass: boolean;
  detail: string;
}

type CaseStatus = 'PASS' | 'FAIL' | 'NOT_IMPLEMENTED' | 'ERROR' | 'SKIPPED';

interface CaseResult {
  testCase: TestCase;
  status: CaseStatus;
  assertions: Assertion[];
  error?: string;
}

function createCollector(tol: number) {
  const assertions: Assertion[] = [];

  function pass(label: string, detail = ''): void {
    assertions.push({ label, pass: true, detail });
  }

  function fail(label: string, detail: string): void {
    assertions.push({ label, pass: false, detail });
  }

  /** Assertion utama: bandingkan actual vs expected. */
  function eq(label: string, actual: unknown, expected: unknown): void {
    if (valuesEqual(actual, expected, tol)) {
      pass(label, `${show(actual)}`);
    } else {
      fail(label, `expected ${show(expected)}, got ${show(actual)}`);
    }
  }

  function isTrue(label: string, condition: boolean, detail: string): void {
    if (condition) pass(label, detail);
    else fail(label, detail);
  }

  return { assertions, eq, isTrue, pass, fail };
}

type Collector = ReturnType<typeof createCollector>;

// ===========================================================================
// Utilitas untuk case khusus
// ===========================================================================

/** Menolak NaN / Infinity di mana pun dalam struktur. Dipakai TC-INT-05 dan flag assertNotNaNOrInfinity. */
function findNonFiniteNumbers(value: unknown, path = 'root'): string[] {
  const problems: string[] = [];

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) problems.push(`${path} = ${value}`);
    return problems;
  }
  if (value === null || typeof value !== 'object') return problems;

  if (Array.isArray(value)) {
    value.forEach((v, i) => problems.push(...findNonFiniteNumbers(v, `${path}[${i}]`)));
    return problems;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    problems.push(...findNonFiniteNumbers(v, `${path}.${k}`));
  }
  return problems;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** Buang komentar sebelum memindai source, supaya kata di dokumentasi tidak jadi false positive. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const FORBIDDEN_SOURCE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'network call', re: /\b(?:fetch|axios|XMLHttpRequest|got|superagent)\s*[(.]/ },
  { label: 'http module', re: /from\s+['"](?:node:)?https?['"]/ },
  { label: 'database client', re: /\b(?:pg|mysql2?|mongoose|mongodb|sqlite3?|prisma|knex|sequelize|redis)\b/i },
  { label: 'auth / session', re: /\b(?:jsonwebtoken|jwt|oauth|passport|bearer|localStorage|sessionStorage)\b/i },
  { label: 'filesystem write', re: /\bfs\b[\s\S]{0,20}?\b(?:writeFile|appendFile|unlink|rm|mkdir)/ },
];

/** Cari SkuMetrics berdasarkan sku, untuk perbandingan per-SKU. */
function findSku(list: readonly SkuMetrics[], sku: string): SkuMetrics | undefined {
  return list.find((s) => s.sku === sku);
}

function asRecord(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

function usesSampleData(input: unknown): boolean {
  return asRecord(input).source === 'sample_data.json';
}

// ===========================================================================
// Dispatcher — memetakan setiap test case ke fungsi yang diuji
// ===========================================================================

function runTestCase(tc: TestCase, impl: Implementation, implSource: string): CaseResult {
  const tol = tc.tolerance ?? DEFAULT_TOLERANCE;
  const col = createCollector(tol);

  try {
    switch (tc.function) {
      case 'calculateRunratePerJam': {
        const i = asRecord(tc.input);
        const actual = impl.calculateRunratePerJam(
          i.qtyTerjualCampaignBerjalan as number,
          i.campaignElapsedHours as number,
        );
        col.eq('result', actual, tc.expected);
        assertFiniteIfRequested(col, tc, actual);
        break;
      }

      case 'calculateJamSampaiHabis': {
        const i = asRecord(tc.input);
        const actual = impl.calculateJamSampaiHabis(
          i.totalSisaStock as number,
          i.runratePerJam as number,
        );
        col.eq('result', actual, tc.expected);
        assertFiniteIfRequested(col, tc, actual);
        break;
      }

      case 'getStockStatus': {
        const i = asRecord(tc.input);
        col.eq(
          'result',
          impl.getStockStatus(i.jamSampaiHabis as number | null, i.isOversold as boolean),
          tc.expected,
        );
        break;
      }

      case 'getMarginStatus': {
        const i = asRecord(tc.input);
        col.eq(
          'result',
          impl.getMarginStatus(i.underCogs as number, i.cogsPerUnit as number, i.qty as number),
          tc.expected,
        );
        break;
      }

      case 'getOverallStatus': {
        const i = asRecord(tc.input);
        col.eq(
          'result',
          impl.getOverallStatus(i.stockStatus as UrgencyStatus, i.marginStatus as UrgencyStatus),
          tc.expected,
        );
        break;
      }

      case 'calculateBudgetSafe': {
        const expected = asRecord(tc.expected);
        let actual: BudgetSafeMetrics;

        if (usesSampleData(tc.input)) {
          const vm = impl.buildActionRadarViewModel(deepClone(sampleData));
          actual = vm.budgetSafe;
        } else {
          const i = asRecord(tc.input);
          actual = impl.calculateBudgetSafe(
            i.budgetCampaign as number,
            i.skuList as BudgetInputSku[],
          );
        }

        for (const [key, want] of Object.entries(expected)) {
          col.eq(key, asRecord(actual)[key], want);
        }
        assertFiniteIfRequested(col, tc, actual);
        break;
      }

      case 'sortByPriority': {
        const expected = asRecord(tc.expected);
        let sorted: readonly SortableSku[];

        if (usesSampleData(tc.input)) {
          const vm = impl.buildActionRadarViewModel(deepClone(sampleData));
          sorted = vm.skuList;
        } else {
          const inputList = tc.input as SortableSku[];
          const before = inputList.map((s) => s.sku);
          sorted = impl.sortByPriority(inputList);

          if (Array.isArray(expected.inputArrayUnchangedOrderBySku)) {
            col.eq(
              'input tidak dimutasi (pure function)',
              inputList.map((s) => s.sku),
              expected.inputArrayUnchangedOrderBySku,
            );
            col.isTrue(
              'referensi array input tetap utuh',
              before.length === inputList.length,
              `panjang sebelum ${before.length}, sesudah ${inputList.length}`,
            );
          }
        }

        col.eq(
          'orderBySku',
          sorted.map((s) => s.sku),
          expected.orderBySku,
        );
        break;
      }

      case 'generateRecommendation': {
        const i = asRecord(tc.input);
        const text = impl.generateRecommendation({
          isOversold: i.isOversold as boolean,
          stockStatus: i.stockStatus as UrgencyStatus,
          marginStatus: i.marginStatus as UrgencyStatus,
          jamSampaiHabis: i.jamSampaiHabis as number | null,
        });

        col.isTrue('mengembalikan string non-kosong', typeof text === 'string' && text.length > 0, show(text));

        const expected = asRecord(tc.expected);
        for (const needle of (expected.mustContain as string[] | undefined) ?? []) {
          col.isTrue(`memuat ${show(needle)}`, text.includes(needle), show(text));
        }
        for (const needle of (expected.mustNotContain as string[] | undefined) ?? []) {
          col.isTrue(`TIDAK memuat ${show(needle)}`, !text.includes(needle), show(text));
        }
        break;
      }

      case 'buildActionRadarViewModel': {
        runViewModelCase(tc, impl, implSource, col, tol);
        break;
      }

      default:
        return {
          testCase: tc,
          status: 'SKIPPED',
          assertions: [],
          error: `Tidak ada dispatcher untuk fungsi "${tc.function}"`,
        };
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('NOT_IMPLEMENTED:')) {
      return { testCase: tc, status: 'NOT_IMPLEMENTED', assertions: col.assertions, error: err.message };
    }
    return {
      testCase: tc,
      status: 'ERROR',
      assertions: col.assertions,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }

  const failed = col.assertions.some((a) => !a.pass);
  return { testCase: tc, status: failed ? 'FAIL' : 'PASS', assertions: col.assertions };
}

function assertFiniteIfRequested(col: Collector, tc: TestCase, value: unknown): void {
  if (tc.assertNotNaNOrInfinity !== true) return;
  const problems = findNonFiniteNumbers(value, 'result');
  col.isTrue(
    'tidak ada NaN / Infinity',
    problems.length === 0,
    problems.length === 0 ? 'bersih' : problems.join(', '),
  );
}

/**
 * buildActionRadarViewModel punya beberapa bentuk expected:
 *  - hasData / campaignName          -> perbandingan langsung
 *  - skuList / skuMetrics            -> dicocokkan per SKU
 *  - noNetworkCalls dkk (TC-INT-04)  -> pemeriksaan batasan arsitektur
 *  - everyNumericFieldIsFinite dkk   -> pemeriksaan invariant (TC-INT-05)
 */
function runViewModelCase(
  tc: TestCase,
  impl: Implementation,
  implSource: string,
  col: Collector,
  tol: number,
): void {
  const expected = asRecord(tc.expected);
  const input: SampleData = usesSampleData(tc.input)
    ? deepClone(sampleData)
    : (deepClone(tc.input) as SampleData);

  const isArchitectureCase = 'noNetworkCalls' in expected || 'isPureFunction' in expected;
  const isInvariantCase =
    'everyNumericFieldIsFinite' in expected || 'jamSampaiHabisIsNumberOrNull' in expected;

  if (isArchitectureCase) {
    runArchitectureChecks(impl, implSource, input, expected, col);
    return;
  }

  const vm = impl.buildActionRadarViewModel(input);

  if ('hasData' in expected) col.eq('hasData', vm.hasData, expected.hasData);
  if ('campaignName' in expected) col.eq('campaignName', vm.campaignName, expected.campaignName);

  const perSku = (expected.skuMetrics ?? expected.skuList) as
    | Array<Record<string, unknown>>
    | undefined;

  if (perSku) {
    col.eq(
      'jumlah SKU di skuList',
      vm.skuList.length,
      perSku.length,
    );
    for (const want of perSku) {
      const sku = want.sku as string;
      const got = findSku(vm.skuList, sku);
      if (!got) {
        col.fail(`${sku}`, 'SKU tidak ditemukan di skuList');
        continue;
      }
      for (const [key, value] of Object.entries(want)) {
        if (key === 'sku') continue;
        col.eq(`${sku}.${key}`, asRecord(got)[key], value);
      }
    }
  }

  if (isInvariantCase) {
    if (expected.everyNumericFieldIsFinite === true) {
      const problems = findNonFiniteNumbers(vm, 'viewModel');
      col.isTrue(
        'semua field numerik finite (tidak ada NaN / Infinity)',
        problems.length === 0,
        problems.length === 0 ? `${vm.skuList.length} SKU diperiksa, bersih` : problems.join(', '),
      );
    }
    if (expected.jamSampaiHabisIsNumberOrNull === true) {
      const offenders = vm.skuList.filter(
        (s) => !(s.jamSampaiHabis === null || (typeof s.jamSampaiHabis === 'number' && Number.isFinite(s.jamSampaiHabis))),
      );
      col.isTrue(
        'jamSampaiHabis bertipe number | null untuk semua SKU',
        offenders.length === 0,
        offenders.length === 0
          ? 'semua valid'
          : offenders.map((s) => `${s.sku}=${show(s.jamSampaiHabis)}`).join(', '),
      );
    }
  }

  void tol;
}

/** TC-INT-04 — menegakkan batasan TECH_SPEC.md §1: no network, no DB, no auth, no write-back, pure. */
function runArchitectureChecks(
  impl: Implementation,
  implSource: string,
  input: SampleData,
  expected: Record<string, unknown>,
  col: Collector,
): void {
  // 1. Pemindaian statis source (komentar dibuang lebih dulu agar tidak false positive).
  const code = stripComments(implSource);
  const staticHits = FORBIDDEN_SOURCE_PATTERNS.filter((p) => p.re.test(code)).map((p) => p.label);

  if (expected.noDatabaseAccess === true) {
    const dbHit = staticHits.includes('database client');
    col.isTrue('tidak ada klien database di source', !dbHit, dbHit ? 'ditemukan referensi klien DB' : 'bersih');
  }
  if (expected.noAuthRequired === true) {
    const authHit = staticHits.includes('auth / session');
    col.isTrue('tidak ada auth / session di source', !authHit, authHit ? 'ditemukan referensi auth' : 'bersih');
  }
  if (expected.noWriteBack === true) {
    const fsHit = staticHits.includes('filesystem write');
    col.isTrue('tidak ada penulisan filesystem di source', !fsHit, fsHit ? 'ditemukan operasi tulis fs' : 'bersih');
  }

  // 2. Blokir network saat runtime, lalu jalankan pipeline.
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  // @ts-expect-error sengaja menimpa fetch untuk mendeteksi percobaan akses jaringan
  globalThis.fetch = (...args: unknown[]) => {
    networkAttempts += 1;
    void args;
    throw new Error('NETWORK_BLOCKED_BY_CHECKPOINT');
  };

  // 3. Bekukan input untuk mendeteksi mutasi data masukan (write-back).
  const frozen = deepFreeze(deepClone(input));
  const snapshot = JSON.stringify(frozen);

  let first: ActionRadarViewModel;
  let second: ActionRadarViewModel;
  try {
    first = impl.buildActionRadarViewModel(frozen);
    second = impl.buildActionRadarViewModel(frozen);
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (expected.noNetworkCalls === true) {
    col.isTrue(
      'tidak ada percobaan akses jaringan saat runtime',
      networkAttempts === 0,
      `${networkAttempts} percobaan`,
    );
  }
  if (expected.noWriteBack === true) {
    col.isTrue(
      'input tidak dimutasi (write-back)',
      JSON.stringify(frozen) === snapshot,
      'struktur input identik sebelum dan sesudah',
    );
  }
  if (expected.isPureFunction === true) {
    col.isTrue(
      'deterministik (dua pemanggilan identik hasilnya sama)',
      JSON.stringify(first) === JSON.stringify(second),
      'output konsisten',
    );
  }
}

// ===========================================================================
// Self-check file checkpoint — menjaga metadata tetap sinkron dengan isinya
// ===========================================================================

function runSelfCheck(): Assertion[] {
  const col = createCollector(0);
  const { meta, testCases } = checkpoint;

  col.eq('meta.totalCases sesuai jumlah case', testCases.length, meta.totalCases);

  const ids = testCases.map((t) => t.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  col.isTrue('tidak ada id duplikat', dupes.length === 0, dupes.join(', ') || 'unik');

  const requiredFields = ['id', 'function', 'specRef', 'category', 'priority', 'description', 'input', 'expected'];
  const incomplete = testCases
    .filter((t) => requiredFields.some((f) => !(f in t)))
    .map((t) => t.id);
  col.isTrue('semua case punya field wajib', incomplete.length === 0, incomplete.join(', ') || 'lengkap');

  const countBy = (key: 'function' | 'category'): Record<string, number> =>
    testCases.reduce<Record<string, number>>((acc, t) => {
      acc[t[key]] = (acc[t[key]] ?? 0) + 1;
      return acc;
    }, {});

  col.eq('meta.coverageByFunction akurat', countBy('function'), meta.coverageByFunction);
  col.eq('meta.coverageByCategory akurat', countBy('category'), meta.coverageByCategory);

  const listedIds = new Set(
    Object.entries(meta.regressionCoverage)
      .filter(([k]) => k !== 'note')
      .flatMap(([, v]) => (Array.isArray(v) ? v : [])),
  );
  const taggedIds = new Set(testCases.filter((t) => t.regressionFor !== undefined).map((t) => t.id));

  const phantom = [...listedIds].filter((id) => !ids.includes(id));
  col.isTrue('id di regressionCoverage semuanya ada', phantom.length === 0, phantom.join(', ') || 'valid');

  const unlisted = [...taggedIds].filter((id) => !listedIds.has(id));
  col.isTrue(
    'setiap case bertanda regressionFor tercantum di meta',
    unlisted.length === 0,
    unlisted.join(', ') || 'terpetakan semua',
  );

  return col.assertions;
}

// ===========================================================================
// Pelaporan
// ===========================================================================

const ICON: Record<CaseStatus, string> = {
  PASS: c.green('PASS'),
  FAIL: c.red('FAIL'),
  NOT_IMPLEMENTED: c.yellow('TODO'),
  ERROR: c.red('ERR '),
  SKIPPED: c.grey('SKIP'),
};

function report(results: CaseResult[], selfCheck: Assertion[], durationMs: number): number {
  console.log('');
  console.log(c.bold(`${checkpoint.meta.name} v${checkpoint.meta.version}`));
  console.log(c.grey(`Turunan dari ${checkpoint.meta.derivedFrom} · implementasi: ${options.implPath}`));
  console.log('');

  // --- Self-check ---
  const selfFailed = selfCheck.filter((a) => !a.pass);
  console.log(c.bold('Self-check file checkpoint'));
  if (selfFailed.length === 0) {
    console.log(`  ${c.green('OK')} ${selfCheck.length} pemeriksaan metadata lulus`);
  } else {
    for (const a of selfFailed) console.log(`  ${c.red('x')} ${a.label}: ${a.detail}`);
  }
  if (options.verbose) {
    for (const a of selfCheck.filter((x) => x.pass)) {
      console.log(`  ${c.grey('·')} ${c.grey(a.label)}`);
    }
  }
  console.log('');

  // --- Hasil per fungsi ---
  const byFunction = new Map<string, CaseResult[]>();
  for (const r of results) {
    const list = byFunction.get(r.testCase.function) ?? [];
    list.push(r);
    byFunction.set(r.testCase.function, list);
  }

  for (const [fnName, list] of byFunction) {
    const failedCount = list.filter((r) => r.status !== 'PASS').length;
    const header = `${fnName} ${c.grey(`(${list.length} case)`)}`;
    console.log(failedCount === 0 ? c.bold(header) : c.bold(header) + ' ' + c.red(`${failedCount} bermasalah`));

    for (const r of list) {
      const { id, description, category, priority } = r.testCase;
      const tag = category === 'zero-division' || priority === 'critical' ? c.blue(`[${category}]`) : c.grey(`[${category}]`);
      console.log(`  ${ICON[r.status]} ${id.padEnd(12)} ${tag} ${description}`);

      if (r.status === 'NOT_IMPLEMENTED') {
        console.log(`       ${c.yellow('belum diimplementasi')} ${c.grey(r.testCase.specRef)}`);
      } else if (r.status === 'ERROR' || r.status === 'SKIPPED') {
        console.log(`       ${c.red(r.error ?? 'error tanpa pesan')}`);
      } else {
        for (const a of r.assertions) {
          if (!a.pass) {
            console.log(`       ${c.red('x')} ${a.label}: ${a.detail}`);
          } else if (options.verbose) {
            console.log(`       ${c.grey('·')} ${c.grey(`${a.label}: ${a.detail}`)}`);
          }
        }
        if (r.status === 'FAIL') {
          console.log(`       ${c.grey(`acuan: ${r.testCase.specRef}`)}`);
          if (r.testCase.regressionFor) {
            console.log(`       ${c.grey(`regresi: ${r.testCase.regressionFor}`)}`);
          }
        }
      }
    }
    console.log('');
  }

  // --- Ringkasan ---
  const tally = (s: CaseStatus) => results.filter((r) => r.status === s).length;
  const passed = tally('PASS');
  const total = results.length;
  const assertionCount = results.reduce((n, r) => n + r.assertions.length, 0);

  console.log(c.bold('Ringkasan'));
  console.log(`  Case      : ${passed}/${total} lulus`);
  console.log(`  Assertion : ${assertionCount} dijalankan`);
  const parts: string[] = [];
  if (tally('FAIL') > 0) parts.push(c.red(`${tally('FAIL')} gagal`));
  if (tally('NOT_IMPLEMENTED') > 0) parts.push(c.yellow(`${tally('NOT_IMPLEMENTED')} belum diimplementasi`));
  if (tally('ERROR') > 0) parts.push(c.red(`${tally('ERROR')} error`));
  if (tally('SKIPPED') > 0) parts.push(c.grey(`${tally('SKIPPED')} terlewat`));
  if (parts.length > 0) console.log(`  Status    : ${parts.join(', ')}`);
  console.log(`  Durasi    : ${durationMs.toFixed(0)} ms`);

  // Sorotan case kritis yang belum lulus — ini yang harus dibereskan lebih dulu.
  const criticalFailing = results.filter(
    (r) => r.status !== 'PASS' && r.testCase.priority === 'critical',
  );
  if (criticalFailing.length > 0) {
    console.log('');
    console.log(c.bold(`Prioritas critical yang belum lulus (${criticalFailing.length})`));
    for (const r of criticalFailing.slice(0, 10)) {
      console.log(`  ${c.grey('-')} ${r.testCase.id.padEnd(12)} ${r.testCase.description}`);
    }
    if (criticalFailing.length > 10) {
      console.log(`  ${c.grey(`... dan ${criticalFailing.length - 10} lainnya`)}`);
    }
  }

  console.log('');
  const allGreen = passed === total && selfFailed.length === 0;
  console.log(
    allGreen
      ? c.green(c.bold('CHECKPOINT LULUS — implementasi sesuai TECH_SPEC.md'))
      : c.red(c.bold('CHECKPOINT BELUM LULUS')),
  );
  console.log('');

  return allGreen ? 0 : 1;
}

// ===========================================================================
// Adapter modul implementasi
// ===========================================================================

/**
 * Menyesuaikan modul implementasi ke kontrak `Implementation` yang dipakai dispatcher.
 *
 * Checkpoint menyebut entry point pipeline sebagai `buildActionRadarViewModel`, sedangkan
 * src/lib/logic.ts menamainya `buildViewModelFromSampleData`. Keduanya menerima SampleData
 * dan mengembalikan ActionRadarViewModel, jadi cukup dipetakan di sini — bukan dengan
 * mengubah kode aplikasi atau melemahkan test case.
 */
function adaptModule(mod: Record<string, unknown>): Implementation {
  const pipeline =
    mod.buildActionRadarViewModel ?? mod.buildViewModelFromSampleData ?? mod.buildViewModel;

  return {
    ...(mod as unknown as Implementation),
    buildActionRadarViewModel: pipeline as Implementation['buildActionRadarViewModel'],
  };
}

// ===========================================================================
// Main
// ===========================================================================

async function main(): Promise<void> {
  const started = performance.now();

  const implAbsPath = resolve(HERE, options.implPath);
  let impl: Implementation;
  let implSource: string;

  try {
    const mod = (await import(pathToFileURL(implAbsPath).href)) as Record<string, unknown>;
    impl = adaptModule(mod);
    implSource = readFileSync(implAbsPath, 'utf8');
  } catch (err) {
    console.error(c.red(`Gagal memuat implementasi dari ${implAbsPath}`));
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  const missing = (
    [
      'calculateRunratePerJam',
      'calculateJamSampaiHabis',
      'getStockStatus',
      'getMarginStatus',
      'getOverallStatus',
      'sortByPriority',
      'calculateBudgetSafe',
      'generateRecommendation',
      'buildActionRadarViewModel',
    ] as const
  ).filter((name) => typeof (impl as unknown as Record<string, unknown>)[name] !== 'function');

  if (missing.length > 0) {
    console.error(c.red(`Modul implementasi tidak mengekspor: ${missing.join(', ')}`));
    process.exit(2);
  }

  const selected = checkpoint.testCases.filter((tc) => {
    if (options.filter && !tc.id.includes(options.filter)) return false;
    if (options.category && tc.category !== options.category) return false;
    if (options.priority && tc.priority !== options.priority) return false;
    if (options.functionName && tc.function !== options.functionName) return false;
    return true;
  });

  if (selected.length === 0) {
    console.error(c.yellow('Tidak ada test case yang cocok dengan filter yang diberikan.'));
    process.exit(2);
  }

  const results: CaseResult[] = [];
  for (const tc of selected) {
    const result = runTestCase(tc, impl, implSource);
    results.push(result);
    if (options.bail && result.status !== 'PASS') break;
  }

  const exitCode = report(results, runSelfCheck(), performance.now() - started);
  process.exit(exitCode);
}

await main();
