export interface FixtureAnnotation {
  fixture: string
  description: string
  expectedPageRole?: string
  expectedSectionRoles: string[]
  minSections: number
  expectedComponentTypes: string[]
  expectedComponentRoles?: string[]
  expectedElementKinds?: string[]
  expectedDesktopComponentCounts?: Record<string, number>
  expectedDesignDocComponentCounts?: Record<string, number>
  minSafelyObservedInteractions: number
  expectedResponsiveChangeTypesAny: string[]
  minMediaLayers: number
  expectedMediaKinds: string[]
  expectedSalienceTraits: string[]
  minSectionCoverage: number
  expectedFeatureTags?: string[]
  forbiddenFeatureTags?: string[]
  expectedDeterministicClaims?: string[]
  expectedPrimary?: string
  forbiddenPrimary?: boolean
  expectedColorTokens?: Record<string, string>
  expectedSemanticPairs?: Record<string, { observedBackground?: string; observedForeground?: string }>
  forbiddenGenericAccents?: string[]
  expectedObservedPrimaryForeground?: string
  expectedPrimaryContrastRatio?: number
  expectedTitle?: string
  forbiddenScalarRadii?: string[]
  expectedStructuralTreatments?: {
    gradientType?: string
    gradientDirection?: string
    gradientStops?: string[]
    borderRadii?: string[]
  }
  maxMajorMediaRegions?: number
  expectedMaxWidths?: string[]
  expectedStickySections?: Array<{ role: string; height: string }>
  expectedResponsiveColumns?: Array<{ from: number; to: number }>
  expectedResponsiveValues?: Array<{ property: string; from: string; to: string }>
  expectedPseudoKinds?: string[]
  expectedLayoutBorders?: string[]
  expectedInteractionValues?: Array<{ driver: string; property: string; from: string; to: string }>
  forbiddenColors?: string[]
  forbiddenFontFamilies?: string[]
  expectedDesignDocStrings?: string[]
  expectedReconstructionSummaryStrings?: string[]
}
