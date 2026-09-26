import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

describe('Electron Shell & Native Preload Bridge (Ticket #9)', () => {
  it('verifies electron source files exist with required symbols', () => {
    const mainPath = resolve(process.cwd(), 'workstation/electron/main.ts');
    const preloadPath = resolve(process.cwd(), 'workstation/electron/preload.ts');

    assert.ok(existsSync(mainPath), 'main.ts must exist');
    assert.ok(existsSync(preloadPath), 'preload.ts must exist');

    const mainContent = readFileSync(mainPath, 'utf8');
    assert.ok(mainContent.includes('BrowserWindow'), 'main.ts must instantiate BrowserWindow');
    assert.ok(mainContent.includes('app.whenReady'), 'main.ts must handle app.whenReady');
    assert.ok(mainContent.includes('EngineServer'), 'main.ts must integrate EngineServer');
    assert.ok(mainContent.includes('ipcMain'), 'main.ts must configure ipcMain handlers');

    const preloadContent = readFileSync(preloadPath, 'utf8');
    assert.ok(preloadContent.includes('contextBridge'), 'preload.ts must use contextBridge');
    assert.ok(preloadContent.includes('electronStorage'), 'preload.ts must expose electronStorage');
    assert.ok(preloadContent.includes('electronNotifications'), 'preload.ts must expose electronNotifications');
    assert.ok(preloadContent.includes('electronDialogs'), 'preload.ts must expose electronDialogs');
    assert.ok(preloadContent.includes('electronShell'), 'preload.ts must expose electronShell');
  });

  it('verifies electron build script is configured in package.json', () => {
    const pkgPath = resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.scripts['build:electron'], 'package.json must have build:electron script');
    assert.equal(pkg.main, 'dist/electron/main.cjs', 'package.json main must point to dist/electron/main.cjs');
  });

  it('verifies compiling electron bundles into a fresh directory produces valid cjs artifacts', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lens-electron-build-'));
    try {
      execSync(
        `npx esbuild workstation/electron/main.ts workstation/electron/preload.ts --bundle --platform=node --outdir="${tempDir}" --out-extension:.js=.cjs --external:electron`,
        { stdio: 'pipe' }
      );

      const mainDist = join(tempDir, 'main.cjs');
      const preloadDist = join(tempDir, 'preload.cjs');

      assert.ok(existsSync(mainDist), 'main.cjs must exist in build output');
      assert.ok(existsSync(preloadDist), 'preload.cjs must exist in build output');
      assert.ok(readFileSync(mainDist, 'utf8').length > 100);
      assert.ok(readFileSync(preloadDist, 'utf8').length > 100);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
