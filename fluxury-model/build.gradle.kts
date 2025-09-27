plugins {
    id("java")
    id("software.amazon.smithy.gradle.smithy-base") version "1.2.0"
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.9.1"))
    testImplementation("org.junit.jupiter:junit-jupiter")

    smithyBuild("software.amazon.smithy:smithy-aws-traits:1.56.0")
    // Required for restJson1 trait.
    implementation("software.amazon.smithy:smithy-aws-traits:1.56.0")
    implementation("software.amazon.smithy:smithy-model:1.50.0")
    implementation("software.amazon.smithy:smithy-aws-traits:1.50.0")
    implementation("software.amazon.smithy:smithy-openapi:1.50.0")
}

tasks.test {
    useJUnitPlatform()
}

java.sourceSets["main"].java {
    srcDirs("model", "src/main/smithy")
}
