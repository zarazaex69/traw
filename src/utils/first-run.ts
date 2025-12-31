import { homedir } from "os"
import { join } from "path"

const CONFIG_DIR = join(homedir(), ".traw")
const FIRST_RUN_FILE = join(CONFIG_DIR, ".first-run-done")

const c = {
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
}

export async function checkFirstRun(): Promise<boolean> {
  const file = Bun.file(FIRST_RUN_FILE)
  return !(await file.exists())
}

export async function markFirstRunDone(): Promise<void> {
  await Bun.write(FIRST_RUN_FILE, "1")
}

export function showStarBanner(): void {
  console.log()
  console.log(`${c.yellow}*${c.reset} like traw? give it a star: ${c.cyan}https://github.com/zarazaex69/traw${c.reset}`)
  console.log()
}
