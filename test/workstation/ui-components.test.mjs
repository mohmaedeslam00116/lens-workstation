import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

describe('React Workstation UI — Agent Canvas & Auxiliary Pane (Ticket #10)', () => {
  let tempDir;
  let Header;
  let AgentCanvas;
  let PromptInput;
  let AuxiliaryPane;

  before(async () => {
    tempDir = resolve(process.cwd(), '.lens-ui-test-dist');
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    esbuild.buildSync({
      entryPoints: [
        'workstation/src/components/Header.tsx',
        'workstation/src/components/AgentCanvas.tsx',
        'workstation/src/components/PromptInput.tsx',
        'workstation/src/components/AuxiliaryPane.tsx',
      ],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outdir: tempDir,
      outExtension: { '.js': '.mjs' },
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'lucide-react',
        '@monaco-editor/react',
        '../types',
      ],
    });

    const headerMod = await import(pathToFileURL(join(tempDir, 'Header.mjs')));
    Header = headerMod.Header;

    const canvasMod = await import(pathToFileURL(join(tempDir, 'AgentCanvas.mjs')));
    AgentCanvas = canvasMod.AgentCanvas;

    const promptMod = await import(pathToFileURL(join(tempDir, 'PromptInput.mjs')));
    PromptInput = promptMod.PromptInput;

    const auxMod = await import(pathToFileURL(join(tempDir, 'AuxiliaryPane.mjs')));
    AuxiliaryPane = auxMod.AuxiliaryPane;
  });

  after(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('renders Header with connection indicator, workspace selector, and capability badges across English and Arabic', () => {
    const enHtml = renderToStaticMarkup(
      React.createElement(Header, {
        workspace: 'D:/work/repo',
        onSelectWorkspace: () => {},
        capability: 'READ_ONLY_INSPECTION',
        onToggleCapability: () => {},
        language: 'en',
        onToggleLanguage: () => {},
        paneOpen: true,
        onTogglePane: () => {},
        connected: true,
      })
    );
    assert.ok(enHtml.includes('LENS WORKSTATION'), 'Header must contain brand title');
    assert.ok(enHtml.includes('ENGINE ONLINE'), 'Header must display online status');
    assert.ok(enHtml.includes('READ_ONLY_INSPECTION'), 'Header must display read-only capability badge');
    assert.ok(enHtml.includes('repo'), 'Header must display workspace directory basename');

    const arHtml = renderToStaticMarkup(
      React.createElement(Header, {
        workspace: '',
        onSelectWorkspace: () => {},
        capability: 'WORKSPACE_MUTATION',
        onToggleCapability: () => {},
        language: 'ar',
        onToggleLanguage: () => {},
        paneOpen: false,
        onTogglePane: () => {},
        connected: false,
      })
    );
    assert.ok(arHtml.includes('غير متصل'), 'Header AR must display disconnected status');
    assert.ok(arHtml.includes('تعديل مساحة العمل'), 'Header AR must display mutation capability badge');
    assert.ok(arHtml.includes('اختر مساحة العمل'), 'Header AR must display workspace selection placeholder');
  });

  it('renders AgentCanvas with thinking streams, tool approval checkpoints, and execution cards', () => {
    const canvasHtml = renderToStaticMarkup(
      React.createElement(AgentCanvas, {
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            content: 'Turn completed with 0 errors.',
            thoughts: [
              {
                id: 'th-1',
                text: 'Analyzing syntax trees and dependency graphs...',
                collapsed: false,
                durationMs: 320,
              },
            ],
            tools: [
              {
                id: 'tool-exec-1',
                name: 'execute_command',
                type: 'mutating',
                args: { command: 'npm test' },
                status: 'waiting_approval',
              },
            ],
            timestamp: Date.now(),
          },
        ],
        language: 'en',
        onApproveTool: () => {},
        onRejectTool: () => {},
      })
    );

    assert.ok(canvasHtml.includes('Analyzing syntax trees'), 'Canvas must render thought stream text');
    assert.ok(canvasHtml.includes('APPROVAL REQUIRED'), 'Canvas must render approval banner for mutating tool');
    assert.ok(canvasHtml.includes('Approve &amp; Execute'), 'Canvas must render Approve button');
    assert.ok(canvasHtml.includes('Reject'), 'Canvas must render Reject button');
    assert.ok(canvasHtml.includes('execute_command'), 'Canvas must render tool name');
  });

  it('renders AuxiliaryPane with clamped diff indices, revert/accept actions, and localized tabs', () => {
    const diffFiles = [
      { path: 'src/main.ts', original: 'const a = 1;', modified: 'const a = 2;' },
      { path: 'src/helper.ts', original: 'const b = 1;', modified: 'const b = 2;' },
    ];

    const diffHtml = renderToStaticMarkup(
      React.createElement(AuxiliaryPane, {
        isOpen: true,
        onClose: () => {},
        activeTab: 'diff',
        onSelectTab: () => {},
        diffFiles,
        terminalLogs: [],
        evidenceItems: [],
        language: 'ar',
        onAcceptDiff: () => {},
        onRejectDiff: () => {},
        onClearTerminal: () => {},
      })
    );

    assert.ok(diffHtml.includes('الفروقات (2)'), 'AuxiliaryPane must display localized diff count');
    assert.ok(diffHtml.includes('تراجع'), 'AuxiliaryPane must display localized Revert button');
    assert.ok(diffHtml.includes('قبول'), 'AuxiliaryPane must display localized Accept button');
    assert.ok(diffHtml.includes('main.ts'), 'AuxiliaryPane must display diff filenames');

    // Terminal tab rendering
    const termHtml = renderToStaticMarkup(
      React.createElement(AuxiliaryPane, {
        isOpen: true,
        onClose: () => {},
        activeTab: 'terminal',
        onSelectTab: () => {},
        diffFiles: [],
        terminalLogs: [
          { id: 'log-1', type: 'stdout', text: 'Tests 44/44 passed.', timestamp: Date.now() },
          { id: 'log-2', type: 'stderr', text: 'Warning: Deprecated API', timestamp: Date.now() },
        ],
        evidenceItems: [],
        language: 'en',
      })
    );
    assert.ok(termHtml.includes('Sanitized Process Runner Output'), 'Terminal tab must render header');
    assert.ok(termHtml.includes('Tests 44/44 passed.'), 'Terminal tab must render stdout');
    assert.ok(termHtml.includes('Warning: Deprecated API'), 'Terminal tab must render stderr');

    // Evidence tab rendering with untrusted external badge and safe url validation
    const evidenceHtml = renderToStaticMarkup(
      React.createElement(AuxiliaryPane, {
        isOpen: true,
        onClose: () => {},
        activeTab: 'evidence',
        onSelectTab: () => {},
        diffFiles: [],
        terminalLogs: [],
        evidenceItems: [
          {
            id: 'ev-1',
            title: 'ADR-0004 Dual Surface Architecture',
            source: 'docs/adr/0004.md',
            snippet: 'Thin Electron Shell + React 18 Canvas UI',
            url: 'https://github.com/mohmaedeslam00116/lens-workstation',
          },
          {
            id: 'ev-2',
            title: 'Suspicious Scheme',
            source: 'docs/research.md',
            snippet: 'Dangerous local scheme link',
            url: 'javascript:alert(1)',
          },
        ],
        language: 'ar',
      })
    );
    assert.ok(evidenceHtml.includes('مصدر خارجي'), 'Evidence tab must render untrusted provenance badge');
    assert.ok(evidenceHtml.includes('ADR-0004 Dual Surface Architecture'), 'Evidence tab must render title');
    assert.ok(evidenceHtml.includes('https://github.com/mohmaedeslam00116/lens-workstation'), 'Valid HTTPS URL must be rendered as link');
    assert.ok(!evidenceHtml.includes('javascript:alert(1)'), 'Dangerous non-HTTP schemes must be filtered out');
  });

  it('renders PromptInput with bilingual placeholders, slash commands toolbar, and capability indicator', () => {
    const enPrompt = renderToStaticMarkup(
      React.createElement(PromptInput, {
        onSend: () => {},
        disabled: false,
        language: 'en',
        capability: 'READ_ONLY_INSPECTION',
      })
    );
    assert.ok(enPrompt.includes('commands'), 'PromptInput must display commands button');
    assert.ok(enPrompt.includes('files'), 'PromptInput must display files button');
    assert.ok(enPrompt.includes('Read-Only Mode'), 'PromptInput must display read-only status');

    const arPrompt = renderToStaticMarkup(
      React.createElement(PromptInput, {
        onSend: () => {},
        disabled: false,
        language: 'ar',
        capability: 'WORKSPACE_MUTATION',
      })
    );
    assert.ok(arPrompt.includes('الأوامر'), 'PromptInput AR must display localized commands button');
    assert.ok(arPrompt.includes('الملفات'), 'PromptInput AR must display localized files button');
    assert.ok(arPrompt.includes('صلاحية التعديل مفعلة'), 'PromptInput AR must display localized mutation status');
  });
});
