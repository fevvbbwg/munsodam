import test from 'node:test'
import assert from 'node:assert/strict'
import { isImeCompositionEvent, shouldClearSearchOnEscape } from '../src/keyboardInput.mjs'

test('recognizes an active input method composition', () => {
  assert.equal(isImeCompositionEvent({ isComposing: true, keyCode: 27 }), true)
})

test('recognizes the legacy composition key code', () => {
  assert.equal(isImeCompositionEvent({ isComposing: false, keyCode: 229 }), true)
})

test('allows ordinary keyboard events through', () => {
  assert.equal(isImeCompositionEvent({ isComposing: false, keyCode: 75 }), false)
})

test('clears a non-empty filter on Escape', () => {
  assert.equal(shouldClearSearchOnEscape({ key: 'Escape', isComposing: false, keyCode: 27 }, true), true)
})

test('keeps Escape for IME composition and empty filters', () => {
  assert.equal(shouldClearSearchOnEscape({ key: 'Escape', isComposing: true, keyCode: 27 }, true), false)
  assert.equal(shouldClearSearchOnEscape({ key: 'Escape', isComposing: false, keyCode: 27 }, false), false)
})
