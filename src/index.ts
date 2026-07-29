import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { run } from "./cli.js";
import { reportUnexpectedError } from "./core/cli-response.js";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  void run().catch(reportUnexpectedError);
}
