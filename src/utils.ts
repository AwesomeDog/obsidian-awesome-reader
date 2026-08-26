import {loadPdfJs, type App, type Menu, type TFile} from "obsidian";
import {tocToMarkdown} from "./core";

interface PdfOutlineItem {
	title: string;
	items: PdfOutlineItem[];
}

interface PdfDocument {
	getOutline(): Promise<PdfOutlineItem[] | null>;
}

interface PdfJs {
	getDocument(data: Uint8Array): {promise: Promise<PdfDocument>};
}

export function addBookNoteMenuItem(menu: Menu, onClick: () => void | Promise<void>): void {
	menu.addItem(item => item.setTitle("Open/create book note").setIcon("document").onClick(onClick));
}

export async function openOrCreateNote(app: App, file: TFile, toc: string): Promise<void> {
	const parentPath = file.parent?.path;
	const notePath = parentPath ? `${parentPath}/${file.basename}.md` : `${file.basename}.md`;
	const note = app.vault.getFileByPath(notePath) ?? await app.vault.create(
		notePath,
		`---\nbookname: "${file.basename}.${file.extension}"\n---\n\n${toc}`,
	);
	const leaf = app.workspace.getMostRecentLeaf();
	if (leaf) await app.workspace.createLeafBySplit(leaf).openFile(note, {active: true});
}

export async function getPdfTocMd(app: App, file: TFile): Promise<string> {
	// Obsidian currently exposes PDF.js as `any`; keep that boundary local and typed.
	const pdfJs = await loadPdfJs() as unknown as PdfJs;
	const contents = await app.vault.readBinary(file);
	const pdf = await pdfJs.getDocument(new Uint8Array(contents)).promise;
	return tocToMarkdown(await pdf.getOutline(), item => item.title, item => item.items);
}
