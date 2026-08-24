import {FileView, Menu, TFile, WorkspaceLeaf} from "obsidian";
import * as React from 'react';
import {useState} from 'react';
import * as ReactDOM from 'react-dom';
import type {Book, Rendition} from "epubjs";
import AwesomeReaderPlugin, {AwesomeReaderPluginSettings, isEpubCfi} from "./main";
import {getEpubTocMd, openOrCreateNote} from "./utils";
import {ReactReader, ReactReaderStyle} from "react-reader";

export const EpubReader = ({contents, title, scrolled, tocOffset, initLocation, saveLocation, tocMemo, onRendition}: {
	contents: ArrayBuffer;
	title: string;
	scrolled: boolean;
	tocOffset: number;
	initLocation: string | null;
	saveLocation: (location: string) => void;
	tocMemo: (toc: any) => void;
	onRendition: (rendition: Rendition) => void;
}) => {
	const [location, setLocation] = useState<string | number | undefined>(initLocation ?? undefined);
	const locationChanged = (epubcifi: string | number) => {
		setLocation(epubcifi);
		if (isEpubCfi(epubcifi)) saveLocation(epubcifi);
	};

	// @ts-ignore
	return <div className={"awesome-reader-epub"}
				style={{border: "none", height: "100%", width: "100%", overflow: "hidden"}}>
		<ReactReader
			title={title}
			showToc={true}
			location={location}
			locationChanged={locationChanged}
			swipeable={false}
			url={contents}
			tocChanged={toc => tocMemo(toc)}
			getRendition={onRendition}
			epubOptions={scrolled ? {
				allowPopups: false,
				flow: "scrolled",
				manager: "continuous"
			} : {
				allowPopups: false
			}}
			readerStyles={
				{
					...ReactReaderStyle,
					tocArea: {
						...ReactReaderStyle.tocArea,
						top: (tocOffset + 20).toString() + 'px',
						bottom: 0,
						left: 'auto',
						backgroundColor: 'currentColor',
					},
					tocButtonExpanded: {
						...ReactReaderStyle.tocButtonExpanded,
						backgroundColor: 'currentColor',
					}
				}
			}
		/>
	</div>;
};

export class EpubView extends FileView {
	allowNoFile: false;
	fileToc: any = null;
	private book: Book | null = null;
	private rendition: Rendition | null = null;
	private resizeTimer: number | null = null;
	private locationFlushPromise: Promise<void> | null = null;
	private pendingLocation: {file: TFile; cfi: string} | null = null;
	private currentCfi: string | null = null;
	private readerFile: TFile | null = null;
	private loadId = 0;

	constructor(leaf: WorkspaceLeaf, private settings: AwesomeReaderPluginSettings, private plugin: AwesomeReaderPlugin) {
		super(leaf);
	}

	private scheduleLocationSave(file: TFile, cfi: string) {
		if (!isEpubCfi(cfi)) return;
		this.plugin.settings.bookInitLocations[file.path] = cfi;
		this.pendingLocation = {file, cfi};
		void this.flushLocationSave();
	}

	private captureCurrentLocation(file: TFile | null) {
		if (!file || this.readerFile?.path !== file.path) return;
		const cfi = this.rendition?.location?.start?.cfi ?? this.currentCfi;
		if (isEpubCfi(cfi)) this.scheduleLocationSave(file, cfi);
	}

	private flushLocationSave(): Promise<void> {
		if (this.locationFlushPromise) {
			return this.locationFlushPromise.then(() => this.flushLocationSave());
		}
		const flush = (async () => {
			while (this.pendingLocation) {
				const pending = this.pendingLocation;
				this.pendingLocation = null;
				try {
					await this.setInitLocation(pending.file, pending.cfi);
				} catch (error) {
					console.warn("awesome-reader: failed to save EPUB location", error);
				}
			}
		})();
		this.locationFlushPromise = flush.then(
			() => { this.locationFlushPromise = null; },
			(error) => {
				this.locationFlushPromise = null;
				console.warn("awesome-reader: failed to flush EPUB location", error);
			},
		);
		return this.locationFlushPromise;
	}

