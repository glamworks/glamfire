// @glamfire/engine — the open engine (SPEC §5.1).
// Public surface: the neutral contract types, the tool layer, the permission
// gate, and the plan -> act -> observe loop.

export * from './types.js';
export {
  type CommandPolicy,
  ToolRegistry,
  ToolError,
  readFileTool,
  calculatorTool,
  writeFileTool,
  editFileTool,
  runCommandTool,
  createRunCommandTool,
  defaultCommandPolicy,
  DEFAULT_COMMAND_ALLOWLIST,
  builtinTools,
} from './tools.js';
export {
  type PermissionPolicy,
  type Verdict,
  type GateResult,
  defaultPolicy,
  gate,
} from './permissions.js';
export { type RunOptions, runTask } from './loop.js';
