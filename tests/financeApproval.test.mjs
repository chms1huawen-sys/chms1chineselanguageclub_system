import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canReviewFinanceStage } from '../src/utils/financeApproval.js'

test('finance approval separates treasury, president and teacher duties', () => {
  for (const role of ['advisor_teacher', 'convener_teacher', 'advisor']) {
    const profile = { role, can_manage_finance: true, can_approve_finance: true }
    assert.equal(canReviewFinanceStage(profile, 'treasury'), false)
    assert.equal(canReviewFinanceStage(profile, 'president'), false)
    assert.equal(canReviewFinanceStage(profile, 'teacher'), true)
  }
  assert.equal(canReviewFinanceStage({ role: 'chairperson', can_manage_finance: true }, 'treasury'), false)
  assert.equal(canReviewFinanceStage({ role: 'chairperson' }, 'president'), true)
  for (const role of ['treasurer', 'vice_treasurer']) {
    assert.equal(canReviewFinanceStage({ role }, 'treasury'), true)
    assert.equal(canReviewFinanceStage({ role }, 'president'), false)
    assert.equal(canReviewFinanceStage({ role, is_active: false }, 'treasury'), false)
  }
  assert.equal(canReviewFinanceStage({ role: 'custom', can_manage_finance: true }, 'treasury'), true)
  assert.equal(canReviewFinanceStage({ role: 'custom', can_approve_finance: true }, 'president'), true)
  assert.equal(canReviewFinanceStage({ role: 'ordinary_member' }, 'treasury'), false)
  assert.equal(canReviewFinanceStage({ role: 'treasurer' }, 'approved'), false)
})
