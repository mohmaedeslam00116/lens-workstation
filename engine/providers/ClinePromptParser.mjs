/**
 * Cline XML Tool Parser
 * Extracts tool calls formatted as XML tags (e.g. <read_file><path>foo</path></read_file>)
 * enabling universal tool use across models that emit XML rather than native function calls.
 */

let callCounter = 0;

export function parseClineXmlTools(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { cleanedText: '', toolCalls: [] };
  }

  const toolCalls = [];
  let cleanedText = rawText;

  // Regex to match tool tags: <tool_name>...</tool_name>
  // Tag names typically snake_case or lowercase with underscores
  const toolBlockRegex = /<([a-z0-9_]+)>([\s\S]*?)<\/\1>/gi;

  // Standard non-tool HTML tags to ignore if encountered in conversational text
  const ignoredTags = new Set(['b', 'i', 'u', 'strong', 'em', 'p', 'code', 'pre', 'span', 'div', 'ul', 'ol', 'li']);

  let match;
  while ((match = toolBlockRegex.exec(rawText)) !== null) {
    const fullMatch = match[0];
    const toolName = match[1];
    const innerContent = match[2];

    if (ignoredTags.has(toolName.toLowerCase())) {
      continue;
    }

    // Parse inner parameters: <param_name>param_value</param_name>
    const paramRegex = /<([a-z0-9_]+)>([\s\S]*?)<\/\1>/gi;
    const args = {};
    let paramMatch;
    let hasParams = false;

    while ((paramMatch = paramRegex.exec(innerContent)) !== null) {
      hasParams = true;
      const paramName = paramMatch[1];
      const paramValue = paramMatch[2].trim();
      args[paramName] = paramValue;
    }

    // If no nested parameter tags were found, assign inner content to 'raw' or 'content'
    if (!hasParams && innerContent.trim()) {
      args.content = innerContent.trim();
    }

    callCounter += 1;
    toolCalls.push({
      type: 'tool_call',
      callId: `cline_call_${Date.now()}_${callCounter}`,
      toolName: toolName.trim(),
      args,
    });

    // Remove the tool tag from cleaned text
    cleanedText = cleanedText.replace(fullMatch, '');
  }

  // Normalize extra empty lines created by removing tool tags
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanedText,
    toolCalls,
  };
}
