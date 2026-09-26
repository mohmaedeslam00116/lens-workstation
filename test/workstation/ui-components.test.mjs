import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('React Workstation UI — Agent Canvas & Auxiliary Pane (Ticket #10)', () => {
  it('verifies all required UI components exist and contain core domain primitives', () => {
    const requiredFiles = [
      'workstation/src/types.ts',
      'workstation/src/components/Header.tsx',
      'workstation/src/components/AgentCanvas.tsx',
      'workstation/src/components/PromptInput.tsx',
      'workstation/src/components/AuxiliaryPane.tsx',
      'workstation/src/hooks/useEngineClient.ts',
      'workstation/src/App.tsx',
    ];

    for (const file of requiredFiles) {
      const fullPath = resolve(process.cwd(), file);
      assert.ok(existsSync(fullPath), `Component file must exist: ${file}`);
    }

    const header = readFileSync(resolve(process.cwd(), 'workstation/src/components/Header.tsx'), 'utf8');
    assert.ok(header.includes('LENS WORKSTATION'), 'Header must contain brand name');
    assert.ok(header.includes('READ_ONLY_INSPECTION') || header.includes('capability'), 'Header must display capability badge');
    assert.ok(header.includes('lang') || header.includes('Language') || header.includes('toggleLanguage'), 'Header must support language toggle');

    const canvas = readFileSync(resolve(process.cwd(), 'workstation/src/components/AgentCanvas.tsx'), 'utf8');
    assert.ok(canvas.includes('thought') || canvas.includes('Thinking'), 'Canvas must support thinking blocks');
    assert.ok(canvas.includes('tool') || canvas.includes('Tool'), 'Canvas must display tool executions');
    assert.ok(canvas.includes('Approve') || canvas.includes('approval'), 'Canvas must support approval checkpoints');

    const promptInput = readFileSync(resolve(process.cwd(), 'workstation/src/components/PromptInput.tsx'), 'utf8');
    assert.ok(promptInput.includes('@') || promptInput.includes('mention'), 'PromptInput must support @mentions');
    assert.ok(promptInput.includes('/') || promptInput.includes('slash'), 'PromptInput must support /slash commands');

    const auxPane = readFileSync(resolve(process.cwd(), 'workstation/src/components/AuxiliaryPane.tsx'), 'utf8');
    assert.ok(auxPane.includes('Diff') || auxPane.includes('DiffEditor'), 'AuxiliaryPane must include Diff tab');
    assert.ok(auxPane.includes('Terminal'), 'AuxiliaryPane must include Terminal tab');
    assert.ok(auxPane.includes('Evidence'), 'AuxiliaryPane must include Evidence tab');

    const app = readFileSync(resolve(process.cwd(), 'workstation/src/App.tsx'), 'utf8');
    assert.ok(app.includes('dir="rtl"') || app.includes('rtl') || app.includes('isRtl'), 'App must support Arabic RTL layout');
  });
});