	private disposeReader() {
		if (this.resizeTimer !== null) {
			window.clearTimeout(this.resizeTimer);
			this.resizeTimer = null;
		}
		const book = this.book;
		const rendition = this.rendition;
		this.book = null;
		this.rendition = null;
		this.readerFile = null;
		try {
			if (book) book.destroy();
			else rendition?.destroy();
		} catch (error) {
			console.warn("awesome-reader: failed to dispose EPUB reader", error);
		}
	}

	private unmountReader() {
		try {
			const unmounted = ReactDOM.unmountComponentAtNode(this.contentEl);
			if (!unmounted) {
				this.disposeReader();
				return;
			}
			if (this.resizeTimer !== null) {
				window.clearTimeout(this.resizeTimer);
				this.resizeTimer = null;
			}
			this.book = null;
			this.rendition = null;
			this.readerFile = null;
		} catch (error) {
			console.warn("awesome-reader: failed to unmount EPUB reader", error);
			this.disposeReader();
		}
	}

	private resizeRendition() {
		const rendition = this.rendition;
		const file = this.readerFile;
		if (!rendition || !file) return;
		const manager = (rendition as Rendition & {manager?: {container?: HTMLElement}}).manager;
		const resizeTarget = manager?.container;
		if (!resizeTarget) return;
		const rect = resizeTarget.getBoundingClientRect();
		const width = Math.floor(rect.width);
		const height = Math.floor(rect.height);
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
		try {
			const locationCfi = rendition.location?.start?.cfi;
			const cfi = isEpubCfi(locationCfi) ? locationCfi : this.currentCfi;
			// epub.js accepts the current CFI as a third resize argument at runtime;
			// this keeps the same passage visible while it rebuilds the columns.
			(rendition.resize as (width: number, height: number, cfi?: string) => void)(width, height, cfi ?? undefined);
		} catch (error) {
			console.warn("awesome-reader: failed to resize EPUB reader", error);
			return;
		}
		try {
			const cached = this.plugin.getEpubLayoutCache(file.path);
			if (cached?.width !== width || cached.height !== height) {
				this.plugin.saveEpubLayoutCache(file.path, {width, height});
			}
		} catch (error) {
			console.warn("awesome-reader: failed to save EPUB layout cache", error);
		}
	}

	onResize(): void {
		if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
		this.resizeTimer = window.setTimeout(() => {
			this.resizeTimer = null;
			this.resizeRendition();
		}, 150);
	}

	onPaneMenu(menu: Menu,): void {
		menu.addItem((item) => {
			item
				.setTitle("Open/create book note")
				.setIcon("document")
				.onClick(async () => {
					const file = this.file;
					if (!file) return;
					await openOrCreateNote(this.app, file, getEpubTocMd(this.fileToc));
				});
		});
	}

	async setInitLocation(file: TFile, initLocation: string) {
		if (!isEpubCfi(initLocation)) return;
		this.plugin.settings.bookInitLocations[file.path] = initLocation;
		await this.plugin.saveSettings();
	}

	async getInitLocation(file: TFile): Promise<string | null> {
		const location = this.plugin.settings.bookInitLocations[file.path];
		return isEpubCfi(location) ? location : null;
	}

	private clearInitLocation(file: TFile, location: string) {
		if (this.plugin.settings.bookInitLocations[file.path] !== location) return;
		delete this.plugin.settings.bookInitLocations[file.path];
		this.currentCfi = null;
		void this.plugin.saveSettings().catch((error) => {
			console.warn("awesome-reader: failed to clear EPUB location", error);
		});
	}

