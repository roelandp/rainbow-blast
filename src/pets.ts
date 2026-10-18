/** The pet each player plays with: Katrien for Wyne (Rainbow Island), Kit Nugget for Viggo (Kit Nugget Eiland). */
export type PetId = 'katrien' | 'kitnugget'

export interface Pet {
  id: PetId
  name: string
  /** Dutch pronouns: subject ("zij" / "hij") and object ("haar" / "hem"). */
  zij: string
  haar: string
  /** Folder with model.glb, the pose sprites and meow-1, meow-2 and purr. */
  dir: string
}

export const PETS: Record<PetId, Pet> = {
  katrien: { id: 'katrien', name: 'Katrien', zij: 'zij', haar: 'haar', dir: 'pets/katrien/' },
  kitnugget: { id: 'kitnugget', name: 'Kit Nugget', zij: 'hij', haar: 'hem', dir: 'pets/kitnugget/' },
}

/** The current player's pet; screens read it when they build their texts. */
export const pet: Pet = { ...PETS.katrien }

export function setPet(id: PetId | undefined): void {
  Object.assign(pet, PETS[id ?? 'katrien'] ?? PETS.katrien)
}
