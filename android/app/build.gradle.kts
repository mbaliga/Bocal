import java.util.Base64

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.bocal.music"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.bocal.music"
        minSdk = 26
        targetSdk = 37
        versionCode = 7
        versionName = "0.6.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
    }

    // Fed from environment/CI secrets so a checkout without them still
    // compiles a debug build. See .github/workflows/release.yml and the
    // secret names in android/README.md.
    val uploadKeystoreB64 = System.getenv("BOCAL_UPLOAD_KEYSTORE_B64")
    val uploadKeystorePassword = System.getenv("BOCAL_UPLOAD_KEYSTORE_PASSWORD")
    val uploadKeyAlias = System.getenv("BOCAL_UPLOAD_KEY_ALIAS")
    val uploadKeyPassword = System.getenv("BOCAL_UPLOAD_KEY_PASSWORD")
    val hasReleaseSigning = listOf(
        uploadKeystoreB64,
        uploadKeystorePassword,
        uploadKeyAlias,
        uploadKeyPassword,
    ).all { !it.isNullOrBlank() }

    if (hasReleaseSigning) {
        val decodedKeystore = layout.buildDirectory.file("release-upload-keystore.jks").get().asFile
        decodedKeystore.parentFile.mkdirs()
        decodedKeystore.writeBytes(Base64.getDecoder().decode(uploadKeystoreB64))

        signingConfigs {
            create("release") {
                storeFile = decodedKeystore
                storePassword = uploadKeystorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        jniLibs.keepDebugSymbols += "**/libandroidx.graphics.path.so"
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    val composeBom = platform("androidx.compose:compose-bom:2026.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.webkit:webkit:1.17.0")

    debugImplementation("androidx.compose.ui:ui-tooling")

    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:rules:1.7.0")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

// `assets/www/app.html` is a generated artifact -- see .gitignore -- built by
// the web project's `preview:standalone` script (vite build + asset
// inlining). This task regenerates it before every build so a stale, committed
// copy can never ship (see android-ci.md finding 8). CI runs the same npm
// script separately and only needs the copy step; a local `./gradlew
// assembleDebug` needs both.
val webSourceDir = rootProject.projectDir.resolve("../web-source")
val previewDistIndex = webSourceDir.resolve("preview-dist/index.html")
val stagedAppHtml = projectDir.resolve("src/main/assets/www/app.html")

val skipWebBuild = System.getenv("BOCAL_SKIP_WEB_BUILD") == "1"

tasks.register<Exec>("buildWebApp") {
    onlyIf { !skipWebBuild }
    workingDir = webSourceDir
    commandLine("npm", "run", "preview:standalone")
}

tasks.register("stageWebApp") {
    if (skipWebBuild) {
        // CI already staged assets/www/app.html itself (from a separate `web`
        // job's artifact) before invoking Gradle; nothing to do here, and no
        // Node toolchain is required in this job.
        doLast {
            if (!stagedAppHtml.exists()) {
                throw GradleException(
                    "BOCAL_SKIP_WEB_BUILD=1 but ${stagedAppHtml} is missing -- stage it before running Gradle."
                )
            }
        }
    } else {
        dependsOn("buildWebApp")
        doLast {
            if (!previewDistIndex.exists()) {
                throw GradleException(
                    "Missing ${previewDistIndex} -- run `npm run preview:standalone` in web-source/ " +
                        "(or set BOCAL_SKIP_WEB_BUILD=1 to reuse an already-staged assets/www/app.html)."
                )
            }
            stagedAppHtml.parentFile.mkdirs()
            previewDistIndex.copyTo(stagedAppHtml, overwrite = true)
        }
    }
}

tasks.named("preBuild") {
    dependsOn("stageWebApp")
}
