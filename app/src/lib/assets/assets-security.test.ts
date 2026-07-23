import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Vitest runs from the app/ directory, so process.cwd()/src is the source root.
const SRC = join(process.cwd(), "src");

/** Non-test .ts/.tsx files — the only ones that can end up in a client bundle. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    out.push(full);
  }
  return out;
}
const rel = (p: string) => relative(SRC, p).split(sep).join("/");

describe("Envio credential can never reach the client bundle", () => {
  const files = sourceFiles();

  it("defines no NEXT_PUBLIC Envio variable anywhere in source", () => {
    const hits = files.filter((f) => /NEXT_PUBLIC[A-Z0-9_]*ENVIO/.test(readFileSync(f, "utf8")));
    expect(hits.map(rel)).toEqual([]);
  });

  it("reads ENVIO_API_TOKEN only in the server-only client factory", () => {
    const needle = /(?:process\.env|env)\.ENVIO_API_TOKEN/;
    const hits = files.filter((f) => needle.test(readFileSync(f, "utf8")));
    expect(hits.map(rel)).toEqual(["lib/assets/envioClient.ts"]);
  });
});
