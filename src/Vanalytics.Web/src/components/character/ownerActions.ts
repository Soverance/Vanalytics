import type { CharacterOwner } from '../../types/api'

/** Display name for the owning account, falling back to the username. */
export function ownerDisplayLabel(owner: CharacterOwner): string {
  return owner.ownerDisplayName ?? owner.ownerUsername
}

/** Whether to render the Message button for the character owner. */
export function shouldShowMessageButton(owner: CharacterOwner | null | undefined): boolean {
  return !!owner && owner.canMessage
}
