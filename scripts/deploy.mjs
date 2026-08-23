import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const vault = process.argv[2] || process.env.OBSIDIAN_VAULT;

if (!vault) {
	console.error("Usage: npm run deploy -- <vault-path>");
	process.exitCode = 1;
} else {
	const root = process.cwd();
	const target = path.join(vault, ".obsidian", "plugins", "awesome-reader");
	const files = ["main.js", "manifest.json", "styles.css"];

	await Promise.all(files.map((file) => access(path.join(root, file))));
	await mkdir(target, { recursive: true });
	await Promise.all(
		files.map((file) => copyFile(path.join(root, file), path.join(target, file))),
	);
	console.log(`Installed Awesome Reader in ${target}`);
}
