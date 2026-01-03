import { VERSION } from "../utils/version"

export function printHelp() {
  console.log(`
traw v${VERSION} - AI browser agent

Usage:
  traw run "your goal here"
  traw auth <provider>
  traw upd

Commands:
  run                    execute browser agent with a goal
  auth qwen              register qwen account (chat.qwen.ai)
  auth glm               register glm account (z.ai)
  auth list [provider]   list tokens (all or by provider)
  auth activate <id>     activate token by id
  upd                    check for updates

Models:
  qwen: coder-model (default), vision-model (--fast)
  glm:  GLM-4-Plus, GLM-4-Flash, GLM-4-Air, GLM-4-6-API-V1

Options:
  --fast        use fast model (vision-model for qwen, GLM-4-Flash for glm)
  --no-planning skip planning phase, go straight to execution
  --headless    run without visible browser (default)
  --headed      show browser window
  --video       enable video recording
  --steps=N     max steps (default: 20)
  --mo=URL      mo server url (default: http://localhost:8804)
  --api=URL     custom OpenAI-compatible API url (bypasses mo)
  --api-key=KEY API key for custom endpoint (or use OPENAI_API_KEY env)
  --model=NAME  model name (default: coder-model)
  -v, --version show version

Examples:
  traw auth qwen
  traw auth glm
  traw auth list
  traw auth activate abc123
  traw run "find the weather in Moscow"
  traw run --model=GLM-4-Plus "search for news"
  traw run --fast "quick search for bun.js"
  traw run --video "search for documentation"
`)
}
