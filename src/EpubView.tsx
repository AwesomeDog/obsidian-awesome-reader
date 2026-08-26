import type {NavItem, Rendition} from "epubjs";
import {FileView, type Menu, type TFile, type WorkspaceLeaf} from "obsidian";
import {useState} from "react";
import {createRoot, type Root} from "react-dom/client";
import {ReactReader, ReactReaderStyle} from "react-reader";
import {getEpubTocMd, isEpubCfi} from "./core";
import type AwesomeReaderPlugin from "./main";
import type {AwesomeReaderPluginSettings} from "./main";
import {addBookNoteMenuItem, openOrCreateNote} from "./utils";

interface EpubReaderProps {
	contents: ArrayBuffer;
	title: string;
	scrolled: boolean;
	tocOffset: number;
	initLocation: string | null;
	saveLocation: (location: string) => void;
	tocMemo: (toc: NavItem[]) => void;
	onRendition: (rendition: Rendition) => void;
}

type Display = (target?: string | number) => Promise<void>;
interface ManagedRendition extends Rendition {
	manager?: {container?: HTMLElement};
	resize(width: number, height: number, cfi?: string): void;
}

const warn = (action: string, error: unknown): void => {
	console.warn(`awesome-reader: failed to ${action}`, error);
};

const EPUB_LIGHT_THEME = {
	"html, body": {
		"background-color": "#ffffff !important",
		color: "#222222 !important",
	},
	"a, a:visited": {
		color: "#0969da !important",
	},
	"pre, code, blockquote": {
		"background-color": "#f6f8fa !important",
	},
};

const EPUB_DARK_THEME = {
	"html, body": {
		"background-color": "#1e1e1e !important",
		color: "#d6d6d6 !important",
	},
	"a, a:visited": {
		color: "#8ab4f8 !important",
	},
	"pre, code, blockquote": {
		"background-color": "#252525 !important",
	},
};

export function EpubReader({
	contents, title, scrolled, tocOffset, initLocation, saveLocation, tocMemo, onRendition,
}: EpubReaderProps) {
	const [location, setLocation] = useState<string | null>(initLocation);
	const locationChanged = (cfi: string): void => {
		setLocation(cfi);
		if (isEpubCfi(cfi)) saveLocation(cfi);
	};

	return <div className="awesome-reader-epub">
		<ReactReader
			title={title}
			showToc
			location={location}
			locationChanged={locationChanged}
			swipeable={false}
			url={contents}
			tocChanged={tocMemo}
			getRendition={onRendition}
			epubOptions={scrolled
				? {allowPopups: false, flow: "scrolled", manager: "continuous"}
				: {allowPopups: false}}
			readerStyles={{
				...ReactReaderStyle,
				readerArea: {
					...ReactReaderStyle.readerArea,
					backgroundColor: "var(--background-primary)",
				},
				titleArea: {
					...ReactReaderStyle.titleArea,
					color: "var(--text-muted)",
				},
				arrow: {
					...ReactReaderStyle.arrow,
					color: "var(--text-muted)",
				},
				tocArea: {
					...ReactReaderStyle.tocArea,
					top: `${tocOffset + 20}px`,
					bottom: 0,
					left: "auto",
					background: "var(--background-secondary)",
					backgroundColor: "var(--background-secondary)",
				},
				tocAreaButton: {
					...ReactReaderStyle.tocAreaButton,
					color: "var(--text-normal)",
					borderBottomColor: "var(--background-modifier-border)",
				},
				tocButtonExpanded: {
					...ReactReaderStyle.tocButtonExpanded,
					backgroundColor: "var(--background-secondary)",
				},
			}}
		/>
	</div>;
}

export class EpubView extends FileView {
	override allowNoFile = false;
	readonly #settings: AwesomeReaderPluginSettings;
	readonly #plugin: AwesomeReaderPlugin;
	#fileToc: NavItem[] | null = null;
	#root: Root | null = null;
	#rendition: ManagedRendition | null = null;
	#resizeTimer: number | null = null;
	#locationFlushPromise: Promise<void> | null = null;
	#pendingLocation: {file: TFile; cfi: string} | null = null;
	#currentCfi: string | null = null;
	#readerFile: TFile | null = null;
	#loadId = 0;

