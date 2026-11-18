/**
 * Remembers that someone was signed in on this device, so a later visit can
 * tell "your login expired" from "you never signed in". Amplify clears its own
 * storage when a refresh token is rejected, so it can't answer that itself.
 * Holds no credentials: just a flag.
 */
const KEY = 'fluxury.wasSignedIn'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // e.g. storage blocked in a private window
  }
}

export const signInMarker = {
  set(): void {
    storage()?.setItem(KEY, '1')
  },
  clear(): void {
    storage()?.removeItem(KEY)
  },
  isSet(): boolean {
    return storage()?.getItem(KEY) === '1'
  },
}
