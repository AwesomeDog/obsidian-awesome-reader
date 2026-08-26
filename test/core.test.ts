import assert from "node:assert/strict";
import {test} from "node:test";
import type {NavItem} from "epubjs";
import {getEpubTocMd, isEpubCfi} from "../src/core.ts";

await test("validates persisted EPUB locations", () => {
	assert.equal(isEpubCfi("epubcfi(/6/2)"), true);
	assert.equal(isEpubCfi("epubcfi(/6/2[chapter]!/4/2/2)"), true);
	for (const value of [null, 2, "", "epubcfi(/6)", "epubcfi(/6/2) trailing"]) {
		assert.equal(isEpubCfi(value), false);
	}
});

await test("renders nested EPUB navigation as clean Markdown headings", () => {
	const toc: NavItem[] = [{
		id: "part",
		href: "part.xhtml",
		label: " Part\0 One ",
		subitems: [{id: "chapter", href: "chapter.xhtml", label: "Chapter 1"}],
	}];
	assert.equal(getEpubTocMd(toc), "# Part One\n\n## Chapter 1");
	assert.equal(getEpubTocMd(null), "");
});
