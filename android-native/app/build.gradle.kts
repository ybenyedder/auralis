plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "local.auralis.client"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "local.auralis.client"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "2.0"
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
        }
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    packaging {
        resources {
            excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/*.kotlin_module")
        }
    }
}

// ui-tooling-preview (design-time @Preview annotations) isn't present in the offline
// cache for compose 1.9.1, and a headless APK build never needs it. Drop it everywhere.
configurations.all {
    exclude(group = "androidx.compose.ui", module = "ui-tooling-preview")
}

// Every version below is pinned to an artifact verified present in the offline
// Gradle cache (compose 1.9.1 -android variants, material3 1.5.0-alpha08, media3 1.8.0).
val composeVer = "1.9.1"
val media3Ver = "1.8.0"
val lifecycleVer = "2.9.4"

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.activity:activity-compose:1.10.0")

    // Compose — explicit versions (no BOM) so resolution can't pull an uncached one.
    implementation("androidx.compose.ui:ui:$composeVer")
    implementation("androidx.compose.ui:ui-graphics:$composeVer")
    implementation("androidx.compose.foundation:foundation:$composeVer")
    implementation("androidx.compose.animation:animation:$composeVer")
    implementation("androidx.compose.material3:material3:1.5.0-alpha08")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")

    implementation("androidx.lifecycle:lifecycle-runtime-ktx:$lifecycleVer")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:$lifecycleVer")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:$lifecycleVer")
    implementation("androidx.lifecycle:lifecycle-service:$lifecycleVer")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("androidx.datastore:datastore-preferences:1.2.0")

    // Networking — JSON parsed with android's built-in org.json (no serialization plugin).
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Native playback + media session (lock-screen / notification controls).
    implementation("androidx.media3:media3-exoplayer:$media3Ver")
    implementation("androidx.media3:media3-session:$media3Ver")
    implementation("androidx.media3:media3-common:$media3Ver")
}
