function readPackage(pkg) {
  // Allow native addons and tools with build scripts to run them.
  // This is required for packages like bcrypt and esbuild in some environments.
  // Scientific basis: PNPM hooks documentation on modifying package manifests.
  if (pkg.name === '@tailwindcss/oxide' || pkg.name === 'bcrypt' || pkg.name === 'esbuild' || pkg.name === 'protobufjs') {
    // Log that we are enabling the build script for this package.
    console.log(`[PNPM-HOOK] Enabling build script for: ${pkg.name}`);
    pkg.requiresBuild = true;
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};
