import { describe, expect, test } from 'vitest'

import { ROLE_CANDIDATE_RULES, classifyRoleCandidate } from '../../src/core/analyzer/role-candidates.js'

describe('shared action and status role candidates', () => {
  test('classifies only the action root, not nested text or icons', () => {
    const root = classifyRoleCandidate({ tagName: 'button', type: 'button', isCandidateRoot: true })
    const child = classifyRoleCandidate({ tagName: 'span', closestCandidateTagName: 'button', isCandidateRoot: false })

    expect(root).toMatchObject({ elementKind: 'button', role: 'action' })
    expect(child).toBeNull()
  })

  test('accepts a styled anchor CTA and rejects an ordinary navigation link', () => {
    expect(
      classifyRoleCandidate({
        tagName: 'a',
        href: '#quiz',
        className: 'pill',
        backgroundColor: 'rgb(234, 88, 12)',
        color: 'rgb(255, 255, 255)',
        width: 140,
        height: 40,
        paddingInline: 18,
        paddingBlock: 8,
        isCandidateRoot: true,
      }),
    ).toMatchObject({ elementKind: 'anchor', role: 'action' })
    expect(
      classifyRoleCandidate({
        tagName: 'a',
        href: '/docs',
        className: 'nav-link',
        color: 'rgb(67, 20, 7)',
        width: 64,
        height: 20,
        isCandidateRoot: true,
      }),
    ).toBeNull()
  })

  test('requires web-standard live-region semantics and keeps status intent neutral', () => {
    expect(
      classifyRoleCandidate({
        tagName: 'div',
        role: 'status',
        color: 'rgb(6, 118, 71)',
        isCandidateRoot: true,
      }),
    ).toMatchObject({ elementKind: 'status', role: 'status', statusKind: 'status', statusIntent: 'neutral' })
    expect(classifyRoleCandidate({ tagName: 'div', className: 'up', isCandidateRoot: true })).toBeNull()
    expect(classifyRoleCandidate({ tagName: 'span', className: 'status warn', isCandidateRoot: true })).toBeNull()
  })

  test('keeps interactive roots as actions when frameworks add live-region attributes', () => {
    expect(
      classifyRoleCandidate({ tagName: 'button', role: 'status', text: 'Saved', isCandidateRoot: true }),
    ).toMatchObject({ role: 'action', elementKind: 'button' })
    expect(
      classifyRoleCandidate({ tagName: 'button', ariaLive: 'polite', text: 'Updated', isCandidateRoot: true }),
    ).toMatchObject({ role: 'action', elementKind: 'button' })
    expect(
      classifyRoleCandidate({ tagName: 'div', role: 'status', text: 'Saved', isCandidateRoot: true }),
    ).toMatchObject({ role: 'status', elementKind: 'status' })
  })

  test('uses a sole native form submitter for primary actions and ignores framework naming conventions', () => {
    expect(
      classifyRoleCandidate({
        tagName: 'button',
        formAssociated: true,
        formSubmitterCount: 1,
        isCandidateRoot: true,
      }),
    ).toMatchObject({ role: 'primary-action' })
    expect(classifyRoleCandidate({ tagName: 'button', className: 'btn primary', isCandidateRoot: true })).toMatchObject(
      {
        role: 'action',
      },
    )
    expect(classifyRoleCandidate({ tagName: 'button', className: 'btn danger', isCandidateRoot: true })).toMatchObject({
      role: 'action',
    })
  })

  test.each([
    [
      { tagName: 'input', type: 'submit', formAssociated: true, formSubmitterCount: 1, isCandidateRoot: true },
      'primary-action',
    ],
    [
      { tagName: 'input', type: 'image', formAssociated: true, formSubmitterCount: 1, isCandidateRoot: true },
      'primary-action',
    ],
    [{ tagName: 'button', dataIntent: 'primary', text: 'متابعة', isCandidateRoot: true }, 'action'],
    [{ tagName: 'button', dataIntent: 'destructive', text: '削除', isCandidateRoot: true }, 'action'],
    [{ tagName: 'button', className: 'danger', text: 'Eliminar', isCandidateRoot: true }, 'action'],
  ] as const)('uses machine semantics consistently for %o', (candidate, role) => {
    expect(classifyRoleCandidate(candidate)).toMatchObject({ role })
  })

  test('keeps multiple or unassociated native submit controls hierarchy-neutral', () => {
    for (const candidate of [
      { tagName: 'button', formAssociated: true, formSubmitterCount: 2, isCandidateRoot: true },
      { tagName: 'input', type: 'submit', formAssociated: true, formSubmitterCount: 2, isCandidateRoot: true },
      { tagName: 'input', type: 'image', formAssociated: true, formSubmitterCount: 2, isCandidateRoot: true },
      { tagName: 'input', type: 'submit', isCandidateRoot: true },
    ]) {
      expect(classifyRoleCandidate(candidate)).toMatchObject({ role: 'action' })
    }
  })

  test('shares one standards-based selector contract for image submitters', () => {
    expect(ROLE_CANDIDATE_RULES.nativeActionSelector).toContain('input[type="image" i]')
    expect(ROLE_CANDIDATE_RULES.formSubmitterSelector).toContain('input[type="image" i]')
    expect(
      classifyRoleCandidate({
        tagName: 'input',
        type: 'image',
        formAssociated: true,
        formSubmitterCount: 2,
        isCandidateRoot: true,
      }),
    ).toMatchObject({ elementKind: 'input', role: 'action' })
  })

  test.each(['确认', 'Delete', '删除', 'Eliminar', '削除', 'حذف'])(
    'does not derive action intent from localized visible text: %s',
    (text) => {
      expect(classifyRoleCandidate({ tagName: 'button', text, isCandidateRoot: true })).toMatchObject({
        role: 'action',
      })
    },
  )

  test('does not treat generic button text mentioning status as a status color', () => {
    expect(
      classifyRoleCandidate({ tagName: 'button', text: 'Create new status', isCandidateRoot: true }),
    ).toMatchObject({ role: 'action' })
  })

  test('does not infer status semantics from voting action names', () => {
    expect(
      classifyRoleCandidate({
        tagName: 'button',
        className: 'VoteButton VoteButton--up',
        text: '赞同',
        isCandidateRoot: true,
      }),
    ).toMatchObject({ role: 'action' })
    expect(
      classifyRoleCandidate({
        tagName: 'button',
        className: 'VoteButton VoteButton--down',
        text: '反对',
        isCandidateRoot: true,
      }),
    ).toMatchObject({ role: 'action' })
  })

  test('keeps deep visual card style work behind a fixed candidate bound', () => {
    expect(ROLE_CANDIDATE_RULES.deepCardScanLimit).toBeGreaterThanOrEqual(250)
    expect(ROLE_CANDIDATE_RULES.deepCardScanLimit).toBeLessThanOrEqual(1500)
  })
})
