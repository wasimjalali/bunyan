import { describe, it, expect } from 'vitest'
import { pastedPathsText } from './drop-paste'

describe('pastedPathsText', () => {
  it('passes a plain path through with a trailing space', () => {
    expect(pastedPathsText(['/Users/w/shot.png'])).toBe('/Users/w/shot.png ')
  })

  it('backslash-escapes spaces and shell metacharacters like Terminal.app', () => {
    expect(pastedPathsText(['/Users/w/Screen Shot (1).png'])).toBe(
      '/Users/w/Screen\\ Shot\\ \\(1\\).png ',
    )
  })

  it("escapes quotes, dollar signs and ampersands", () => {
    expect(pastedPathsText(["/tmp/it's $5 & up.png"])).toBe(
      "/tmp/it\\'s\\ \\$5\\ \\&\\ up.png ",
    )
  })

  it('joins several files with single spaces', () => {
    expect(pastedPathsText(['/a/one.png', '/b/two two.png'])).toBe(
      '/a/one.png /b/two\\ two.png ',
    )
  })

  it('returns an empty string when no usable paths are given', () => {
    expect(pastedPathsText([])).toBe('')
    expect(pastedPathsText([''])).toBe('')
  })
})
