import { openDatabase } from '../src/db.js'
import { scheduleFirstDigest } from '../src/jobs/schedule.js'

const db = openDatabase()
const id = scheduleFirstDigest(db)
console.log(id ? `first digest scheduled: ${id}` : 'a digest is already pending')
