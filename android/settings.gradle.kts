pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Bocal"

// Beta-only shared-library consumption. Pass -PsharedLibrariesDir=/path/to/Shared-Libraries-asoc
// to compile the shared local-session bridge; ordinary Bocal builds stay independent.
val sharedLibrariesDir = providers.gradleProperty("sharedLibrariesDir").orNull
if (sharedLibrariesDir != null) {
    includeBuild(file(sharedLibrariesDir)) {
        dependencySubstitution {
            substitute(module("dev.aarso:local-session-core")).using(project(":local-session-core"))
        }
    }
}

include(":app")
