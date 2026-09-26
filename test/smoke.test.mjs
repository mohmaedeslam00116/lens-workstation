import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('LENS Workstation Scaffolding Smoke Test', () => {
  it('verifies Node runtime environment and test runner sanity', () => {
    assert.equal(typeof process.version, 'string');
    assert.ok(process.version.startsWith('v2'));
  });

  it('verifies root package.json exists and has expected scripts', () => {
    const pkgPath = resolve(process.cwd(), 'package.json');
    assert.ok(existsSync(pkgPath), 'package.json must exist');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, 'lens-workstation');
    assert.ok(pkg.scripts, 'scripts object must exist');
    assert.ok(pkg.scripts.test, 'test script must exist');
    assert.ok(pkg.scripts.build, 'build script must exist');
    assert.ok(pkg.scripts['typecheck'], 'typecheck script must exist');
  });

  it('verifies tsconfig.json and tsconfig.node.json exist and are valid JSON', () => {
    const tsconfigPath = resolve(process.cwd(), 'tsconfig.json');
    assert.ok(existsSync(tsconfigPath), 'tsconfig.json must exist');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    assert.ok(tsconfig.compilerOptions, 'compilerOptions must be configured');

    const nodeTsconfigPath = resolve(process.cwd(), 'tsconfig.node.json');
    assert.ok(existsSync(nodeTsconfigPath), 'tsconfig.node.json must exist');
    const nodeTsconfig = JSON.parse(readFileSync(nodeTsconfigPath, 'utf8'));
    assert.ok(nodeTsconfig.compilerOptions, 'compilerOptions must be configured in tsconfig.node.json');
  });

  it('verifies frontend build configs (vite, tailwind, index.html) exist', () => {
    assert.ok(existsSync(resolve(process.cwd(), 'vite.config.ts')), 'vite.config.ts must exist');
    assert.ok(existsSync(resolve(process.cwd(), 'tailwind.config.js')), 'tailwind.config.js must exist');
    assert.ok(existsSync(resolve(process.cwd(), 'postcss.config.js')), 'postcss.config.js must exist');
    assert.ok(existsSync(resolve(process.cwd(), 'index.html')), 'index.html must exist');
    assert.ok(existsSync(resolve(process.cwd(), 'workstation/src/App.tsx')), 'App.tsx must exist');
    assert.ok(existsSync(resolve(process.cwd(), 'workstation/src/main.tsx')), 'main.tsx must exist');
  });

  it('verifies engine core scaffolding exists', () => {
    assert.ok(existsSync(resolve(process.cwd(), 'engine/core/types.ts')), 'engine/core/types.ts must exist');
  });
});
