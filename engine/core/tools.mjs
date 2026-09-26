/**
 * Tool definitions and execution dispatch
 */

export const STANDARD_TOOLS = {
  view_file: {
    name: 'view_file',
    description: 'View contents of a file within the workspace',
    isMutating: false,
    async execute(args, ports) {
      if (!args || !args.path) throw new Error('Missing required argument: path');
      return await ports.inspectionPort.viewFile(args.path, args.startLine, args.endLine);
    },
  },

  list_dir: {
    name: 'list_dir',
    description: 'List contents of a directory',
    isMutating: false,
    async execute(args, ports) {
      return await ports.inspectionPort.listDir(args ? args.path : '.');
    },
  },

  grep_search: {
    name: 'grep_search',
    description: 'Search for text or regex patterns across workspace files',
    isMutating: false,
    async execute(args, ports) {
      if (!args || !args.query) throw new Error('Missing required argument: query');
      return await ports.inspectionPort.grepSearch(args.query, args.path);
    },
  },

  find_by_name: {
    name: 'find_by_name',
    description: 'Find files matching a glob or substring pattern',
    isMutating: false,
    async execute(args, ports) {
      if (!args || !args.pattern) throw new Error('Missing required argument: pattern');
      return await ports.inspectionPort.findByName(args.pattern, args.path);
    },
  },

  propose_diff: {
    name: 'propose_diff',
    description: 'Propose a file modification diff requiring human approval',
    isMutating: true,
    async execute(args) {
      return { status: 'applied', path: args.path };
    },
  },

  run_command: {
    name: 'run_command',
    description: 'Run a shell command requiring human approval',
    isMutating: true,
    async execute(args) {
      return { status: 'executed', command: args.command };
    },
  },
};
