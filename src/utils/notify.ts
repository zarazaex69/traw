// desktop notifications via notify-send (linux)
import { $ } from "bun"

let hasNotifySend: boolean | null = null

export async function checkNotify(): Promise<boolean> {
  if (hasNotifySend !== null) return hasNotifySend

  try {
    await $`which notify-send`.quiet()
    hasNotifySend = true
  } catch {
    hasNotifySend = false
  }

  return hasNotifySend
}

export async function notify(title: string, body?: string): Promise<void> {
  if (!hasNotifySend) return

  try {
    if (body) {
      await $`notify-send ${title} ${body}`.quiet()
    } else {
      await $`notify-send ${title}`.quiet()
    }
  } catch {
    // ignore notification errors
  }
}
