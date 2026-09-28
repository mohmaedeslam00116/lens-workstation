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
  let SettingsModal;
  let AutonomyModeToggle;
  let SubagentCard;
  let SubagentInspectorDrawer;
  let EvidenceDrawer;

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
        'workstation/src/components/SettingsModal.tsx',
        'workstation/src/components/AutonomyModeToggle.tsx',
        'workstation/src/components/SubagentCard.tsx',
        'workstation/src/components/SubagentInspectorDrawer.tsx',
        'workstation/src/components/EvidenceDrawer.tsx',
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

    const settingsMod = await import(pathToFileURL(join(tempDir, 'SettingsModal.mjs')));
    SettingsModal = settingsMod.SettingsModal;

    const toggleMod = await import(pathToFileURL(join(tempDir, 'AutonomyModeToggle.mjs')));
    AutonomyModeToggle = toggleMod.AutonomyModeToggle;

    const cardMod = await import(pathToFileURL(join(tempDir, 'SubagentCard.mjs')));
    SubagentCard = cardMod.SubagentCard;

    const drawerMod = await import(pathToFileURL(join(tempDir, 'SubagentInspectorDrawer.mjs')));
    SubagentInspectorDrawer = drawerMod.SubagentInspectorDrawer;

    const evidenceMod = await import(pathToFileURL(join(tempDir, 'EvidenceDrawer.mjs')));
    EvidenceDrawer = evidenceMod.EvidenceDrawer;
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

  it('renders Header with Settings button when onOpenSettings callback is provided', () => {
    const headerHtml = renderToStaticMarkup(
      React.createElement(Header, {
        workspace: 'my-project',
        onSelectWorkspace: () => {},
        capability: 'READ_ONLY_INSPECTION',
        onToggleCapability: () => {},
        language: 'en',
        onToggleLanguage: () => {},
        paneOpen: true,
        onTogglePane: () => {},
        connected: true,
        onOpenSettings: () => {},
      })
    );
    assert.ok(headerHtml.includes('Settings'), 'Header must render Settings button');
  });

  it('renders SettingsModal with provider profiles, API key inputs, and bilingual labels', () => {
    const modalHtmlEn = renderToStaticMarkup(
      React.createElement(SettingsModal, {
        isOpen: true,
        onClose: () => {},
        language: 'en',
      })
    );
    assert.ok(modalHtmlEn.includes('Model Providers &amp; Gateway Settings') || modalHtmlEn.includes('Model Providers & Gateway Settings'));
    assert.ok(modalHtmlEn.includes('Kilo Gateway'), 'Must render Kilo Gateway profile');
    assert.ok(modalHtmlEn.includes('OpenCode'), 'Must render OpenCode profile');
    assert.ok(modalHtmlEn.includes('Cline / OpenRouter'), 'Must render Cline profile');
    assert.ok(modalHtmlEn.includes('Google Gemini'), 'Must render Gemini profile');
    assert.ok(modalHtmlEn.includes('Save &amp; Activate') || modalHtmlEn.includes('Save & Activate'));

    // Arabic
    const modalHtmlAr = renderToStaticMarkup(
      React.createElement(SettingsModal, {
        isOpen: true,
        onClose: () => {},
        language: 'ar',
      })
    );
    assert.ok(modalHtmlAr.includes('إعدادات النماذج وبوابات الذكاء الاصطناعي'));
    assert.ok(modalHtmlAr.includes('حفظ وتفعيل'));

    // Hidden when isOpen is false
    const hiddenModal = renderToStaticMarkup(
      React.createElement(SettingsModal, {
        isOpen: false,
        onClose: () => {},
        language: 'en',
      })
    );
    assert.equal(hiddenModal, '');
  });

  it('renders AutonomyModeToggle in Supervised and Autonomous (YOLO) modes across English and Arabic', () => {
    // English Supervised
    const htmlSupEn = renderToStaticMarkup(
      React.createElement(AutonomyModeToggle, {
        mode: 'supervised',
        onToggle: () => {},
        language: 'en',
      })
    );
    assert.ok(htmlSupEn.includes('Supervised'));

    // English Autonomous (YOLO)
    const htmlAutoEn = renderToStaticMarkup(
      React.createElement(AutonomyModeToggle, {
        mode: 'autonomous',
        onToggle: () => {},
        language: 'en',
      })
    );
    assert.ok(htmlAutoEn.includes('Autonomous (YOLO)'));

    // Arabic Supervised
    const htmlSupAr = renderToStaticMarkup(
      React.createElement(AutonomyModeToggle, {
        mode: 'supervised',
        onToggle: () => {},
        language: 'ar',
      })
    );
    assert.ok(htmlSupAr.includes('بإشراف'));

    // Arabic Autonomous (YOLO)
    const htmlAutoAr = renderToStaticMarkup(
      React.createElement(AutonomyModeToggle, {
        mode: 'autonomous',
        onToggle: () => {},
        language: 'ar',
      })
    );
    assert.ok(htmlAutoAr.includes('مستقل (YOLO)'));
  });

  it('renders instant STOP button in Header and PromptInput when turn is actively processing', () => {
    // Header processing
    const headerProcessingHtml = renderToStaticMarkup(
      React.createElement(Header, {
        workspace: '/test/workspace',
        onSelectWorkspace: () => {},
        capability: 'READ_ONLY_INSPECTION',
        onToggleCapability: () => {},
        autonomyMode: 'autonomous',
        onToggleAutonomyMode: () => {},
        isProcessing: true,
        onStopTurn: () => {},
        language: 'en',
        onToggleLanguage: () => {},
        paneOpen: true,
        onTogglePane: () => {},
        connected: true,
      })
    );
    assert.ok(headerProcessingHtml.includes('STOP'), 'Header must render STOP button during processing');
    assert.ok(headerProcessingHtml.includes('Autonomous (YOLO)'));

    // PromptInput processing
    const promptProcessingHtml = renderToStaticMarkup(
      React.createElement(PromptInput, {
        onSend: () => {},
        language: 'en',
        capability: 'READ_ONLY_INSPECTION',
        autonomyMode: 'supervised',
        onToggleAutonomyMode: () => {},
        isProcessing: true,
        onStop: () => {},
      })
    );
    assert.ok(promptProcessingHtml.includes('Stop'), 'PromptInput must render Stop button during processing');

    // PromptInput idle (not processing)
    const promptIdleHtml = renderToStaticMarkup(
      React.createElement(PromptInput, {
        onSend: () => {},
        language: 'en',
        capability: 'READ_ONLY_INSPECTION',
        autonomyMode: 'supervised',
        onToggleAutonomyMode: () => {},
        isProcessing: false,
      })
    );
    assert.ok(!promptIdleHtml.includes('Stop'), 'PromptInput must not render Stop button when idle');
  });

  it('renders SubagentCard with role badge, animated status, live stateDetail, deep link, and elapsed timer across English and Arabic', () => {
    // 1. English Running Research Subagent
    const runningSubagent = {
      id: 'sub-research-101',
      role: 'Autonomous Researcher',
      type: 'research',
      prompt: 'Investigate AST transformation libraries',
      status: 'running',
      stateDetail: 'Fetching https://api.github.com/repos/babel/babel...',
      startTime: Date.now() - 4500,
    };

    const enRunningHtml = renderToStaticMarkup(
      React.createElement(SubagentCard, {
        subagent: runningSubagent,
        language: 'en',
        onInspect: () => {},
        onKill: () => {},
      })
    );

    assert.ok(enRunningHtml.includes('Autonomous Researcher'), 'Must render subagent role');
    assert.ok(enRunningHtml.includes('RESEARCH'), 'Must render RESEARCH archetype badge');
    assert.ok(enRunningHtml.includes('RUNNING'), 'Must render RUNNING status badge');
    assert.ok(enRunningHtml.includes('Fetching https://api.github.com/repos/babel/babel...'), 'Must render live stateDetail');
    assert.ok(enRunningHtml.includes('lens://conversation/sub-research-101'), 'Must render deep-link URI');
    assert.ok(enRunningHtml.includes('Inspect'), 'Must render inspect button');
    assert.ok(enRunningHtml.includes('Stop'), 'Must render stop button for running subagent');

    // 2. Arabic Completed Code Reviewer Subagent
    const completedSubagent = {
      id: 'sub-reviewer-202',
      role: 'مراجع الكود الأمني',
      type: 'code_reviewer',
      prompt: 'فحص ثغرات الحقن في محرك الأوامر',
      status: 'completed',
      stateDetail: 'تم اكتمال الفحص وتوثيق التوصيات',
      startTime: Date.now() - 15000,
      endTime: Date.now(),
      durationMs: 15000,
    };

    const arCompletedHtml = renderToStaticMarkup(
      React.createElement(SubagentCard, {
        subagent: completedSubagent,
        language: 'ar',
        onInspect: () => {},
      })
    );

    assert.ok(arCompletedHtml.includes('مراجع الكود الأمني'));
    assert.ok(arCompletedHtml.includes('مراجعة كود'));
    assert.ok(arCompletedHtml.includes('مكتمل'));
    assert.ok(arCompletedHtml.includes('15.0s'));
    assert.ok(arCompletedHtml.includes('فحص المجريات'));
    assert.ok(arCompletedHtml.includes('lens://conversation/sub-reviewer-202'));

    // 3. Failed & Killed states
    const failedHtml = renderToStaticMarkup(
      React.createElement(SubagentCard, {
        subagent: {
          id: 'sub-303',
          role: 'General Worker',
          type: 'general',
          status: 'failed',
          startTime: Date.now() - 2000,
          durationMs: 2000,
          error: 'Network timeout',
        },
        language: 'en',
      })
    );
    assert.ok(failedHtml.includes('FAILED'));
    assert.ok(failedHtml.includes('GENERAL'));

    const killedHtml = renderToStaticMarkup(
      React.createElement(SubagentCard, {
        subagent: {
          id: 'sub-404',
          role: 'General Worker',
          type: 'general',
          status: 'killed',
          startTime: Date.now() - 3000,
          durationMs: 3000,
        },
        language: 'en',
      })
    );
    assert.ok(killedHtml.includes('STOPPED'));
  });

  it('renders SubagentCard inside AgentCanvas when invoke_subagent tool is executed', () => {
    const messages = [
      {
        id: 'msg-sub-1',
        role: 'assistant',
        content: 'I have delegated the research task to a background subagent.',
        timestamp: Date.now(),
        tools: [
          {
            id: 'call-sub-1',
            name: 'invoke_subagent',
            type: 'read_only',
            args: {
              role: 'Deep Docs Explorer',
              type: 'research',
              prompt: 'Search docs for WebSocket reconnection strategies',
            },
            status: 'running',
          },
        ],
      },
    ];

    const canvasHtml = renderToStaticMarkup(
      React.createElement(AgentCanvas, {
        messages,
        language: 'en',
        onApproveTool: () => {},
        onRejectTool: () => {},
      })
    );

    assert.ok(canvasHtml.includes('Deep Docs Explorer'), 'AgentCanvas must render subagent role');
    assert.ok(canvasHtml.includes('RESEARCH'), 'AgentCanvas must render archetype badge');
    assert.ok(canvasHtml.includes('lens://conversation/sub-call-sub-1'), 'AgentCanvas must render deep link');
  });

  it('renders SubagentInspectorDrawer with live transcript stream, thought blocks, and tool executions', () => {
    // 1. Hidden when isOpen is false or subagent is null
    const hiddenDrawer = renderToStaticMarkup(
      React.createElement(SubagentInspectorDrawer, {
        isOpen: false,
        subagent: null,
        transcript: [],
        onClose: () => {},
        language: 'en',
      })
    );
    assert.equal(hiddenDrawer, '');

    // 2. Open drawer with active subagent and rich transcript entries
    const subagent = {
      id: 'subagent-inspect-555',
      role: 'AST Deep Analyzer',
      type: 'code_reviewer',
      prompt: 'Review all TypeScript exports and AST traversal hooks',
      status: 'running',
      stateDetail: 'Analyzing syntax trees...',
      startTime: Date.now() - 8200,
    };

    const transcript = [
      {
        stepIndex: 1,
        type: 'thought',
        thought: 'First, I will inspect package.json to identify all dependencies.',
      },
      {
        stepIndex: 2,
        type: 'tool_call',
        toolName: 'read_file',
        args: { path: 'package.json' },
        stateDetail: 'read_file: package.json',
      },
      {
        stepIndex: 3,
        type: 'tool_result',
        toolName: 'read_file',
        result: '{ "name": "lens-workstation", "version": "0.1.0" }',
      },
      {
        stepIndex: 4,
        type: 'assistant',
        content: 'Verified that lens-workstation is at v0.1.0.',
      },
    ];

    const drawerHtml = renderToStaticMarkup(
      React.createElement(SubagentInspectorDrawer, {
        isOpen: true,
        subagent,
        transcript,
        onClose: () => {},
        onKill: () => {},
        language: 'en',
      })
    );

    assert.ok(drawerHtml.includes('AST Deep Analyzer'), 'Must render drawer title');
    assert.ok(drawerHtml.includes('CODE_REVIEWER'), 'Must render archetype badge');
    assert.ok(drawerHtml.includes('lens://conversation/subagent-inspect-555'), 'Must render deep-link');
    assert.ok(drawerHtml.includes('Review all TypeScript exports'), 'Must render assigned task');
    assert.ok(drawerHtml.includes('Thinking Step'), 'Must render thought block');
    assert.ok(drawerHtml.includes('First, I will inspect package.json'), 'Must render thought content');
    assert.ok(drawerHtml.includes('TOOL CALL'), 'Must render tool call banner');
    assert.ok(drawerHtml.includes('read_file'), 'Must render tool name');
    assert.ok(drawerHtml.includes('SUCCESS'), 'Must render tool result success badge');
    assert.ok(drawerHtml.includes('Verified that lens-workstation is at v0.1.0.'), 'Must render assistant content');
    assert.ok(drawerHtml.includes('4 steps'), 'Must render step counter');

    // 3. Arabic Drawer
    const arDrawerHtml = renderToStaticMarkup(
      React.createElement(SubagentInspectorDrawer, {
        isOpen: true,
        subagent,
        transcript: [],
        onClose: () => {},
        language: 'ar',
      })
    );
    assert.ok(arDrawerHtml.includes('المهمة المكلف بها:'));
    assert.ok(arDrawerHtml.includes('في انتظار وصول أولى خطوات التنفيذ والتفكير...'));
    assert.ok(arDrawerHtml.includes('0 خطوة'));
  });

  it('renders EvidenceDrawer with verified citations, contradiction warnings, and bilingual layout across English and Arabic', () => {
    // 1. Closed state returns null
    const closedHtml = renderToStaticMarkup(
      React.createElement(EvidenceDrawer, {
        isOpen: false,
        onClose: () => {},
        excerpts: [],
        language: 'en',
      })
    );
    assert.equal(closedHtml, '', 'Closed drawer should render null');

    const sampleExcerpts = [
      {
        index: 1,
        bracket: '[1]',
        chunkId: 'chunk-1',
        milestoneId: 'milestone-tech',
        text: 'LENS autonomous research engine utilizes Okapi BM25 and linkedom extraction.',
        sourceUrl: 'https://github.com/mohmaedeslam00116/lens-workstation',
        sourceTitle: 'LENS Workstation Core',
        sourceDomain: 'github.com',
        relevanceScore: 0.88,
      },
      {
        index: 2,
        bracket: '[2]',
        chunkId: 'chunk-2',
        milestoneId: 'milestone-perf',
        text: 'Benchmark evaluation demonstrates sub-10ms DOM emulation parsing times.',
        sourceUrl: 'https://benchmarks.example.org/eval',
        sourceTitle: 'Performance Benchmarks',
        sourceDomain: 'benchmarks.example.org',
        relevanceScore: 0.76,
      },
    ];

    const sampleContradictions = [
      {
        topicOrMetric: 'Benchmark Discrepancy: LATENCY',
        claims: [
          { sourceIndex: 1, assertion: '45ms P99 (official)', domain: 'github.com' },
          { sourceIndex: 2, assertion: '140ms P99 (third-party)', domain: 'benchmarks.example.org' },
        ],
        explanation: 'Source [1] reports 45ms whereas Source [2] measured 140ms under heavy stress.',
      },
    ];

    const sampleAudit = {
      sanitizedReportMarkdown: 'Report text',
      totalCitationsFound: 2,
      validCitationsCount: 2,
      hallucinatedCitationsCount: 1,
      validIndices: [1, 2],
      hallucinatedIndices: [99],
      contradictionsDetected: sampleContradictions,
    };

    // 2. English Open State
    const enHtml = renderToStaticMarkup(
      React.createElement(EvidenceDrawer, {
        isOpen: true,
        onClose: () => {},
        excerpts: sampleExcerpts,
        contradictions: sampleContradictions,
        auditRecord: sampleAudit,
        language: 'en',
      })
    );

    assert.ok(enHtml.includes('Verified Evidence Drawer'), 'Must render drawer title');
    assert.ok(enHtml.includes('Zero-Hallucination'), 'Must render zero-hallucination badge');
    assert.ok(enHtml.includes('2 grounded excerpts'), 'Must render excerpts subtitle');
    assert.ok(enHtml.includes('Verified Excerpts'), 'Must render verified excerpts KPI');
    assert.ok(enHtml.includes('Contradictions'), 'Must render contradictions KPI');
    assert.ok(enHtml.includes('Hallucinations Stripped'), 'Must render hallucinations stripped KPI');
    assert.ok(enHtml.includes('Warning: Empirical Contradictions Detected'), 'Must render contradiction warning');
    assert.ok(enHtml.includes('Benchmark Discrepancy: LATENCY'), 'Must render contradiction topic');
    assert.ok(enHtml.includes('45ms P99 (official)'), 'Must render claim 1');
    assert.ok(enHtml.includes('140ms P99 (third-party)'), 'Must render claim 2');
    assert.ok(enHtml.includes('[1]'), 'Must render excerpt 1 bracket');
    assert.ok(enHtml.includes('[2]'), 'Must render excerpt 2 bracket');
    assert.ok(enHtml.includes('github.com'), 'Must render domain 1');
    assert.ok(enHtml.includes('benchmarks.example.org'), 'Must render domain 2');
    assert.ok(enHtml.includes('LENS autonomous research engine utilizes Okapi BM25'), 'Must render excerpt text');

    // 3. Arabic Open State
    const arHtml = renderToStaticMarkup(
      React.createElement(EvidenceDrawer, {
        isOpen: true,
        onClose: () => {},
        excerpts: sampleExcerpts,
        contradictions: sampleContradictions,
        auditRecord: sampleAudit,
        language: 'ar',
      })
    );

    assert.ok(arHtml.includes('dir="rtl"'), 'Must have RTL dir attribute');
    assert.ok(arHtml.includes('درج الأدلة والشواهد المحققة'), 'Must render Arabic drawer title');
    assert.ok(arHtml.includes('مدقق ضد الهلوسة'), 'Must render Arabic zero-hallucination badge');
    assert.ok(arHtml.includes('الشواهد المعتمدة'), 'Must render Arabic KPI 1');
    assert.ok(arHtml.includes('تناقضات مرصودة'), 'Must render Arabic KPI 2');
    assert.ok(arHtml.includes('استشهادات مقطوعة'), 'Must render Arabic KPI 3');
    assert.ok(arHtml.includes('تنبيه: تم رصد تناقضات بين المصادر'), 'Must render Arabic contradiction alert');
  });
});


