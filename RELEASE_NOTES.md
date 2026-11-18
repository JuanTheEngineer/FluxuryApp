# Fluxury release notes

## v0.1.0-beta — Trustworthy beta (2026-11-18)

The first release for testers other than Juan: write lyrics over a beat, on any device, without losing a bar.

**Live at:** [www.fluxury.app](https://www.fluxury.app). Invite-only: accounts are created with `scripts/create-tester.sh`.

### What you can do

- **Write over a beat.** Pick one of the beats, or write without one. The player has play/pause, skip ±5 s, loop, a seek bar and volume, and remembers where you were in each session.
- **Your lyrics save as you type.** "Saved" means they're on the server. If you lose connection, they're kept on your device and sent when you're back online.
- **Write on more than one device.** Open a session anywhere and you get the latest version. If two open copies disagree, nothing is overwritten: you choose **Keep my version** or **Use the latest version** (yours is kept as a separate "(my version)" session).
- **Manage sessions.** Rename a session by tapping its title; delete it from the **⋯** menu, with 5 seconds to **Undo**. If a session is deleted on another device while you're writing, you're told, and **Save as a new session** keeps what you wrote.
- **Stay signed in for 14 days.** If your login expires, you're told why and taken back to the page you were on after signing in.

### Known limitations (please don't report these)

- **No sign-up, password change or password reset in the app** yet. Ask whoever invited you.
- **The beat player looks like an early demo.** A mobile-first redesign with artwork is next (Release 3).
- **Beat names** in the player show as file names (often just "audio").
- **Older iPhones (before iOS 17.4) may not play 5 of the 6 beats** (they're stored as WebM). Newer iPhones, Android and desktop browsers are fine.
- **Adding beats from YouTube** hasn't been tested on the live site.
- **Logout** leaves you on the current page until you go somewhere else.

### Behind the scenes

- Lyrics keep 30 days of version history and session records can be restored to any second in the last 35 days ([RESTORE_RUNBOOK.md](RESTORE_RUNBOOK.md), both drilled). User data survives deleting the stack, and deletion protection is on.
- Deploys refuse to ship anything that isn't `origin/main`, and end with a live smoke check. A browser test signs in, writes, saves twice, reopens on a fresh browser and deletes, against the live site.
- Full list of changes: `git log v0.1.0-beta` (from the first commit) and the Done section of [BACKLOG.md](BACKLOG.md).

### Checks at release

| Check | Result |
|---|---|
| Frontend unit + integration tests | 273 / 273 |
| Infrastructure tests | 27 / 27 |
| Deploy guard and tester-account script tests | 10 / 10 each |
| Live smoke check, beta test on the live site | Pass |
| Live infrastructure vs code (`cdk diff`) | No differences |