	private prepareRendition(rendition: Rendition, file: TFile, loadId: number, initLocation: string | null) {
		if (!initLocation) return;
		const originalDisplay = rendition.display.bind(rendition);
		let initialDisplayPending = true;
		let recoveryStarted = false;
		const recover = (): Promise<void> => {
			if (!initialDisplayPending || recoveryStarted) return Promise.resolve();
			recoveryStarted = true;
			initialDisplayPending = false;
			rendition.off("displayerror", recover);
			if (loadId !== this.loadId) return Promise.resolve();
			this.clearInitLocation(file, initLocation);
			const fallback = originalDisplay();
			void fallback.catch((error: unknown) => {
				console.warn("awesome-reader: failed to recover EPUB location", error);
			});
			return fallback;
		};
		rendition.on("displayerror", recover);
		const renditionWithDisplay = rendition as Rendition & {
			display: (target?: string | number) => Promise<void>;
		};
		renditionWithDisplay.display = (target?: string | number) => {
			if (!initialDisplayPending || target !== initLocation) {
				initialDisplayPending = false;
				rendition.off("displayerror", recover);
				return originalDisplay(target);
			}
			try {
				if (!rendition.book.spine.get(initLocation)) return recover();
				const display = rendition.book.getRange(initLocation).then((range) => {
					if (!range) return recover();
					if (!initialDisplayPending) return;
					if (loadId !== this.loadId) {
						initialDisplayPending = false;
						rendition.off("displayerror", recover);
						return;
					}
					return originalDisplay(target).then(
						() => {
							initialDisplayPending = false;
							rendition.off("displayerror", recover);
						},
						() => recover(),
					);
				}, () => recover());
				void display.catch((error: unknown) => {
					console.warn("awesome-reader: failed to display EPUB location", error);
				});
				return display;
			} catch (error) {
				return recover();
			}
		};
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.captureCurrentLocation(this.readerFile);
		const loadId = ++this.loadId;
		this.unmountReader();
		await this.flushLocationSave();
		if (loadId !== this.loadId) return;
		this.contentEl.empty();
		this.fileToc = null;
		const initLocation = await this.getInitLocation(file);
		if (loadId !== this.loadId) return;
		this.currentCfi = null;
		// @ts-ignore
		const style = getComputedStyle(this.containerEl.parentElement.querySelector('div.view-header'));
		const width = parseFloat(style.width);
		const height = parseFloat(style.height);
		const tocOffset = height < width ? height : 0;

		const contents = await this.app.vault.readBinary(file);
		if (loadId !== this.loadId) return;
		ReactDOM.render(
			<EpubReader
				contents={contents}
				title={file.basename}
				scrolled={this.settings.scrolledView}
				tocOffset={tocOffset}
				initLocation={initLocation}
				saveLocation={(location: string) => {
					if (loadId !== this.loadId) return;
					this.currentCfi = location;
					this.scheduleLocationSave(file, location);
				}}
				tocMemo={(toc: any) => {
					if (loadId !== this.loadId) return;
					this.fileToc = toc;
				}}
				onRendition={(rendition: Rendition) => {
					if (loadId !== this.loadId) {
						return;
					}
					this.rendition = rendition;
					this.book = rendition.book;
					this.readerFile = file;
					this.prepareRendition(rendition, file, loadId, initLocation);
					this.onResize();
				}}
			/>,
			this.contentEl
		);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.captureCurrentLocation(file);
		const loadId = ++this.loadId;
		this.unmountReader();
		await this.flushLocationSave();
		if (loadId !== this.loadId) return;
		this.fileToc = null;
		this.currentCfi = null;
	}

	onunload(): void {
		this.captureCurrentLocation(this.readerFile);
		++this.loadId;
		void this.flushLocationSave();
		this.unmountReader();
		this.currentCfi = null;
	}

	canAcceptExtension(extension: string) {
		return extension == "epub";
	}

	getViewType() {
		return "epub";
	}
}
