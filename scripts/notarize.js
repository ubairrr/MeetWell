'use strict'

const { notarize } = require('@electron/notarize')
const path = require('path')

exports.default = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context

  if (electronPlatformName !== 'darwin') {
    return
  }

  const { APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID } = process.env

  if (!APPLE_ID || !APPLE_ID_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize] Skipping — APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID not set')
    return
  }

  const appName = packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`[notarize] Notarizing ${appPath}...`)

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_ID_PASSWORD,
    teamId: APPLE_TEAM_ID,
  })

  console.log('[notarize] Notarization complete.')
}
