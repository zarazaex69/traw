// version is baked at build time via BUILD_VERSION env
export const VERSION = process.env.BUILD_VERSION || "dev"

const GITHUB_REPO = "zarazaex69/traw"
const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

interface GithubRelease {
  tag_name: string
  html_url: string
  published_at: string
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

    // simple version compare (works for semver)
    const hasUpdate = latest !== current && current !== "dev"

    return {
      hasUpdate,
      current: VERSION,
      latest: release.tag_name,
      url: release.html_url,
    }
  } catch {
    return null
  }
}
