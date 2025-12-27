export function printHelp() {
  console.log(`
traw - AI browser agent

Usage:
  traw run "your goal here"

Options:
  --fast        use fast model (glm-4-flash, no thinking)
  --headless    run without visible browser
  --video       enable video recording
  --steps=N     max steps (default: 20)
  --mo=URL      mo server url (default: http://localhost:8080)

Examples:
  traw run "find the weather in Moscow"
  traw run --fast "quick search for bun.js"
  traw run --video "search for documentation"
`)
}
