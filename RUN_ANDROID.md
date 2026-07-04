# SnapaCat — Run on Android Emulator (Windows)

Quick reference for building & deploying SnapaCat to the emulator.

## What was broken → fixed
- **Build compiled all 4 CPU ABIs** (slow / timeouts) → now **x86_64 only** in `android/gradle.properties` (heap also raised to 4 GB). Restore all four ABIs before a release build.
- **`Android SDK Command-line Tools (latest)` missing** → installed via SDK Manager. This clears the harmless `CXX5304 ... SDK XML version 4` warning.
- **`adb` / `emulator` not on PATH** → the RN CLI couldn't see the running emulator. Fixed by the one-time setup below.

Your SDK is at `C:\Users\twota\AppData\Local\Android\Sdk`. Platform-Tools (adb 37.0.0), Emulator (36.6.11), NDK 27.1.12297006 and CMake are all already installed.

## One-time setup — ANDROID_HOME + PATH
Paste into **PowerShell**. This appends to your *user* PATH without truncating it (safer than `setx`):

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdk, "User")
$add  = @("$sdk\platform-tools", "$sdk\emulator")
$cur  = [Environment]::GetEnvironmentVariable("Path","User")
$parts = @($cur -split ';' | Where-Object { $_ -ne '' })
foreach ($p in $add) { if ($parts -notcontains $p) { $parts += $p } }
[Environment]::SetEnvironmentVariable("Path", ($parts -join ';'), "User")
Write-Host "Done. CLOSE this terminal and open a NEW one."
```

**Then close ALL terminals and open a new PowerShell** (PATH only refreshes in new shells).

## Verify
```powershell
adb version            # should print a version, not "not recognized"
adb devices            # should list your emulator, e.g. emulator-5554   device
```
If `adb devices` is empty, your emulator isn't connected. Start it using the AVD name from `emulator -list-avds` (yours is `medium_phone`) — **no angle brackets** (`<` is a reserved char in PowerShell):

```powershell
Start-Process emulator -ArgumentList '-avd','medium_phone'
```

Wait for the Android home screen, then re-run `adb devices`.

## Build & run
**Step 1 — start the emulator (detached, so your terminal stays free):**
```powershell
Start-Process emulator -ArgumentList '-avd','medium_phone'
```
> ⚠️ Running `emulator -avd medium_phone` *without* `Start-Process` takes over that window — it becomes the emulator and won't accept more commands. If you do that, just open a **second** PowerShell window for the build (right-click Start → Terminal). Don't close the emulator's window.

**Step 2 — once the Android home screen is up, build & run:**
```powershell
cd G:\Projects\SnapaCat
adb reverse tcp:8081 tcp:8081     # lets the app reach Metro
npx react-native run-android      # builds x86_64 only now -> much faster
```
`run-android` auto-starts Metro in a new window. Leave it open.

## Reliable fallback (if the RN CLI throws the `gradlew.bat not found` error)
Build straight through Gradle, which bypasses the CLI path bug:

```powershell
# Terminal 1 — Metro:
cd G:\Projects\SnapaCat
npx react-native start

# Terminal 2 — build + install to the running emulator:
cd G:\Projects\SnapaCat\android
.\gradlew.bat installDebug
# then launch the app:
adb shell monkey -p com.ahtomic.snapacat -c android.intent.category.LAUNCHER 1
```

## "Unable to load script" — red screen on the emulator
The app installed fine but can't reach Metro. In a terminal where adb works (not the Metro window):
```powershell
adb reverse tcp:8081 tcp:8081
```
Then on the emulator press **R, R** (or tap RELOAD). Re-run that `adb reverse` line any time you cold-start the emulator. Keep the Metro terminal running the whole time.

**If Metro is confirmed up (`http://127.0.0.1:8081/status` returns `packager-status:running`) and `adb reverse --list` shows the entry, but the app is STILL red:** the app instance is stale — it launched before the link was healthy, and the redbox Reload won't reconnect it. Relaunch it fresh (keep Metro running):
```powershell
cd G:\Projects\SnapaCat
npx react-native run-android
```
Still red? Reset adb (clears duplicate/stale adb servers, e.g. Android Studio's vs platform-tools'), then relaunch:
```powershell
adb kill-server; adb start-server
adb reverse tcp:8081 tcp:8081
adb shell am force-stop com.ahtomic.snapacat
adb shell monkey -p com.ahtomic.snapacat -c android.intent.category.LAUNCHER 1
```

## Notes
- First build after the ABI change recompiles native code once; later builds are incremental and fast.
- The `react-native-worklets` "Hard link ... Doing a slower copy instead" lines are warnings, not errors.
