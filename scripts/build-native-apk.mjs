// Build the NATIVE Android (Kotlin/Jetpack Compose) Auralis client APK or AAB.
//
// This is the from-scratch native rewrite of the mobile app (android-native/),
// replacing the old Capacitor WebView shell. It talks to a self-hosted Auralis
// server over the same HTTP API the web app uses, and plays audio natively with
// Media3/ExoPlayer (real background playback + lock-screen controls).
//
// Requires the Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT or ~/Android/Sdk) and a
// JDK 17+. Pass `--offline` (or set AURALIS_OFFLINE=1) to build against the Gradle
// cache without network access. Pass `--aab` to produce an Android App Bundle
// (.aab, required by Google Play for new apps) instead of an APK. Pass
// `--flavor=play|full` to pick the distribution flavor: `full` (default) keeps
// the in-app self-updater (REQUEST_INSTALL_PACKAGES); `play` strips that
// permission and disables the update check — Google Play builds get their
// updates from the store.

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
// Distribution flavor (see productFlavors in app/build.gradle.kts): `full` =
// GitHub/sideload build with the in-app self-updater; `play` = Google Play
// build without REQUEST_INSTALL_PACKAGES (updates come from the store).
const flavorArg = process.argv.find((a) => a.startsWith("--flavor="));
const flavor = flavorArg ? flavorArg.split("=")[1] : "full";
if (!["full", "play"].includes(flavor)) {
  console.error(`[native-apk] Unknown flavor "${flavor}" — use --flavor=full or --flavor=play.`);
  process.exit(1);
}
const flavorCap = flavor === "play" ? "Play" : "Full";
// `--aab` produces an Android App Bundle (.aab) — the ONLY format Google Play
// accepts for NEW apps since August 2021 (APKs remain fine for sideloading and
// the in-app updater). Same signing config as the APK: the upload key.
const aab = process.argv.includes("--aab");
const task = aab
  ? `bundle${flavorCap}Release`
  : debug
    ? `assemble${flavorCap}Debug`
    : `assemble${flavorCap}Release`;
const args = [task, offline ? "--offline" : ""].filter(Boolean).join(" ");

console.log(`[native-apk] Using SDK: ${sdk}${offline ? " (offline)" : ""} — flavor: ${flavor}, task: ${task}`);
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

if (aab) {
  const aabPath = path.join(projectDir, "app", "build", "outputs", "bundle", `${flavor}Release`, `app-${flavor}-release.aab`);
  console.log(existsSync(aabPath) ? `[native-apk] AAB ready: ${aabPath}` : "[native-apk] Build finished but AAB not found at the expected path.");
} else {
  const variant = debug ? "debug" : "release";
  const apkName = `app-${flavor}-${variant}.apk`;
  const apk = path.join(projectDir, "app", "build", "outputs", "apk", flavor, variant, apkName);
  console.log(existsSync(apk) ? `[native-apk] APK ready: ${apk}` : "[native-apk] Build finished but APK not found at the expected path.");
}
