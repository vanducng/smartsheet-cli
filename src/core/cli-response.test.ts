import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CliFailure,
  outputJson,
  reportError,
  reportUnexpectedError,
  reportWriteError,
} from "./cli-response.js";

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

function captureError(error: unknown) {
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);

  reportError(error);

  expect(stderr).toHaveBeenCalledOnce();
  return JSON.parse(String(stderr.mock.calls[0][0]));
}

describe("CLI responses", () => {
  it("writes one JSON success value", () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    outputJson({ data: [{ id: 1 }] });

    expect(stdout).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith('{"data":[{"id":1}]}\n');
    expect(process.exitCode).toBeUndefined();
  });

  it("reports validation failures once and redacts secrets", () => {
    const result = captureError(
      new CliFailure("token=top-secret-value was rejected"),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "token=[REDACTED] was rejected",
        retryable: false,
        next_steps: ["Fix the reported input and retry the command."],
      },
    });
    expect(process.exitCode).toBe(1);
  });

  it.each([
    [401, "AUTHENTICATION_FAILED", false],
    [403, "PERMISSION_DENIED", false],
    [404, "NOT_FOUND", false],
    [429, "RATE_LIMITED", true],
    [503, "PROVIDER_ERROR", false],
  ])("maps provider status %i", (statusCode, code, retryable) => {
    const result = captureError({
      statusCode,
      errorCode: statusCode === 429 ? 4003 : undefined,
      message: "authorization: Bearer top-secret-value",
    });

    expect(result.error).toMatchObject({ code, retryable });
    expect(JSON.stringify(result)).not.toContain("top-secret-value");
  });

  it("maps the Smartsheet rate-limit code without an HTTP status", () => {
    expect(
      captureError({ errorCode: 4003, message: "rate limit" }).error,
    ).toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });

  it("does not expose ordinary error messages", () => {
    const result = captureError(
      new Error("internal /path with top-secret-value"),
    );

    expect(result.error).toMatchObject({
      code: "UNEXPECTED_ERROR",
      message: "The command failed unexpectedly.",
    });
    expect(JSON.stringify(result)).not.toContain("top-secret-value");
  });

  it("requires reconciliation after an ambiguous write failure", () => {
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    reportWriteError(new Error("socket closed with token=top-secret-value"));

    const result = JSON.parse(String(stderr.mock.calls[0][0]));
    expect(result.error).toEqual({
      code: "UNEXPECTED_ERROR",
      message: "The write result could not be confirmed.",
      retryable: false,
      next_steps: [
        "Check the current sheet state before deciding whether to retry.",
      ],
    });
  });

  it("does not expose unexpected errors", () => {
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    reportUnexpectedError(new Error("Bearer top-secret-value"));

    expect(String(stderr.mock.calls[0][0])).not.toContain("top-secret-value");
    expect(process.exitCode).toBe(1);
  });
});
