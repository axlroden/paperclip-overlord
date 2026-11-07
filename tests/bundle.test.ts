import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards the host contract: Paperclip rewrites bare imports only when written as ` from "x"`.
describe.skipIf(!existsSync("dist/ui/index.js"))("built UI bundle", () => {
  const src = existsSync("dist/ui/index.js") ? readFileSync("dist/ui/index.js", "utf8") : "";
  it("has no whitespace-stripped bare imports the host cannot rewrite", () => {
    expect(src).not.toMatch(/from"(react|react-dom|react\/jsx-runtime|@paperclipai\/plugin-sdk\/ui)"/);
  });
  it("bundles pixi instead of importing it", () => {
    expect(src).not.toMatch(/from ?"pixi\.js"/);
  });
});
