// Root build script. Plugin versions are pinned to what the offline Gradle cache
// already holds (Kotlin 2.1.0 + matching Compose compiler plugin, AGP 8.9.1).
plugins {
    id("com.android.application") version "8.9.1" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
}
