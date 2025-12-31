import { VERSION } from "../utils/version"

export function printHelp() {
  console.log(`
traw v${VERSION} - AI browser agent

Usage:
  traw run "your goal here"
  traw auth
  traw upd

Commands:
  run           execute browser agent with a goal
  auth          register new account and set as default
  upd           check for updates

Options:
  --fast        use fast model (glm-4-flash, no thinking)
  --headless    run without visible browser (default)
  --headed      show browser window
  --video       enable video recording
  --vision      send screenshots to AI (visual mode)
  --steps=N     max steps (default: 20)
  --mo=URL      mo server url (default: http://localhost:8804)
  -v, --version show version

Examples:
  traw auth
  traw run "find the weather in Moscow"
  traw run --fast "quick search for bun.js"
  traw run --video "search for documentation"
`)
}
