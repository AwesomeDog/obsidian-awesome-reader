import {writeFile} from "node:fs/promises";
import manifest from "./manifest.json" with {type: "json"};
import versions from "./versions.json" with {type: "json"};

const targetVersion = process.env.npm_package_version;
if (!targetVersion) throw new Error("npm_package_version is required");

manifest.version = targetVersion;
versions[targetVersion] = manifest.minAppVersion;
await Promise.all([
	["manifest.json", manifest],
	["versions.json", versions],
].map(([path, contents]) => writeFile(path, `${JSON.stringify(contents, null, "\t")}\n`)));
