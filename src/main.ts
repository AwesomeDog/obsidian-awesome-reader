import {Plugin, PluginSettingTab, Setting, TFile, type App, type SettingDefinitionItem} from "obsidian";
import {isEpubCfi} from "./core";
import {EpubView} from "./EpubView";
import {addBookNoteMenuItem, getPdfTocMd, openOrCreateNote} from "./utils";

export {isEpubCfi};

export type EpubThemeMode = "follow" | "light" | "dark";

export interface AwesomeReaderPluginSettings {
	scrolledView: boolean;
	epubTheme: EpubThemeMode;
	bookInitLocations: Record<string, string>;
}

const VIEW_TYPE_EPUB = "epub";
const DEFAULT_SETTINGS: AwesomeReaderPluginSettings = {
	scrolledView: false,
	epubTheme: "follow",
	bookInitLocations: {},
};
const isEpubThemeMode = (value: unknown): value is EpubThemeMode =>
	value === "follow" || value === "light" || value === "dark";

export default class AwesomeReaderPlugin extends Plugin {
	override settings: AwesomeReaderPluginSettings = {...DEFAULT_SETTINGS, bookInitLocations: {}};
	#settingsSavePromise: Promise<void> = Promise.resolve();

	override async onload(): Promise<void> {
		await this.#loadSettings();
		this.registerView(VIEW_TYPE_EPUB, leaf => new EpubView(leaf, this.settings, this));
		try {
			this.registerExtensions([VIEW_TYPE_EPUB], VIEW_TYPE_EPUB);
		} catch (error) {
			console.warn("awesome-reader: failed to register the EPUB extension", error);
		}
		this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
			if (!(file instanceof TFile) || file.extension.toLowerCase() !== "pdf") return;
			addBookNoteMenuItem(menu, async () => {
				await openOrCreateNote(this.app, file, await getPdfTocMd(this.app, file));
			});
		}));
		this.addSettingTab(new AwesomeReaderSettingTab(this.app, this));
	}

	async #loadSettings(): Promise<void> {
		const loaded = await this.loadData() as Partial<AwesomeReaderPluginSettings> | null;
		const bookInitLocations: Record<string, string> = {};
		for (const [path, location] of Object.entries(loaded?.bookInitLocations ?? {})) {
			if (isEpubCfi(location)) bookInitLocations[path] = location;
		}
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			epubTheme: isEpubThemeMode(loaded?.epubTheme) ? loaded.epubTheme : DEFAULT_SETTINGS.epubTheme,
			bookInitLocations,
		};
	}

	saveSettings(): Promise<void> {
		this.#settingsSavePromise = this.#settingsSavePromise
			.catch(() => undefined)
			.then(() => this.saveData(this.settings));
		return this.#settingsSavePromise;
	}

	refreshEpubThemes(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_EPUB)) {
			if (leaf.view instanceof EpubView) leaf.view.syncTheme();
		}
	}

}

class AwesomeReaderSettingTab extends PluginSettingTab {
	readonly #plugin: AwesomeReaderPlugin;

	constructor(app: App, plugin: AwesomeReaderPlugin) {
		super(app, plugin);
		this.#plugin = plugin;
	}

	override display(): void {
		this.containerEl.empty();
		const heading = new Setting(this.containerEl).setName("Awesome Reader Settings");
		if (typeof heading.setHeading === "function") heading.setHeading();
		new Setting(this.containerEl)
			.setName("Scrolled View")
			.setDesc("This enables seamless scrolling between pages.")
			.addToggle(toggle => toggle
				.setValue(this.#plugin.settings.scrolledView)
				.onChange(async value => {
					this.#plugin.settings.scrolledView = value;
					await this.#plugin.saveSettings();
				}));
		new Setting(this.containerEl)
			.setName("EPUB Theme")
			.setDesc("Choose whether EPUB books follow Obsidian's theme.")
			.addDropdown(dropdown => dropdown
				.addOption("follow", "Follow Obsidian")
				.addOption("light", "Light")
				.addOption("dark", "Dark")
				.setValue(this.#plugin.settings.epubTheme)
				.onChange(async value => {
					if (!isEpubThemeMode(value)) return;
					this.#plugin.settings.epubTheme = value;
					await this.#plugin.saveSettings();
					this.#plugin.refreshEpubThemes();
				}));
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [{
			type: "group",
			heading: "Awesome Reader Settings",
			items: [
				{
					name: "Scrolled View",
					desc: "This enables seamless scrolling between pages.",
					render: setting => {
						setting.addToggle(toggle => toggle
							.setValue(this.#plugin.settings.scrolledView)
							.onChange(async value => {
								this.#plugin.settings.scrolledView = value;
								await this.#plugin.saveSettings();
							}));
					},
				},
				{
					name: "EPUB Theme",
					desc: "Choose whether EPUB books follow Obsidian's theme.",
					render: setting => {
						setting.addDropdown(dropdown => dropdown
							.addOption("follow", "Follow Obsidian")
							.addOption("light", "Light")
							.addOption("dark", "Dark")
							.setValue(this.#plugin.settings.epubTheme)
							.onChange(async value => {
								if (!isEpubThemeMode(value)) return;
								this.#plugin.settings.epubTheme = value;
								await this.#plugin.saveSettings();
								this.#plugin.refreshEpubThemes();
							}));
					},
				},
			],
		}];
	}
}
