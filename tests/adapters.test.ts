import { describe, expect, it } from 'vitest'
import { createAdapter } from '../src/adapters/index.ts'
import { FIXTURE } from './helpers/fixture.ts'

const ids = (items: { id: string }[]) => items.map((i) => i.id)

describe('json-i18n adapter', () => {
  const a = createAdapter(
    {
      type: 'json-i18n',
      files: { th: 'locales/th.json', en: 'locales/en.json' },
      routes: { files: ['src/**/*.ts'], pattern: "path: '([^']+)'" },
      roles: { files: ['src/routes.ts'], pattern: 'ROLES = \\[([^\\]]+)\\]' },
      data: { limits: 'src/limits.json' },
    },
    FIXTURE,
  )
  it('flattens nested JSON strings per language', () => {
    expect(a.uiStrings('th').get('class.new')).toBe('สร้างห้องเรียน')
    expect(a.uiStrings('en').get('login.submit')).toBe('Sign in')
    expect(a.uiStrings('fr').size).toBe(0)
  })
  it('lists routes and roles found with regexes (quoted lists are split)', () => {
    expect(ids(a.items())).toEqual(['role:admin', 'role:teacher', 'route:/classes', 'route:/login'])
  })
  it('reads data values by namespace path', () => {
    expect(a.data('limits.class.maxStudents')).toBe('40')
    expect(a.data('limits.class.nope')).toBeUndefined()
    expect(a.data('nope.x')).toBeUndefined()
  })
})

describe('generic adapter', () => {
  it('extracts strings with key/value groups', () => {
    const a = createAdapter(
      { type: 'generic', strings: { en: { files: ['src/routes.ts'], pattern: "component: '(?<value>[^']+)'.*?" } }, data: {} },
      FIXTURE,
    )
    // no key group: the value is its own key
    expect([...a.uiStrings('en').keys()]).toEqual(['Login', 'Classes'])
  })
  it('extracts flags', () => {
    const a = createAdapter({ type: 'generic', strings: {}, flags: { files: ['src/routes.ts'], pattern: 'FLAGS = \\{ (\\w+):' }, data: {} }, FIXTURE)
    expect(ids(a.items())).toEqual(['flag:NEW_REPORTS'])
  })
})
