#!/usr/bin/env bun
import { parseArgs } from "util"
import { Agent } from "../agent/agent"
import type { AgentConfig } from "../types"
import { log, setSilent } from "../utils/log"
import { pingMo, isMoInstalled, downloadMo, startMo, stopMo } from "../utils/mo-manager"
import { printHelp } from "./help"
import { VERSION, checkForUpdates } from "../utils/version"
import { checkFirstRun, markFirstRunDone, showStarBanner } from "../utils/first-run"

const DEFAULT_MO_PORT = 8804

const cliOptions = {
  help: { type: "boolean" as const, short: "h" as const },
  version: { type: "boolean" as const, short: "v" as const },
  headless: { type: "boolean" as const },
  headed: { type: "boolean" as const },
  video: { type: "boolean" as const },
  fast: { type: "boolean" as const },
  debug: { type: "boolean" as const },
  json: { type: "boolean" as const },
  "no-planning": { type: "boolean" as const },
  steps: { type: "string" as const },
  mo: { type: "string" as const },
  api: { type: "string" as const },
  "api-key": { type: "string" as const },
  model: { type: "string" as const },
}

type Provider = "qwen" | "glm"

const providerModels: Record<Provider, { default: string; fast: string }> = {
  qwen: { default: "coder-model", fast: "vision-model" },
  glm: { default: "GLM-4-Plus", fast: "GLM-4-Flash" },
}

const defaultConfig: AgentConfig = {
  moUrl: `http://localhost:${DEFAULT_MO_PORT}`,
  apiUrl: undefined,
  apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY,
  model: "coder-model",
  thinking: true,
  headless: true,
  recordVideo: false,
  maxSteps: 20,
  debug: false,
  jsonOutput: false,
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(question)
  for await (const line of console) {
    return line.trim()
  }
  return ""
}

async function ensureMo(moUrl: string): Promise<boolean> {
  if (await pingMo(moUrl)) {
    return true
  }

  const installed = await isMoInstalled()

  if (!installed) {
    const answer = await prompt("mo server not found. install mo? [Y/n] ")
    if (answer.toLowerCase() === "n") {
      log.error("mo is required to run traw")
      return false
    }

    try {
      await downloadMo()
    } catch (err: any) {
      log.error(`failed to install mo: ${err.message}`)
      return false
    }
  }

  try {
    const port = parseInt(new URL(moUrl).port) || DEFAULT_MO_PORT
    await startMo(port)
    return true
  } catch (err: any) {
    log.error(`failed to start mo: ${err.message}`)
    return false
  }
}

