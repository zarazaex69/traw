#!/usr/bin/env bun
// build script that bakes version into the binary

const version = process.env.VERSION || "dev"

console.log(`building traw v${version}...`)

await Bun.build({
  entrypoints: ["src/cli/index.ts"],
  outdir: "dist",
  target: "bun",
  define: {
    "process.env.BUILD_VERSION": JSON.stringify(version),
  },
  external: ["electron", "chromium-bidi"],
})

// compile to single binary
const proc = Bun.spawn([
  "bun", "build", "src/cli/index.ts",
  "--compile",
  "--outfile=dist/traw",
  "--target=bun",
  "--external=electron",
  "--external=chromium-bidi",
  `--define=process.env.BUILD_VERSION="${version}"`,
], {
  stdout: "inherit",
  stderr: "inherit",
})

const code = await proc.exited
if (code !== 0) {
  process.exit(code)
}

console.log(`✓ built dist/traw (v${version})`)
