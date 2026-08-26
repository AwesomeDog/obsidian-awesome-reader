import type {NavItem} from "epubjs";

const EPUB_CFI_PATTERN = /^epubcfi\(\/\d+\/\d+(?:\[[^\]]*\])?(?:!\/[^)]+)?\)$/;

export function isEpubCfi(value: unknown): value is string {
	return typeof value === "string" && EPUB_CFI_PATTERN.test(value);
}

export function tocToMarkdown<T>(
	toc: readonly T[] | null,
	label: (item: T) => string,
	children: (item: T) => readonly T[] | undefined,
): string {
	const headings: string[] = [];
	const visit = (items: readonly T[], depth: number): void => {
		for (const item of items) {
			headings.push(`${"#".repeat(depth)} ${label(item).replaceAll("\0", "").trim()}`);
			visit(children(item) ?? [], depth + 1);
		}
	};
	visit(toc ?? [], 1);
	return headings.join("\n\n");
}

export function getEpubTocMd(toc: readonly NavItem[] | null): string {
	return tocToMarkdown(toc, item => item.label, item => item.subitems);
}
