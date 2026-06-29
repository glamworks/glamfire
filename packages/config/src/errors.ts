// Typed config error taxonomy (research/12 §3). Never throw strings — every
// failure carries a stable `code`, an actionable message, and (where known) the
// file and field that caused it, plus the original `cause` for debugging.

export type ConfigErrorCode =
  | 'CONFIG_TOML_PARSE' // a config file is not valid TOML
  | 'CONFIG_FILE_READ' // a config file exists but could not be read
  | 'CONFIG_INVALID' // merged config failed zod validation
  | 'CONFIG_CREDENTIAL'; // a credential reference could not be resolved

export class ConfigError extends Error {
  readonly code: ConfigErrorCode;
  /** Absolute path of the offending config file, when the failure is file-scoped. */
  readonly file: string | undefined;

  constructor(
    code: ConfigErrorCode,
    message: string,
    options?: { cause?: unknown; file?: string },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ConfigError';
    this.code = code;
    this.file = options?.file;
  }
}
