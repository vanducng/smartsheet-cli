export interface CliErrorInput {
  code: string;
  message: string;
  retryable: boolean;
  nextSteps: readonly [string, ...string[]];
}

export class CliFailure extends Error {
  constructor(
    message: string,
    readonly code = "VALIDATION_ERROR",
    readonly retryable = false,
    readonly nextSteps: readonly [string, ...string[]] = [
      "Fix the reported input and retry the command.",
    ],
  ) {
    super(message);
    this.name = "CliFailure";
  }
}

export function createCliError(input: CliErrorInput) {
  return {
    ok: false as const,
    error: {
      code: input.code,
      message: redact(input.message),
      retryable: input.retryable,
      next_steps: input.nextSteps,
    },
  };
}

export function outputJson(value: unknown): void {
  const output = JSON.stringify(value);
  if (output === undefined) {
    throw new CliFailure(
      "The provider returned an unsupported empty response.",
      "PROVIDER_RESPONSE_ERROR",
      false,
      ["Verify the operation in Smartsheet before retrying the command."],
    );
  }
  process.stdout.write(`${output}\n`);
}

export function reportCliError(error: CliErrorInput): void {
  console.error(JSON.stringify(createCliError(error)));
  process.exitCode = 1;
}

export function reportError(error: unknown): void {
  reportCliError(toCliError(error));
}

export function reportWriteError(error: unknown): void {
  if (error instanceof CliFailure || providerError(error)) {
    reportError(error);
    return;
  }
  reportCliError({
    code: "UNEXPECTED_ERROR",
    message: "The write result could not be confirmed.",
    retryable: false,
    nextSteps: [
      "Check the current sheet state before deciding whether to retry.",
    ],
  });
}

export function reportUnexpectedError(_error?: unknown): void {
  reportCliError({
    code: "UNEXPECTED_ERROR",
    message: "The command failed unexpectedly.",
    retryable: false,
    nextSteps: ["Retry with valid input or report the failure if it persists."],
  });
}

function toCliError(error: unknown): CliErrorInput {
  if (error instanceof CliFailure) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      nextSteps: error.nextSteps,
    };
  }

  const provider = providerError(error);
  if (!provider) {
    return {
      code: "UNEXPECTED_ERROR",
      message: "The command failed unexpectedly.",
      retryable: false,
      nextSteps: ["Retry after checking the command input."],
    };
  }

  if (provider.statusCode === 401) {
    return {
      code: "AUTHENTICATION_FAILED",
      message: "Smartsheet rejected the configured API token.",
      retryable: false,
      nextSteps: ["Set a valid SMARTSHEET_API_TOKEN and retry the command."],
    };
  }
  if (provider.statusCode === 403) {
    return {
      code: "PERMISSION_DENIED",
      message: "The configured Smartsheet account cannot perform this action.",
      retryable: false,
      nextSteps: ["Verify the account and resource permissions, then retry."],
    };
  }
  if (provider.statusCode === 404) {
    return {
      code: "NOT_FOUND",
      message: "The requested Smartsheet resource was not found.",
      retryable: false,
      nextSteps: ["Verify the resource identifier and retry the command."],
    };
  }
  if (provider.statusCode === 429 || provider.errorCode === 4003) {
    return {
      code: "RATE_LIMITED",
      message: "Smartsheet rate-limited the request.",
      retryable: true,
      nextSteps: ["Wait at least 60 seconds, then retry the same command."],
    };
  }
  if (provider.statusCode !== undefined && provider.statusCode >= 500) {
    return {
      code: "PROVIDER_ERROR",
      message: "Smartsheet failed to complete the request.",
      retryable: false,
      nextSteps: [
        "Check the current sheet state before deciding whether to retry.",
      ],
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message: provider.message ?? "Smartsheet rejected the request.",
    retryable: false,
    nextSteps: [
      "Fix the request or verify the current sheet state before retrying.",
    ],
  };
}

function providerError(
  error: unknown,
): { statusCode?: number; errorCode?: number; message?: string } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as Record<string, unknown>;
  const statusCode =
    typeof value.statusCode === "number" ? value.statusCode : undefined;
  const errorCode =
    typeof value.errorCode === "number" ? value.errorCode : undefined;
  const message = typeof value.message === "string" ? value.message : undefined;
  if (statusCode === undefined && errorCode === undefined) {
    return undefined;
  }
  return { statusCode, errorCode, message };
}

function redact(message: string): string {
  const safe = message
    .replace(
      /((?:api[_-]?key|authorization|token|secret)["']?\s*[:=]\s*(?:Bearer\s+)?["']?)[^"',;\s}]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
  return safe.length <= 500 ? safe : `${safe.slice(0, 497)}...`;
}
