import type { EconomyServer } from '../types/api'

// Chooses which world the item page's AH panels focus on: the player's default
// world if it's currently being scraped, else the first enabled world, else null
// (no world enabled → the whole AH section is hidden by the caller).
export function resolveDefaultServer(
  servers: EconomyServer[],
  userDefault: string | null | undefined,
): string | null {
  if (servers.length === 0) return null
  if (userDefault && servers.some(s => s.name === userDefault)) return userDefault
  return servers[0].name
}