	constructor(leaf: WorkspaceLeaf, settings: AwesomeReaderPluginSettings, plugin: AwesomeReaderPlugin) {
		super(leaf);
		this.#settings = settings;
		this.#plugin = plugin;
		this.registerEvent(this.app.workspace.on("css-change", () => this.syncTheme()));
	}

	syncTheme(): void {
		const rendition = this.#rendition;
		if (!rendition) return;
		const dark = this.#settings.epubTheme === "dark"
			|| (this.#settings.epubTheme === "follow" && document.body.classList.contains("theme-dark"));
		rendition.themes.select(dark ? "awesome-dark" : "awesome-light");
	}

	#scheduleLocationSave(file: TFile, cfi: string): void {
		if (!isEpubCfi(cfi)) return;
		this.#plugin.settings.bookInitLocations[file.path] = cfi;
		this.#pendingLocation = {file, cfi};
		void this.#flushLocationSave();
	}

	#captureCurrentLocation(file: TFile | null): void {
		if (!file || this.#readerFile?.path !== file.path) return;
		const cfi = this.#rendition?.location?.start?.cfi ?? this.#currentCfi;
		if (isEpubCfi(cfi)) this.#scheduleLocationSave(file, cfi);
	}

	#flushLocationSave(): Promise<void> {
		if (!this.#locationFlushPromise) {
			this.#locationFlushPromise = Promise.resolve().then(async () => {
				try {
					while (this.#pendingLocation) {
						const {file, cfi} = this.#pendingLocation;
						this.#pendingLocation = null;
						try {
							await this.#persistLocation(file, cfi);
						} catch (error) {
							warn("save EPUB location", error);
						}
					}
				} finally {
					this.#locationFlushPromise = null;
				}
			});
		}
		return this.#locationFlushPromise;
	}

	#cancelResize(): void {
		if (this.#resizeTimer !== null) window.clearTimeout(this.#resizeTimer);
		this.#resizeTimer = null;
	}

	#unmountReader(): void {
		this.#cancelResize();
		const root = this.#root;
		const rendition = this.#rendition;
		try {
			if (root) root.unmount();
			else rendition?.book.destroy();
		} catch (error) {
			warn("unmount EPUB reader", error);
			if (root) {
				try {
					rendition?.book.destroy();
				} catch (disposeError) {
					warn("dispose EPUB reader", disposeError);
				}
			}
		} finally {
			this.#root = null;
			this.#rendition = null;
			this.#readerFile = null;
		}
	}

	#resizeRendition(): void {
		const rendition = this.#rendition;
		const file = this.#readerFile;
		const resizeTarget = rendition?.manager?.container;
		if (!rendition || !file || !resizeTarget) return;
		const rect = resizeTarget.getBoundingClientRect();
		const width = Math.floor(rect.width);
		const height = Math.floor(rect.height);
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
		try {
			const location = rendition.location?.start?.cfi;
			const cfi = isEpubCfi(location) ? location : this.#currentCfi;
			rendition.resize(width, height, cfi ?? undefined);
		} catch (error) {
			warn("resize EPUB reader", error);
			return;
		}
		try {
			const cached = this.#plugin.getEpubLayoutCache(file.path);
			if (cached?.width !== width || cached.height !== height) {
				this.#plugin.saveEpubLayoutCache(file.path, {width, height});
			}
		} catch (error) {
			warn("save EPUB layout cache", error);
		}
	}

	override onResize(): void {
		this.#cancelResize();
		this.#resizeTimer = window.setTimeout(() => {
			this.#resizeTimer = null;
			this.#resizeRendition();
		}, 150);
	}

	override onPaneMenu(menu: Menu): void {
		addBookNoteMenuItem(menu, async () => {
			const file = this.file;
			if (file) await openOrCreateNote(this.app, file, getEpubTocMd(this.#fileToc));
		});
	}

	#persistLocation(file: TFile, cfi: string): Promise<void> {
		if (!isEpubCfi(cfi)) return Promise.resolve();
		this.#plugin.settings.bookInitLocations[file.path] = cfi;
		return this.#plugin.saveSettings();
	}

	#getInitLocation(file: TFile): string | null {
		const location = this.#plugin.settings.bookInitLocations[file.path];
		return isEpubCfi(location) ? location : null;
	}

	#clearInitLocation(file: TFile, location: string): void {
		if (this.#plugin.settings.bookInitLocations[file.path] !== location) return;
		delete this.#plugin.settings.bookInitLocations[file.path];
		this.#currentCfi = null;
		void this.#plugin.saveSettings().catch(error => warn("clear EPUB location", error));
	}

	#prepareRendition(rendition: Rendition, file: TFile, loadId: number, initLocation: string | null): void {
		if (!initLocation) return;
		const originalDisplay = rendition.display.bind(rendition) as Display;
		let initialDisplayPending = true;
		let recoveryStarted = false;
		const recover = (): Promise<void> => {
			if (!initialDisplayPending || recoveryStarted) return Promise.resolve();
			recoveryStarted = true;
			initialDisplayPending = false;
			rendition.off("displayerror", recover);
			if (loadId !== this.#loadId) return Promise.resolve();
			this.#clearInitLocation(file, initLocation);
			const fallback = originalDisplay();
			void fallback.catch(error => warn("recover EPUB location", error));
			return fallback;
		};
		const stopInitialDisplay = (): void => {
			initialDisplayPending = false;
			rendition.off("displayerror", recover);
		};
		rendition.on("displayerror", recover);
		(rendition as Rendition & {display: Display}).display = target => {
			if (!initialDisplayPending || target !== initLocation) {
				stopInitialDisplay();
				return originalDisplay(target);
			}
			try {
				if (!rendition.book.spine.get(initLocation)) return recover();
				const display = rendition.book.getRange(initLocation).then(range => {
					if (!range) return recover();
					if (!initialDisplayPending) return;
					if (loadId !== this.#loadId) {
						stopInitialDisplay();
						return;
					}
					return originalDisplay(target).then(stopInitialDisplay, recover);
				}, recover);
				void display.catch(error => warn("display EPUB location", error));
				return display;
			} catch {
				return recover();
			}
		};
	}

	override async onLoadFile(file: TFile): Promise<void> {
		this.#captureCurrentLocation(this.#readerFile);
		const loadId = ++this.#loadId;
		this.#unmountReader();
		await this.#flushLocationSave();
		if (loadId !== this.#loadId) return;
		this.contentEl.empty();
		this.#fileToc = null;
		const initLocation = this.#getInitLocation(file);
		this.#currentCfi = null;
		const header = this.containerEl.parentElement?.querySelector<HTMLElement>("div.view-header");
		const style = header ? getComputedStyle(header) : null;
		const width = Number.parseFloat(style?.width ?? "0");
		const height = Number.parseFloat(style?.height ?? "0");
		const tocOffset = height < width ? height : 0;
		const contents = await this.app.vault.readBinary(file);
		if (loadId !== this.#loadId) return;
		const root = createRoot(this.contentEl);
		this.#root = root;
		root.render(<EpubReader
			contents={contents}
			title={file.basename}
			scrolled={this.#settings.scrolledView}
			tocOffset={tocOffset}
			initLocation={initLocation}
			saveLocation={location => {
				if (loadId !== this.#loadId) return;
				this.#currentCfi = location;
				this.#scheduleLocationSave(file, location);
			}}
			tocMemo={toc => {
				if (loadId === this.#loadId) this.#fileToc = toc;
			}}
			onRendition={rendition => {
				if (loadId !== this.#loadId) return;
				this.#rendition = rendition;
				this.#readerFile = file;
				rendition.themes.register("awesome-light", EPUB_LIGHT_THEME);
				rendition.themes.register("awesome-dark", EPUB_DARK_THEME);
				this.syncTheme();
				this.#prepareRendition(rendition, file, loadId, initLocation);
				this.onResize();
			}}
		/>);
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		this.#captureCurrentLocation(file);
		const loadId = ++this.#loadId;
		this.#unmountReader();
		await this.#flushLocationSave();
		if (loadId !== this.#loadId) return;
		this.#fileToc = null;
		this.#currentCfi = null;
	}

	override onunload(): void {
		this.#captureCurrentLocation(this.#readerFile);
		++this.#loadId;
		void this.#flushLocationSave();
		this.#unmountReader();
		this.#currentCfi = null;
	}

	override canAcceptExtension(extension: string): boolean {
		return extension === "epub";
	}

	override getViewType(): string {
		return "epub";
	}
}
