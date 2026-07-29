/* eslint-disable @typescript-eslint/no-require-imports */
const { loadEnvConfig } = require("@next/env");
const { join } = require("node:path");

process.chdir(__dirname);
loadEnvConfig(__dirname);

const { createServer } = require("node:http");
const { existsSync } = require("node:fs");
const next = require("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOST || "0.0.0.0";
const buildDir = join(__dirname, ".next");
const nextModule = join(__dirname, "node_modules", "next");

console.log("Company E-Sign startup");
console.log("cwd:", process.cwd());
console.log("dir:", __dirname);
console.log("port:", port);
console.log("node:", process.version);

if (!existsSync(buildDir)) {
  console.error(
    "Missing .next build folder. Build on your PC with `npm run build`, then upload the pre-built package. Do not run build on cPanel."
  );
  process.exit(1);
}

if (!existsSync(nextModule)) {
  console.error(
    "Missing node_modules/next. Upload the latest company-esign-cpanel.zip (includes node_modules) or click Run NPM Install in cPanel."
  );
  process.exit(1);
}

const app = next({ dev: false, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((request, response) => handle(request, response)).listen(port, hostname, () => {
    console.log(`Company E-Sign running on port ${port}`);

    // Process scheduled agreement sends about once a minute (cPanel-friendly, no external cron).
    const tick = () => {
      const headers = {};
      if (process.env.CRON_SECRET) headers["x-cron-secret"] = process.env.CRON_SECRET;
      fetch(`http://127.0.0.1:${port}/api/cron/process-scheduled`, {
        method: "POST",
        headers,
      }).catch((error) => {
        console.error("Scheduled send tick failed:", error);
      });
    };
    setTimeout(tick, 15_000);
    setInterval(tick, 60_000);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
