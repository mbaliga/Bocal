# APK build status

**Not compiled in the handoff environment.** The environment has Java 17, but no Android SDK, Platform 36, Build Tools, `aapt2`, Gradle executable, or Gradle wrapper JAR. A genuine APK cannot be produced or validated without those components.

The complete Android Studio project is present. Follow `README.md`, then use `build-apk.sh`. The companion `verify-apk.sh` refuses archives that do not contain the minimum APK structures (`AndroidManifest.xml`, `classes.dex`, and `resources.arsc`).
