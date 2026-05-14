export class EnterError extends Error {
  override name = "EnterError";
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
  }
}

export class ConfigError extends EnterError {
  override name = "ConfigError";
}

export class AuthError extends EnterError {
  override name = "AuthError";
}

export class MemoryError extends EnterError {
  override name = "MemoryError";
}

export class ToolError extends EnterError {
  override name = "ToolError";
}

export class DelegateError extends EnterError {
  override name = "DelegateError";
}
