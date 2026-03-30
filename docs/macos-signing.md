# macOS Signing Setup

Sentinel's release workflow can sign and notarize the macOS app when the expected GitHub Actions secrets are present. If the secrets are missing, the macOS release still builds, but it is left unsigned.

## GitHub Secrets

Add these repository or environment secrets before publishing a signed macOS release:

- `APPLE_SIGNING_CERT_BASE64`: base64-encoded `Developer ID Application` `.p12` certificate export.
- `APPLE_SIGNING_CERT_PASSWORD`: password used when exporting the `.p12` certificate.
- `APPLE_ID`: Apple ID email used for notarization.
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for that Apple ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID for the Developer ID certificate.

`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are only required for notarization. If they are omitted, the workflow signs the app but does not notarize it.

## Checklist To Get The Keys

1. Enroll in the Apple Developer Program for the team that will publish Sentinel.
2. Create or confirm a `Developer ID Application` certificate in Apple Developer or Xcode.
3. Import that certificate into Keychain Access on a Mac.
4. In Keychain Access, open `login` -> `My Certificates`, select the `Developer ID Application` certificate, and export it as a `.p12` file.
5. Choose a strong export password and keep it. That becomes `APPLE_SIGNING_CERT_PASSWORD`.
6. Convert the `.p12` file to a single-line base64 string. On macOS: `base64 -i DeveloperIDApplication.p12 | pbcopy`
7. Save that base64 output into the `APPLE_SIGNING_CERT_BASE64` GitHub secret.
8. Get the Apple ID email that will submit notarization requests. That becomes `APPLE_ID`.
9. Generate an app-specific password for that Apple ID at [appleid.apple.com](https://appleid.apple.com). That becomes `APPLE_APP_SPECIFIC_PASSWORD`.
10. Find the team identifier in the Apple Developer portal membership details. That becomes `APPLE_TEAM_ID`.
11. Add all five values as GitHub Actions secrets.
12. Trigger `publish-release` for a macOS build and confirm the workflow summary says signing and notarization are enabled.

## Notes

- The macOS build is configured with hardened runtime and explicit entitlements in [package.json](/Users/mohamedachaq/rework/cronacl-saas/sentinel/package.json), [entitlements.mac.plist](/Users/mohamedachaq/rework/cronacl-saas/sentinel/build/entitlements.mac.plist), and [entitlements.mac.inherit.plist](/Users/mohamedachaq/rework/cronacl-saas/sentinel/build/entitlements.mac.inherit.plist).
- The release workflow maps the GitHub secrets to Electron Builder's expected environment variables (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
- The current setup uses the Apple ID notarization path because it is simpler to bootstrap. Electron Builder also supports App Store Connect API key notarization if you want to switch later. This note is based on the official Electron Builder docs: [Setup](https://www.electron.build/code-signing.html), [MacOS](https://www.electron.build/code-signing-mac.html), and [MacConfiguration notarize](https://www.electron.build/electron-builder.interface.macconfiguration).
