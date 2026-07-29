import axios, { type AxiosRequestConfig } from "axios";
import smartsheet, { type SmartsheetClient } from "smartsheet";
import { CliFailure } from "../../core/cli-response.js";

interface RequestOptions {
  url?: string;
  queryParameters?: Record<string, unknown>;
  body?: unknown;
}

export function getSmartsheetClient(): SmartsheetClient {
  const accessToken = process.env.SMARTSHEET_API_TOKEN?.trim();
  if (!accessToken) {
    throw new CliFailure(
      "SMARTSHEET_API_TOKEN is required.",
      "CONFIG_ERROR",
      false,
      ["Set SMARTSHEET_API_TOKEN and retry the command."],
    );
  }

  const baseUrl = readBaseUrl();
  const requestor = createRequestor(baseUrl, accessToken);
  return smartsheet.createClient({
    accessToken,
    baseUrl,
    requestor,
    userAgent: "smartsheet-cli",
  });
}

function createRequestor(baseUrl: string, accessToken: string) {
  const http = axios.create({
    baseURL: baseUrl,
    timeout: 60_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "smartsheet-cli",
    },
  });
  const request = async (config: AxiosRequestConfig) => {
    try {
      return (await http.request(config)).data;
    } catch (error) {
      throw providerError(error);
    }
  };
  const config = (method: string, options: RequestOptions) => ({
    method,
    url: options.url,
    params: options.queryParameters,
    ...(options.body === undefined ? {} : { data: options.body }),
  });

  return {
    get: (options: RequestOptions) => request(config("GET", options)),
    post: (options: RequestOptions) => request(config("POST", options)),
    put: (options: RequestOptions) => request(config("PUT", options)),
    delete: (options: RequestOptions) => request(config("DELETE", options)),
  };
}

function providerError(error: unknown): unknown {
  if (!axios.isAxiosError(error) || !error.response) return error;
  const body =
    typeof error.response.data === "object" && error.response.data !== null
      ? (error.response.data as Record<string, unknown>)
      : {};
  return {
    statusCode: error.response.status,
    ...(typeof body.errorCode === "number"
      ? { errorCode: body.errorCode }
      : {}),
    ...(typeof body.message === "string" ? { message: body.message } : {}),
  };
}

function readBaseUrl(): string {
  const value =
    process.env.SMARTSHEET_BASE_URL?.trim() ||
    "https://api.smartsheet.com/2.0/";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliFailure(
      "SMARTSHEET_BASE_URL must be a valid HTTPS URL.",
      "CONFIG_ERROR",
      false,
      ["Set SMARTSHEET_BASE_URL to the Smartsheet API root and retry."],
    );
  }

  if (
    url.protocol !== "https:" ||
    ![
      "api.smartsheet.com",
      "api.smartsheet.eu",
      "api.smartsheet.au",
      "api.smartsheetgov.com",
    ].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !["/2.0", "/2.0/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new CliFailure(
      "SMARTSHEET_BASE_URL must use a supported Smartsheet HTTPS API host with the /2.0 path and no credentials, port, query, or fragment.",
      "CONFIG_ERROR",
      false,
      ["Set SMARTSHEET_BASE_URL to the Smartsheet API root and retry."],
    );
  }

  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}
