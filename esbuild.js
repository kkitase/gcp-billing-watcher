// VS Code 拡張機能のバンドル設定。
// node_modules を out/extension.js に取り込んで VSIX を軽量化する。

const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const ctxOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"], // vscode 本体は実行時に提供されるためバンドル対象外
  format: "cjs",
  platform: "node",
  target: "node18", // VS Code 1.85+ は Node 18 ベース
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(ctxOptions);
    await ctx.watch();
    console.log("[esbuild] watching...");
  } else {
    await esbuild.build(ctxOptions);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});