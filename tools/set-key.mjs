/* Saves your ScrapeCreators key into .env without showing it on screen, then runs the library collector.
     node tools/set-key.mjs --niche skincare
   Everything after the file name is passed on to tools/build-library.mjs. The key goes only into .env, which git ignores. */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");

process.stdout.write("Paste your ScrapeCreators key and press Enter (you will see * for each character; right-click here to paste): ");
let key = await new Promise((resolve) => {
  let buf = "";
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function onData(chunk) {
    for (const ch of chunk) {
      if (ch === "\r" || ch === "\n") {
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        return resolve(buf.trim());
      }
      if (ch === "\u0003") process.exit(1);
      if (ch === "\u007f" || ch === "\b") { if (buf) { buf = buf.slice(0, -1); process.stdout.write("\b \b"); } }
      else if (ch >= " ") { buf += ch; process.stdout.write("*"); }   // one star per character, so you can see a paste landed
    }
  });
});

// Pasting more than once puts the same key in the line twice or more: keep one copy.
const rep = key.match(/^(.{16,}?)\1+$/);
if (rep) key = rep[1];

if (key.length < 16 || /[\s"'=]/.test(key)) {
  console.error("That does not look like a key (it should be one long word with no spaces). Nothing was saved. Run this again.");
  process.exit(1);
}

let env = "";
try { env = fs.readFileSync(envFile, "utf8"); } catch (e) { /* no .env yet */ }
const nl = env.includes("\r\n") ? "\r\n" : "\n";
const line = "SCRAPECREATORS_KEY=" + key;
env = /^\s*SCRAPECREATORS_KEY\s*=.*$/m.test(env) ? env.replace(/^\s*SCRAPECREATORS_KEY\s*=.*$/m, line) : env + (env && !env.endsWith("\n") ? nl : "") + line + nl;
fs.writeFileSync(envFile, env);
console.log(`Saved to .env (${key.length} characters). Starting the library test...\n`);

const child = spawn(process.execPath, [path.join(root, "tools", "build-library.mjs"), ...process.argv.slice(2)], { stdio: "inherit", cwd: root });
child.on("exit", (code) => process.exit(code || 0));
