const fs = require('fs');
const path = require('path');

const GOOGLE_SERVICES_PATH = path.join(__dirname, '../android/app/google-services.json');
const BUILD_GRADLE_PATH = path.join(__dirname, '../android/app/build.gradle');
const MANIFEST_PATH = path.join(__dirname, '../android/app/src/main/AndroidManifest.xml');

let hasErrors = false;

function logSuccess(msg) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
  hasErrors = true;
}

console.log('=== Starting Rapid Validation Scan ===\n');

// 1. Verify google-services.json
let googleServicesPackage = '';
if (!fs.existsSync(GOOGLE_SERVICES_PATH)) {
  logError('google-services.json file does not exist at android/app/google-services.json');
} else {
  logSuccess('google-services.json exists in android/app/');
  try {
    const rawData = fs.readFileSync(GOOGLE_SERVICES_PATH, 'utf8');
    const data = JSON.parse(rawData);
    googleServicesPackage = data?.client?.[0]?.client_info?.android_client_info?.package_name;
    if (googleServicesPackage) {
      logSuccess(`Found package name in google-services.json: "${googleServicesPackage}"`);
    } else {
      logError('Could not find package_name inside google-services.json');
    }
  } catch (err) {
    logError(`Error parsing google-services.json: ${err.message}`);
  }
}

// 2. Verify build.gradle
if (!fs.existsSync(BUILD_GRADLE_PATH)) {
  logError('build.gradle file does not exist at android/app/build.gradle');
} else {
  logSuccess('build.gradle exists in android/app/');
  const gradleContent = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
  
  const namespaceMatch = gradleContent.match(/namespace\s+["']([^"']+)["']/);
  const appIdMatch = gradleContent.match(/applicationId\s+["']([^"']+)["']/);
  
  if (namespaceMatch) {
    const namespace = namespaceMatch[1];
    logSuccess(`Found namespace in build.gradle: "${namespace}"`);
    if (googleServicesPackage && namespace !== googleServicesPackage) {
      logError(`build.gradle namespace ("${namespace}") does not match google-services.json package name ("${googleServicesPackage}")`);
    } else {
      logSuccess('build.gradle namespace matches google-services.json package name.');
    }
  } else {
    logError('Could not find "namespace" setting in build.gradle');
  }

  if (appIdMatch) {
    const appId = appIdMatch[1];
    logSuccess(`Found applicationId in build.gradle: "${appId}"`);
    if (googleServicesPackage && appId !== googleServicesPackage) {
      logError(`build.gradle applicationId ("${appId}") does not match google-services.json package name ("${googleServicesPackage}")`);
    } else {
      logSuccess('build.gradle applicationId matches google-services.json package name.');
    }
  } else {
    logError('Could not find "applicationId" setting in build.gradle');
  }
}

// 3. Verify AndroidManifest.xml
if (!fs.existsSync(MANIFEST_PATH)) {
  logError('AndroidManifest.xml file does not exist at android/app/src/main/AndroidManifest.xml');
} else {
  logSuccess('AndroidManifest.xml exists in android/app/src/main/');
  const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf8');
  
  const packageMatch = manifestContent.match(/package\s*=\s*["']([^"']+)["']/);
  if (packageMatch) {
    const manifestPackage = packageMatch[1];
    logSuccess(`Found package in AndroidManifest.xml: "${manifestPackage}"`);
    if (googleServicesPackage && manifestPackage !== googleServicesPackage) {
      logError(`AndroidManifest.xml package name ("${manifestPackage}") does not match google-services.json package name ("${googleServicesPackage}")`);
    } else {
      logSuccess('AndroidManifest.xml package name matches google-services.json package name.');
    }
  } else {
    logError('Could not find "package" attribute in AndroidManifest.xml');
  }
}

console.log('\n=== Scan Completed ===');
if (hasErrors) {
  console.log('\x1b[31m[STATUS] Validation Failed.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m[STATUS] Validation Successful!\x1b[0m');
  process.exit(0);
}
