import process from 'node:process'
import { getPublicSnapshot } from '../server/publicSnapshot.js'
import { createPublicSnapshotHandler } from '../server/publicSnapshotHandler.js'

export default createPublicSnapshotHandler({ env: process.env, snapshot: getPublicSnapshot })
