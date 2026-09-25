const { spawnSync } = require("node:child_process");

const forbiddenSigningAttribute = /^(.+): com\.apple\.(FinderInfo|ResourceFork|provenance|fileprovider\.[^:\n]+):$/gmu;

function findSigningDetritus(report) {
  return [...report.matchAll(forbiddenSigningAttribute)].map((match) => ({
    path: match[1],
    attribute: `com.apple.${match[2]}`
  }));
}

exports.findSigningDetritus = findSigningDetritus;

/**
 * Finder may attach provenance/resource-fork metadata while Electron is copied
 * into the app bundle. Ad-hoc signing rejects those attributes, so remove them
 * only from this build's freshly-created output before codesign runs.
 */
exports.afterPack = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const result = spawnSync("/usr/bin/xattr", ["-cr", context.appOutDir], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to sanitize macOS package attributes: ${result.stderr || result.stdout}`
    );
  }

  // xattr can exit successfully while macOS File Provider immediately
  // reattaches protected provenance/Finder attributes. Give that asynchronous
  // write a short stabilization window, then detect it before codesign starts
  // its expensive retry loop. Do not echo attribute values.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const audit = spawnSync("/usr/bin/xattr", ["-lr", context.appOutDir], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (audit.status !== 0) {
    throw new Error("Unable to audit macOS package attributes after sanitizing.");
  }
  const detritus = findSigningDetritus(audit.stdout);
  if (detritus.length) {
    const first = detritus[0];
    throw new Error(
      `macOS package still has ${detritus.length} forbidden signing attributes after sanitizing ` +
      `(first: ${first.attribute}); build the release candidate outside Desktop/File Provider.`
    );
  }
};