async function registerAccount(moUrl: string, provider: Provider): Promise<void> {
  log.info(`registering new ${provider} account...`)
  log.info("browser will open for captcha solving")

  const endpoint = provider === "qwen" ? "/auth/qwen/register" : "/auth/glm/register"

  const resp = await fetch(`${moUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(err.error || `registration failed: ${resp.status}`)
  }

  const data = await resp.json() as {
    success: boolean
    token: { id: string; email: string; is_active: boolean }
  }

  if (!data.success) {
    throw new Error("registration failed")
  }

  log.success(`registered: ${data.token.email}`)
  log.info(`token id: ${data.token.id}`)
  log.info(`provider: ${provider}`)
  log.info("token is now active and ready to use")
}

async function listTokens(moUrl: string, provider: Provider): Promise<void> {
  const endpoint = `/auth/${provider}/tokens`

  const resp = await fetch(`${moUrl}${endpoint}`)
  if (!resp.ok) {
    throw new Error(`failed to list tokens: ${resp.status}`)
  }

  const data = await resp.json() as {
    tokens: Array<{
      id: string
      email: string
      provider: string
      is_active: boolean
      created_at: string
    }>
  }

  if (!data.tokens || data.tokens.length === 0) {
    log.info(`no ${provider} tokens found`)
    return
  }

  console.log()
  log.info(`${provider} tokens:`)
  for (const t of data.tokens) {
    const active = t.is_active ? " [active]" : ""
    console.log(`  ${t.id} - ${t.email}${active}`)
  }
  console.log()
}

async function activateToken(moUrl: string, tokenId: string): Promise<void> {
  const providers: Provider[] = ["qwen", "glm"]

  for (const provider of providers) {
    const resp = await fetch(`${moUrl}/auth/${provider}/tokens/${tokenId}/activate`, {
      method: "POST",
    })

    if (resp.ok) {
      log.success(`token ${tokenId} activated`)
      return
    }
  }

  throw new Error(`token ${tokenId} not found`)
}

function detectProviderFromModel(model: string): Provider {
  if (model.startsWith("coder-") || model.startsWith("vision-")) {
    return "qwen"
  }
  return "glm"
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: cliOptions,
    allowPositionals: true,
    strict: false,
  })

  if (await checkFirstRun()) {
    showStarBanner()
    await markFirstRunDone()
  }

  if (positionals.length === 0 || values.help) {
    printHelp()
    return
  }

  if (values.version) {
    console.log(`traw ${VERSION}`)
    return
  }

  const cmd = positionals[0]

  if (cmd === "upd" || cmd === "update") {
    log.info(`current version: ${VERSION}`)
    log.info("checking for updates...")

    const update = await checkForUpdates()
    if (!update) {
      log.error("failed to check for updates")
      process.exit(1)
    }

    if (update.hasUpdate) {
      console.log()
      log.success(`new version available: ${update.latest}`)
      log.info(`download: ${update.url}`)
    } else {
      log.success("you're on the latest version!")
    }
    return
  }

  if (cmd === "auth") {
    const moUrl = typeof values.mo === "string" ? values.mo : defaultConfig.moUrl
    const subCmd = positionals[1]

    if (!await ensureMo(moUrl)) {
      process.exit(1)
    }

    try {
      if (subCmd === "qwen") {
        await registerAccount(moUrl, "qwen")
      } else if (subCmd === "glm") {
        await registerAccount(moUrl, "glm")
      } else if (subCmd === "list") {
        const provider = positionals[2] as Provider | undefined
        if (provider && (provider === "qwen" || provider === "glm")) {
          await listTokens(moUrl, provider)
        } else {
          await listTokens(moUrl, "qwen")
          await listTokens(moUrl, "glm")
        }
      } else if (subCmd === "activate") {
        const tokenId = positionals[2]
        if (!tokenId) {
          log.error("provide token id: traw auth activate <id>")
          process.exit(1)
        }
        await activateToken(moUrl, tokenId)
      } else {
        log.error("usage: traw auth <qwen|glm|list|activate>")
        log.info("  traw auth qwen     - register qwen account")
        log.info("  traw auth glm      - register glm/z.ai account")
        log.info("  traw auth list     - list all tokens")
        log.info("  traw auth activate <id> - activate token")
        process.exit(1)
      }
    } catch (err: any) {
      log.error(err.message)
      process.exit(1)
    } finally {
      stopMo()
    }
    return
  }

  if (cmd !== "run") {
    console.error(`unknown command: ${cmd}`)
    process.exit(1)
  }

  const moUrl = typeof values.mo === "string" ? values.mo : defaultConfig.moUrl
  const apiUrl = typeof values.api === "string" ? values.api : undefined
  const apiKey = typeof values["api-key"] === "string" ? values["api-key"] : defaultConfig.apiKey

  let model: string
  if (typeof values.model === "string") {
    model = values.model
  } else {
    const provider: Provider = "qwen"
    model = values.fast ? providerModels[provider].fast : providerModels[provider].default
  }

  const steps = typeof values.steps === "string" ? parseInt(values.steps) : defaultConfig.maxSteps

  const config: AgentConfig = {
    moUrl,
    apiUrl,
    apiKey,
    model,
    thinking: values.fast !== true && values["no-planning"] !== true,
    headless: values.headed === true ? false : (values.headless === true || defaultConfig.headless),
    recordVideo: values.video === true,
    maxSteps: steps,
    debug: values.debug === true,
    jsonOutput: values.json === true,
  }

  const goal = positionals.slice(1).join(" ")
  if (!goal) {
    log.error("provide a goal: traw run \"your goal\"")
    process.exit(1)
  }

  if (!config.jsonOutput) {
    log.header(goal)
    log.config({
      mo: config.apiUrl || config.moUrl,
      model: config.model,
      headless: config.headless,
      video: config.recordVideo,
      vision: false,
      steps: config.maxSteps,
    })
  } else {
    setSilent(true)
  }

  if (!config.apiUrl && !await ensureMo(config.moUrl)) {
    process.exit(1)
  }

  const agent = new Agent(config)

  try {
    const result = await agent.run(goal)

    if (config.jsonOutput) {
      const output = {
        success: true,
        goal,
        steps: result.history,
        video: result.video,
      }
      console.log(JSON.stringify(output))
    } else if (result.video) {
      log.video(result.video)
    }
  } catch (err: any) {
    if (config.jsonOutput) {
      const output = {
        success: false,
        goal,
        error: err.message,
      }
      console.log(JSON.stringify(output))
      process.exit(1)
    }
    log.error(err.message)
    process.exit(1)
  } finally {
    stopMo()
  }
}

main()
