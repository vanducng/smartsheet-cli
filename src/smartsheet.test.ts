import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CliFailure } from "./core/cli-response.js";
import { getSmartsheetClient } from "./smartsheet.js";

const { axiosCreate, axiosIsAxiosError, createClient, request } = vi.hoisted(
  () => ({
    axiosCreate: vi.fn(),
    axiosIsAxiosError: vi.fn(),
    createClient: vi.fn(),
    request: vi.fn(),
  }),
);

vi.mock("axios", () => ({
  default: { create: axiosCreate, isAxiosError: axiosIsAxiosError },
}));
vi.mock("smartsheet", () => ({ default: { createClient } }));

beforeEach(() => {
  vi.clearAllMocks();
  axiosCreate.mockReturnValue({ request });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Smartsheet client", () => {
  it("requires the API token before creating a client", () => {
    vi.stubEnv("SMARTSHEET_API_TOKEN", "");

    expect(() => getSmartsheetClient()).toThrow(CliFailure);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates a silent client without automatic retries", () => {
    vi.stubEnv("SMARTSHEET_API_TOKEN", "token-value");
    vi.stubEnv("SMARTSHEET_BASE_URL", "");
    vi.stubEnv("SMARTSHEET_API_HOST", "https://attacker.example/");
    const client = { sheets: {} };
    createClient.mockReturnValue(client);

    expect(getSmartsheetClient()).toBe(client);
    expect(createClient).toHaveBeenCalledWith({
      accessToken: "token-value",
      baseUrl: "https://api.smartsheet.com/2.0/",
      requestor: expect.objectContaining({
        get: expect.any(Function),
        post: expect.any(Function),
        put: expect.any(Function),
      }),
      userAgent: "smartsheet-cli",
    });
    expect(axiosCreate).toHaveBeenCalledWith({
      baseURL: "https://api.smartsheet.com/2.0/",
      timeout: 60_000,
      headers: {
        Authorization: "Bearer token-value",
        "User-Agent": "smartsheet-cli",
      },
    });
  });

  it("normalizes an HTTPS base URL", () => {
    vi.stubEnv("SMARTSHEET_API_TOKEN", "token-value");
    vi.stubEnv("SMARTSHEET_BASE_URL", "https://api.smartsheet.eu/2.0");

    getSmartsheetClient();

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://api.smartsheet.eu/2.0/" }),
    );
  });

  it.each([
    "not-a-url",
    "http://api.smartsheet.com/2.0",
    "https://user:pass@api.smartsheet.com/2.0",
    "https://api.smartsheet.com/2.0?token=value",
    "https://attacker.example/2.0",
    "https://api.smartsheet.com:444/2.0",
    "https://api.smartsheet.com/",
    "https://api.smartsheet.com/wrong/",
  ])("rejects unsafe base URL %s", (baseUrl) => {
    vi.stubEnv("SMARTSHEET_API_TOKEN", "token-value");
    vi.stubEnv("SMARTSHEET_BASE_URL", baseUrl);

    expect(() => getSmartsheetClient()).toThrow(CliFailure);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("surfaces a transport timeout without retrying", async () => {
    vi.stubEnv("SMARTSHEET_API_TOKEN", "token-value");
    request.mockRejectedValue(
      Object.assign(new Error("timeout"), { code: "ECONNABORTED" }),
    );
    createClient.mockImplementation((options) => options.requestor);

    const requestor = getSmartsheetClient() as unknown as {
      post: (options: RequestOptions) => Promise<unknown>;
    };

    await expect(
      requestor.post({ url: "sheets/123/rows", body: [{}] }),
    ).rejects.toMatchObject({ code: "ECONNABORTED" });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [403, 1004, "You are not authorized"],
    [429, 4003, "Rate limit exceeded"],
  ])(
    "shapes an HTTP %i provider response",
    async (statusCode, errorCode, message) => {
      vi.stubEnv("SMARTSHEET_API_TOKEN", "token-value");
      axiosIsAxiosError.mockReturnValue(true);
      request.mockRejectedValue({
        response: { status: statusCode, data: { errorCode, message } },
      });
      createClient.mockImplementation((options) => options.requestor);

      const requestor = getSmartsheetClient() as unknown as {
        post: (options: RequestOptions) => Promise<unknown>;
      };

      await expect(
        requestor.post({ url: "sheets/123/rows", body: [{}] }),
      ).rejects.toEqual({ statusCode, errorCode, message });
      expect(request).toHaveBeenCalledOnce();
    },
  );
});

interface RequestOptions {
  url: string;
  body: unknown;
}
