import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ignores: ["build", "main.js", "node_modules", "styles.css"]},
	{...eslint.configs.recommended, languageOptions: {globals: globals.node}},
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ["{src,test}/**/*.{ts,tsx}"],
		languageOptions: {
			globals: globals.browser,
			parserOptions: {projectService: true, tsconfigRootDir: import.meta.dirname},
		},
	},
	{files: ["**/*.mjs"], extends: [tseslint.configs.disableTypeChecked]},
);
