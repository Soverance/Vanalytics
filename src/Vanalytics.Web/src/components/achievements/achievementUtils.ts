/** Returns true when both ranks are null, indicating a private character. */
export function isPrivateRanking(globalRank: number | null, serverRank: number | null): boolean {
  return globalRank == null && serverRank == null
}
