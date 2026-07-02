import { describe, it, expect } from 'vitest'
import { MeetingTypeSchema, MoMSchema } from '../../src/shared/schemas/index'
import { ZodError } from 'zod'

describe('MeetingTypeSchema', () => {
  it('accepts each of the 4 allowed meeting-type values', () => {
    for (const value of ['general', 'standup', '1:1', 'planning'] as const) {
      expect(MeetingTypeSchema.parse(value)).toBe(value)
    }
  })

  it('rejects a value outside the 4 allowed types', () => {
    expect(MeetingTypeSchema.safeParse('bogus').success).toBe(false)
  })
})

describe('MoMSchema with meeting_type', () => {
  it('parses a MoM object carrying a valid meeting_type', () => {
    const result = MoMSchema.parse({
      markdown_content: '# Minutes of Meeting\n\nStandup notes.',
      meeting_type: 'standup',
    })
    expect(result.markdown_content).toBe('# Minutes of Meeting\n\nStandup notes.')
    expect(result.meeting_type).toBe('standup')
  })

  it('throws ZodError when meeting_type is missing', () => {
    expect(() => MoMSchema.parse({ markdown_content: '# Minutes of Meeting' })).toThrow(ZodError)
  })

  it('throws ZodError when meeting_type is not one of the 4 allowed values', () => {
    expect(() =>
      MoMSchema.parse({ markdown_content: '# Minutes of Meeting', meeting_type: 'invalid' })
    ).toThrow(ZodError)
  })
})
