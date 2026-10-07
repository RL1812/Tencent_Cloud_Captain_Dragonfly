import fs from 'fs'
import os from 'os'
import path from 'path'

// Precedents are written to disk; keep test runs out of the real data/ folder
const precedentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'precedents-'))
process.env.PRECEDENTS_FILE = path.join(precedentsDir, 'precedents.json')

afterAll(() => {
  fs.rmSync(precedentsDir, { recursive: true, force: true })
})
