export interface AppearanceState {
  gender: string
  faceModelId: number
}

/** Genders that produce a valid model for the race (mirrors toRaceId's map). */
export function genderOptions(race?: string): string[] {
  switch (race) {
    case 'Hume':
    case 'Elvaan':
    case 'Tarutaru':
      return ['Male', 'Female']
    case 'Mithra':
      return ['Female']
    case 'Galka':
      return ['Male']
    default:
      return []
  }
}

/** Step through face variants with wrap-around. */
export function stepFace(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return current
  return (current + delta + count) % count
}

export function isDefaultAppearance(sel: AppearanceState, def: AppearanceState): boolean {
  return sel.gender === def.gender && sel.faceModelId === def.faceModelId
}

/** face-paths.json names look like "F1A"/"F8B" → "Face 1A". */
export function formatFaceLabel(name: string): string {
  const m = /^F(\d+)([AB])$/.exec(name)
  return m ? `Face ${m[1]}${m[2]}` : name
}
