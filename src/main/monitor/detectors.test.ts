import { describe, it, expect } from 'vitest'
import {
  stripAnsi,
  updateTail,
  isPromptLike,
  parseTitle,
  analyzeChunk,
  titleSuggestsWaiting,
} from './detectors'
import { fixtures } from './fixtures'

describe('stripAnsi', () => {
  it('removes CSI colour codes', () => {
    expect(stripAnsi(fixtures.shellPrompt)).toBe('wasim@mac bunyan % ')
  })
  it('removes OSC title sequences', () => {
    expect(stripAnsi(fixtures.titleNormal)).toBe('')
  })
})

describe('isPromptLike', () => {
  it('recognises a zsh % prompt', () => {
    expect(isPromptLike(fixtures.shellPrompt)).toBe(true)
  })
  it('recognises a starship arrow prompt', () => {
    expect(isPromptLike(fixtures.starshipPrompt)).toBe(true)
  })
  it('does not flag mid-build output as a prompt', () => {
    expect(isPromptLike(fixtures.shellRunning)).toBe(false)
  })
  it('is false on empty input', () => {
    expect(isPromptLike('')).toBe(false)
    expect(isPromptLike('   \n')).toBe(false)
  })
})

describe('updateTail', () => {
  it('keeps only the last max chars', () => {
    expect(updateTail('abcdef', 'ghij', 4)).toBe('ghij')
    expect(updateTail('ab', 'cd', 10)).toBe('abcd')
  })
})

describe('parseTitle', () => {
  it('extracts an OSC title', () => {
    expect(parseTitle(fixtures.titleWaiting)).toBe('bunyan — waiting for input')
    expect(parseTitle(fixtures.titleNormal)).toBe('bunyan — zsh')
  })
  it('returns null when there is no title', () => {
    expect(parseTitle(fixtures.plainOutput)).toBeNull()
  })
})

describe('titleSuggestsWaiting', () => {
  it('flags a waiting title', () => {
    expect(titleSuggestsWaiting('bunyan — waiting for input')).toBe(true)
  })
  it('ignores an ordinary title', () => {
    expect(titleSuggestsWaiting('bunyan — zsh')).toBe(false)
  })
})

describe('analyzeChunk', () => {
  it('detects a bare bell', () => {
    expect(analyzeChunk(fixtures.bell)).toMatchObject({ bell: true, hasOutput: false })
  })
  it('detects Claude working from the interrupt hint', () => {
    const s = analyzeChunk(fixtures.claudeWorking)
    expect(s.claudeWorking).toBe(true)
    expect(s.claudeConfirm).toBe(false)
  })
  it('detects a Claude confirmation prompt', () => {
    const s = analyzeChunk(fixtures.claudeConfirm)
    expect(s.claudeConfirm).toBe(true)
    expect(s.claudeWorking).toBe(false)
  })
  it('treats plain program output as output without Claude signals', () => {
    const s = analyzeChunk(fixtures.plainOutput)
    expect(s).toMatchObject({ bell: false, claudeWorking: false, claudeConfirm: false, hasOutput: true })
  })
  it('does not see output in a pure title sequence', () => {
    expect(analyzeChunk(fixtures.titleNormal).hasOutput).toBe(false)
  })
  it('extracts an OSC 9 notification message', () => {
    const s = analyzeChunk('\x1b]9;Claude needs your approval\x07')
    expect(s.oscNotification).toEqual({ title: null, body: 'Claude needs your approval' })
  })
  it('extracts OSC 777 notify with title and body, ST terminator', () => {
    const s = analyzeChunk('\x1b]777;notify;Build done;3 tests failed\x1b\\')
    expect(s.oscNotification).toEqual({ title: 'Build done', body: '3 tests failed' })
  })
  it('ignores other OSC 777 subcommands and caps message length', () => {
    expect(analyzeChunk('\x1b]777;other;x\x07').oscNotification).toBeUndefined()
    const long = 'x'.repeat(300)
    expect(analyzeChunk(`\x1b]9;${long}\x07`).oscNotification).toEqual({
      title: null,
      body: 'x'.repeat(200),
    })
  })
})
