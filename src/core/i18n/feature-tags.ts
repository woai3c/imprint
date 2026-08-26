import { type CoreLanguage, coreT } from './index.js'

const FEATURE_TAG_KEYS: Record<string, string> = {
  'monospace typography': 'monospaceTypography',
  'serif editorial style': 'serifEditorialStyle',
  'single-font system': 'singleFontSystem',
  'monochrome palette': 'monochromePalette',
  'large-radius rounded style': 'largeRadiusRoundedStyle',
  'compact-radius surfaces observed': 'compactRadiusSurfaces',
  'no stable shadow scale observed': 'noStableShadowScale',
  'layered elevation system': 'layeredElevationSystem',
  'weight contrast hierarchy': 'weightContrastHierarchy',
  'extensive CSS variable usage': 'extensiveCssVariableUsage',
  'section-level gradient and compound-radius treatments observed': 'sectionGradientAndCompoundRadius',
  'section-level gradient treatments observed': 'sectionGradient',
  'section-level compound-radius treatments observed': 'sectionCompoundRadius',
  'single dominant action family with multicolor decorative accents': 'dominantActionWithDecorativeAccents',
  'neutral palette with a single accent': 'neutralPaletteSingleAccent',
  'rich color system': 'richColorSystem',
}

export function localizeFeatureTag(tag: string, language: CoreLanguage): string {
  const spacing = tag.match(/^spacing rhythm led by (.+)$/)
  if (spacing) {
    const values = spacing[1].replace(/,\s*/g, coreT(language, 'common.listSeparator'))
    return coreT(language, 'export.featureTags.spacingRhythm', { values })
  }

  const key = FEATURE_TAG_KEYS[tag]
  return key ? coreT(language, `export.featureTags.${key}`) : tag
}
