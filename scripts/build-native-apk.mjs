// Build the NATIVE Android (Kotlin/Jetpack Compose) Auralis client APK.
//
// This is the from-scratch native rewrite of the mobile app (android-native/),
// replacing the old Capacitor WebView shell. It talks to a self-hosted Auralis
// server over the same HTTP API the web app uses, and plays audio natively with
// Media3/ExoPlayer (real background playback + lock-screen controls).
//
// Requires the Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT or ~/Android/Sdk) and a
// JDK 17+. Pass `--offline` (or set AURALIS_OFFLINE=1) to build against the Gradle
// cache without network access.

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const projectDir = path.join(root, "android-native");

if (!existsSync(path.join(projectDir, "settings.gradle.kts"))) {
  console.error("[native-apk] android-native/ project not found.");
  process.exit(1);
}

const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (existsSync(path.join(os.homedir(), "Android", "Sdk")) ? path.join(os.homedir(), "Android", "Sdk") : "");

if (!sdk) {
  console.error("[native-apk] Android SDK not found. Set ANDROID_HOME or install the SDK at ~/Android/Sdk.");
  process.exit(1);
}

const gradlew = path.join(projectDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const offline = process.env.AURALIS_OFFLINE === "1" || process.argv.includes("--offline");
// Ship the RELEASE build by default: the debug variant is `android:debuggable`
// and would let anyone with ADB attach a debugger / read the session token. The
// release variant is signed with the same stable key (auralis.keystore) so it
// still installs as an update over any previously-shipped build. Pass
// `--debug` for a quick local iteration build when you don't need release flags.
const debug = process.argv.includes("--debug");
const task = debug ? "assembleDebug" : "assembleRelease";
const args = [task, offline ? "--offline" : ""].filter(Boolean).join(" ");

console.log(`[native-apk] Using SDK: ${sdk}${offline ? " (offline)" : ""}`);
try {
  execSync(`"${gradlew}" ${args}`, {
    cwd: projectDir,
    stdio: "inherit",
    env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
  });
} catch (error) {
  console.error("[native-apk] Gradle build failed:", error.message);
  process.exit(1);
}

const variant = debug ? "debug" : "release";
const apkName = debug ? "app-debug.apk" : "app-release.apk";
const apk = path.join(projectDir, "app", "build", "outputs", "apk", variant, apkName);
console.log(existsSync(apk) ? `[native-apk] APK ready: ${apk}` : "[native-apk] Build finished but APK not found at the expected path.");
