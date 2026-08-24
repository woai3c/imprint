export const FONT_SIZE_NAMES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']
export const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl']
export const SHADOW_NAMES = ['sm', 'md', 'lg', 'xl']
export const LETTER_SPACING_NAMES = ['tight', 'normal', 'wide', 'wider', 'widest']
export const LINE_HEIGHT_NAMES = ['tight', 'snug', 'normal', 'relaxed', 'loose']
export const DURATION_NAMES = ['fast', 'normal', 'slow', 'slower', 'slowest']

export function proseDurationName(index: number): string {
  return DURATION_NAMES[index] || `duration-${index + 1}`
}

export function tailwindFontWeightName(value: string, index: number): string {
  const standardNames: Record<string, string> = {
    '100': 'thin',
    '200': 'extralight',
    '300': 'light',
    '400': 'normal',
    '500': 'medium',
    '600': 'semibold',
    '700': 'bold',
    '800': 'extrabold',
    '900': 'black',
  }
  return standardNames[value] || value.replace(/[^\w-]/g, '') || `${index + 1}`
}
