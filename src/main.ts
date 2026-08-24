import 'src/styles.css';
import {App, Menu, MenuItem, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf} from 'obsidian';
import {EpubView} from "./EpubView";
import {getPdfTocMd, openOrCreateNote} from "./utils";

export interface AwesomeReaderPluginSettings {
	scrolledView: boolean;
	bookInitLocations: Record<string, string>;
}

export interface EpubLayoutCache {
	width: number;
	height: number;
}

// Reading CFIs live in synced plugin data; layout dimensions are device-local.
const EPUB_LAYOUT_CACHE_PREFIX = "awesome-reader:epub-layout:";
const EPUB_CFI_PATTERN = /^epubcfi\(\/\d+\/\d+(?:\[[^\]]*\])?(?:!\/[^)]+)?\)$/;

export function isEpubCfi(value: unknown): value is string {
	return typeof value === "string" && EPUB_CFI_PATTERN.test(value);
}

const DEFAULT_SETTINGS: AwesomeReaderPluginSettings = {
	scrolledView: false,
	bookInitLocations: {}
};

export default class AwesomeReaderPlugin extends Plugin {
	settings: AwesomeReaderPluginSettings;
	private settingsSavePromise: Promise<void> = Promise.resolve();

	async onload() {
		await this.loadSettings();

		this.registerView("epub", (leaf: WorkspaceLeaf) => {
			return new EpubView(leaf, this.settings, this);
		});

		try {
			this.registerExtensions(["epub"], "epub");
		} catch (error) {
			console.log(`registerExtensions epub failed.`);
		}

		this.registerEvent(
			this.app.workspace.on(
				"file-menu",
				(menu: Menu, file: TFile) => {
					if (file.extension.toLowerCase() === "pdf") {
						menu.addItem((item: MenuItem) => {
								item
									.setTitle("Open/create book note")
									.setIcon('document')
									.onClick(async () => {
										await openOrCreateNote(this.app, file, await getPdfTocMd(file));
									});
							}
						);
					}
				}
			),
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AwesomeReaderSettingTab(this.app, this));


	}

	onunload() {

	}

	async loadSettings() {
		const loaded = await this.loadData() as Partial<AwesomeReaderPluginSettings> | null;
		const bookInitLocations: Record<string, string> = {};
		for (const [path, location] of Object.entries(loaded?.bookInitLocations ?? {})) {
			if (isEpubCfi(location)) bookInitLocations[path] = location;
		}
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			bookInitLocations,
		};
	}

	async saveSettings() {
		this.settingsSavePromise = this.settingsSavePromise
			.catch(() => undefined)
			.then(() => this.saveData(this.settings));
		await this.settingsSavePromise;
	}

	getEpubLayoutCache(path: string): EpubLayoutCache | null {
		const raw = this.app.loadLocalStorage(`${EPUB_LAYOUT_CACHE_PREFIX}${encodeURIComponent(path)}`) as Partial<EpubLayoutCache> | null;
		const width = raw?.width;
		const height = raw?.height;
		if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
		return {width, height};
	}

	saveEpubLayoutCache(path: string, cache: EpubLayoutCache) {
		this.app.saveLocalStorage(`${EPUB_LAYOUT_CACHE_PREFIX}${encodeURIComponent(path)}`, cache);
	}
}

class AwesomeReaderSettingTab extends PluginSettingTab {
	plugin: AwesomeReaderPlugin;

	constructor(app: App, plugin: AwesomeReaderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Awesome Reader Settings'});

		new Setting(containerEl)
			.setName("Scrolled View")
			.setDesc("This enables seamless scrolling between pages.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.scrolledView)
				.onChange(async (value) => {
					this.plugin.settings.scrolledView = value;
					await this.plugin.saveSettings();
				}));
	}
}
