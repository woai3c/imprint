export interface FixtureAnnotation {
  fixture: string
  description: string
  expectedPageRole?: string
  expectedSectionRoles: string[]
  minSections: number
  expectedComponentTypes: string[]
  minSafelyObservedInteractions: number
  expectedResponsiveChangeTypesAny: string[]
  minMediaLayers: number
  expectedMediaKinds: string[]
  expectedSalienceTraits: string[]
  minSectionCoverage: number
  expectedFeatureTags?: string[]
  forbiddenFeatureTags?: string[]
  maxMajorMediaRegions?: number
  referenceProfile: {
    thesis: string
    signatureMoves: string[]
    transferPreserve: string[]
    transferAvoid: string[]
  }
}
