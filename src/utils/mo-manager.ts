import { spawn, type Subprocess } from "bun"
import { homedir } from "os"
import { join } from "path"
import { log } from "./log"

const MO_REPO = "zarazaex69/mo"
const CONFIG_DIR = join(homedir(), ".config", "traw")
const MO_BIN = join(CONFIG_DIR, "mo")
const MO_CONFIG_DIR = join(CONFIG_DIR, "configs")
const MO_CONFIG = join(MO_CONFIG_DIR, "config.yaml")
const CONFIG_URL = "https://raw.githubusercontent.com/zarazaex69/mo/main/configs/config.yaml"

let moProcess: Subprocess | null = null

function getPlatformAsset(): string {
  const platform = process.platform
  const arch = process.arch

  if (platform === "linux" && arch === "x64") return "mo-linux-amd64"
  if (platform === "linux" && arch === "arm64") return "mo-linux-arm64"
  if (platform === "darwin" && arch === "x64") return "mo-darwin-amd64"
  if (platform === "darwin" && arch === "arm64") return "mo-darwin-arm64"

  throw new Error(`unsupported platform: ${platform}-${arch}`)
}

async function getLatestRelease(): Promise<{ tag: string; url: string }> {
  const resp = await fetch(`https://api.github.com/repos/${MO_REPO}/releases/latest`)
  if (!resp.ok) throw new Error("failed to fetch latest release")

  const data = await resp.json() as { tag_name: string; assets: { name: string; browser_download_url: string }[] }
  const asset = getPlatformAsset()
  const tarball = data.assets.find(a => a.name === `${asset}.tar.gz`)

  if (!tarball) throw new Error(`no binary for ${asset}`)

  return { tag: data.tag_name, url: tarball.browser_download_url }
}

export async function pingMo(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
    return resp.ok
  } catch {
    return false
  }
}

export async function isMoInstalled(): Promise<boolean> {
  return await Bun.file(MO_BIN).exists()
}

export async function downloadMo(): Promise<void> {
  log.info("fetching latest mo release...")

  const { tag, url } = await getLatestRelease()
  log.info(`downloading mo ${tag}...`)

  // ensure config dir exists
  await Bun.write(join(CONFIG_DIR, ".keep"), "")
  await Bun.write(join(MO_CONFIG_DIR, ".keep"), "")

  const resp = await fetch(url)
  if (!resp.ok) throw new Error("download failed")

  const tarPath = join(CONFIG_DIR, "mo.tar.gz")
  await Bun.write(tarPath, resp)

  // extract tarball
  const proc = spawn(["tar", "-xzf", tarPath, "-C", CONFIG_DIR], { stdout: "ignore", stderr: "pipe" })
  await proc.exited

  if (proc.exitCode !== 0) {
    throw new Error("failed to extract mo")
  }

  // rename extracted binary to just "mo"
  const asset = getPlatformAsset()
  const extractedPath = join(CONFIG_DIR, asset)

  if (await Bun.file(extractedPath).exists()) {
    const content = await Bun.file(extractedPath).arrayBuffer()
    await Bun.write(MO_BIN, content)
    await Bun.spawn(["rm", extractedPath]).exited
  }

  // make executable
  await Bun.spawn(["chmod", "+x", MO_BIN]).exited

  // cleanup
  await Bun.spawn(["rm", tarPath]).exited

  // download config if not exists
  if (!await Bun.file(MO_CONFIG).exists()) {
    log.info("downloading config...")
    const cfgResp = await fetch(CONFIG_URL)
    if (cfgResp.ok) {
      await Bun.write(MO_CONFIG, cfgResp)
    }
  }

  log.success(`mo ${tag} installed`)
}

export async function startMo(port: number): Promise<void> {
  if (!await isMoInstalled()) {
    throw new Error("mo not installed")
  }

  log.info("starting mo server...")

  const configExists = await Bun.file(MO_CONFIG).exists()
  if (!configExists) {
    throw new Error(`config not found: ${MO_CONFIG}`)
  }

  moProcess = spawn([MO_BIN, "--config", MO_CONFIG, "--port", String(port)], {
    stdout: "ignore",
    stderr: "ignore",
    env: { ...process.env, MO_DATA_PATH: CONFIG_DIR },
  })

  // wait for server to be ready
  const maxWait = 10000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    // check if process died
    if (moProcess.exitCode !== null) {
      throw new Error(`mo exited with code ${moProcess.exitCode}`)
    }

    if (await pingMo(`http://localhost:${port}`)) {
      log.success("mo server ready")
      return
    }
    await Bun.sleep(300)
  }

  throw new Error("mo server failed to start (timeout)")
}

export function stopMo(): void {
  if (moProcess) {
    moProcess.kill()
    moProcess = null
  }
}

// cleanup on exit
process.on("exit", stopMo)
process.on("SIGINT", () => { stopMo(); process.exit(0) })
process.on("SIGTERM", () => { stopMo(); process.exit(0) })
