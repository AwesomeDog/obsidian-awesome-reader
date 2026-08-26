# Awesome Reader

Make Obsidian a proper Reader.

## Features

- 💾 Remember reading progress and sync to all devices. You can now continue reading where you left off across all
  devices.
- ✒ Create book note from TOC(table of contents). With well organized heading formats.
- ♳ Support multiple ebook formats. Currently, epub and pdf are supported.

## How to use

You may want to toggle on `Detect all file extensions` first in `options -> Files & Links`.

1. Drop some ebooks(e.g. epub files) to your vault. Click it and read.
2. To create book note, click `Open/create book note` from file menu. Note will be in the same folder alongside the
   book.
3. Reading progress is automatically remembered in plugin's folder. And will be sync to all devices if you got "Obsidian
   Sync" or similar services.

![](resources/img1.png)

## Known issues

- Reading progress of pdf format is not fully implemented now

## Development

Development requires Node.js 24 or newer. Install dependencies, run all checks, build the production bundle, and
optionally copy it directly into a local vault:

```bash
npm install
npm run check
npm run build
npm run deploy -- "/path/to/vault"
```

The deploy command copies `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/awesome-reader/`.
After deployment, enable **Awesome Reader** in Obsidian. Reload the plugin after source changes; restart Obsidian after
changing `manifest.json`.

## Release

Use npm's version command to update `package.json`, `manifest.json`, and `versions.json`, then push the generated commit
and tag (tags intentionally have no `v` prefix):

```bash
npm version patch
git push origin master --follow-tags
```

Pushing the tag starts the release workflow. It checks the version, builds the plugin, attaches `main.js`,
`manifest.json`, and `styles.css`, and creates a draft GitHub release for review and publication.

## Attribution

Special thanks to caronchen's
marvelous [Obsidian ePub Reader Plugin](https://github.com/caronchen/obsidian-epub-plugin),
some code is from this great work.
