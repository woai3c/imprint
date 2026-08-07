import { Loader2, Sparkles } from 'lucide-react'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { DesignIntelligenceMeta } from '../../../core/design-intelligence/types'

interface ExampleBlock {
  title: string
  html: string
}

const MAX_FRAME_HEIGHT = 480
const MIN_FRAME_HEIGHT = 48

export function parseExampleComponents(designDoc: string): ExampleBlock[] {
  const sectionMatch = /^## (?:Example Components|示例组件)\s*$/m.exec(designDoc)
  if (!sectionMatch) return []
  const rest = designDoc.slice(sectionMatch.index)
  const nextSection = rest.slice(2).search(/^## /m)
  const section = nextSection === -1 ? rest : rest.slice(0, nextSection + 2)

  const blocks: ExampleBlock[] = []
  const blockPattern = /###\s+(.+?)\r?\n+```html\r?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(section)) !== null) {
    blocks.push({ title: match[1].trim(), html: match[2].trim() })
  }
  return blocks
}

interface ExampleComponentsProps {
  designDoc: string
  cssVariables: string
  generation?: DesignIntelligenceMeta['exampleGeneration']
  generating?: boolean
  canGenerate?: boolean
  onGenerate?: () => void
}

export function ExampleComponents({
  designDoc,
  cssVariables,
  generation,
  generating,
  canGenerate,
  onGenerate,
}: ExampleComponentsProps) {
  const { t } = useTranslation()
  const examples = useMemo(
    () => (generation?.status === 'complete' ? parseExampleComponents(designDoc) : []),
    [designDoc, generation?.status],
  )

  if (examples.length === 0) {
    if (!canGenerate) return null
    const failed = generation?.status === 'failed'
    const failureKey = generation?.failureCode || 'validation-failed'
    return (
      <section data-testid="example-generation" className="rounded-xl border border-border/60 bg-card/50 p-6">
        <h3 className="text-base font-semibold text-foreground">{t('preview.exampleGeneration.title')}</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          {failed ? t(`preview.exampleGeneration.failures.${failureKey}`) : t('preview.exampleGeneration.description')}
        </p>
        <button
          type="button"
          data-testid="generate-examples"
          onClick={onGenerate}
          disabled={generating}
          className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {t(generating ? 'preview.exampleGeneration.generating' : 'preview.exampleGeneration.action')}
        </button>
      </section>
    )
  }

  return (
    <section data-testid="example-components" className="rounded-xl border border-border/60 bg-card/50 p-6">
      <h3 className="mb-1 text-base font-semibold text-foreground">{t('preview.exampleComponents')}</h3>
      <p className="mb-5 text-xs text-muted-foreground">{t('preview.exampleComponentsHint')}</p>
      <div className="space-y-5">
        {examples.map((example) => (
          <ExampleFrame key={example.title} example={example} cssVariables={cssVariables} />
        ))}
      </div>
    </section>
  )
}

function ExampleFrame({ example, cssVariables }: { example: ExampleBlock; cssVariables: string }) {
  const [height, setHeight] = useState(120)

  const srcDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
${cssVariables}
html, body { margin: 0; padding: 0; background: transparent; }
body { padding: 16px; box-sizing: border-box; }
</style>
</head>
<body>
${example.html}
</body>
</html>`,
    [example.html, cssVariables],
  )

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{example.title}</p>
      <iframe
        data-testid="example-component-frame"
        title={example.title}
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument
          if (!doc) return
          const measured = doc.documentElement.scrollHeight
          setHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, measured + 2)))
        }}
        style={{ height }}
        className="w-full overflow-hidden rounded-lg border border-border/60 bg-background"
      />
    </div>
  )
}
