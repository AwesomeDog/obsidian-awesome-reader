import {Plugin, PluginSettingTab, Setting, TFile, type App} from "obsidian";
import {isEpubCfi} from "./core";
import {EpubView} from "./EpubView";
import {addBookNoteMenuItem, getPdfTocMd, openOrCreateNote} from "./utils";

export {isEpubCfi};

export interface AwesomeReaderPluginSettings {
	scrolledView: boolean;
	bookInitLocations: Record<string, string>;
}

export interface EpubLayoutCache {
	width: number;
	height: number;
}

const VIEW_TYPE_EPUB = "epub";
const EPUB_LAYOUT_CACHE_PREFIX = "awesome-reader:epub-layout:";
const DEFAULT_SETTINGS: AwesomeReaderPluginSettings = {scrolledView: false, bookInitLocations: {}};
const layoutCacheKey = (path: string): string => `${EPUB_LAYOUT_CACHE_PREFIX}${encodeURIComponent(path)}`;

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
		this.settings = {...DEFAULT_SETTINGS, ...loaded, bookInitLocations};
	}

	saveSettings(): Promise<void> {
		this.#settingsSavePromise = this.#settingsSavePromise
			.catch(() => undefined)
			.then(() => this.saveData(this.settings));
		return this.#settingsSavePromise;
	}

	getEpubLayoutCache(path: string): EpubLayoutCache | null {
		const raw = this.app.loadLocalStorage(layoutCacheKey(path)) as Partial<EpubLayoutCache> | null;
		const {width, height} = raw ?? {};
		if (typeof width !== "number" || typeof height !== "number"
			|| !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
		return {width, height};
	}

	saveEpubLayoutCache(path: string, cache: EpubLayoutCache): void {
		this.app.saveLocalStorage(layoutCacheKey(path), cache);
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
		this.containerEl.createEl("h2", {text: "Awesome Reader Settings"});
		new Setting(this.containerEl)
			.setName("Scrolled View")
			.setDesc("This enables seamless scrolling between pages.")
			.addToggle(toggle => toggle
				.setValue(this.#plugin.settings.scrolledView)
				.onChange(async value => {
					this.#plugin.settings.scrolledView = value;
					await this.#plugin.saveSettings();
				}));
	}
}
