import test from 'node:test'
import assert from 'node:assert/strict'
import { adminTagIds, adminTagNames } from '../src/utils/blogAdminTags.js'
test('legacy names resolve to IDs and modern IDs retain priority', () => {
  const library = [{ id: 'a', name: 'Known' }]
  assert.deepEqual(adminTagIds({ tags: ['Known'], tag_ids: [] }, library), ['a'])
  assert.deepEqual(adminTagIds({ tags: ['Known'], tag_ids: ['b'] }, library), ['b'])
})
test('save removes unchecked managed names without deleting unregistered legacy tags', () => {
  const library = [{ id: 'a', name: 'Known' }]
  assert.deepEqual(adminTagNames({ tag_ids: [], tags: ['Known', 'Unregistered'] }, library), ['Unregistered'])
  assert.deepEqual(adminTagNames({ tag_ids: ['a'], tags: [] }, library), ['Known'])
})
