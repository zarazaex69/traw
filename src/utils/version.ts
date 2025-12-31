import pkg from "../../package.json"

export const VERSION = pkg.version

const GITHUB_REPO = "zarazaex69/traw"
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

interface GithubRelease {
  tag_name: string
  html_url: string
}

export async function checkForUpdates(): Promise<{
  hasUpdate: boolean
  current: string
  latest: string
  url: string
} | null> {
  try {
    const resp = await fetch(RELEASES_API, {
      headers: { "User-Agent": "traw-cli" },
    })

    if (!resp.ok) return null

    const release = await resp.json() as GithubRelease
    const latest = release.tag_name.replace(/^v/, "")
    const current = VERSION.replace(/^v/, "")

    return {
      hasUpdate: latest !== current,
      current: VERSION,
      latest: release.tag_name,
      url: release.html_url,
    }
  } catch {
    return null
  }
}
