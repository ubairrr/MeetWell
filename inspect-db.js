const { app, safeStorage } = require('electron')
const Database = require('better-sqlite3-multiple-ciphers')
const fs = require('fs')
const path = require('path')

app.setName('meeting-assist')

app.whenReady().then(() => {
  const keyFile = path.join(app.getPath('userData'), '.meetingassist.key')
  const encrypted = fs.readFileSync(keyFile)
  const plainKey = safeStorage.decryptString(encrypted)

  const dbPath = path.join(app.getPath('userData'), 'meetingassist.db')
  const db = new Database(dbPath, { readonly: true })
  db.pragma(`key = '${plainKey}'`)

  const rows = db.prepare(
    'SELECT id, title, meeting_type, started_at, created_at FROM meetings ORDER BY created_at DESC LIMIT 10'
  ).all()

  console.log(JSON.stringify(rows, null, 2))

  db.close()
  app.quit()
})
