# StorageBox

A self-hosted, GitHub-backed asset dashboard — a personal alternative to Cloudinary, built with plain HTML, CSS, and JavaScript. No backend, no build step.

Your assets live in a public GitHub repo under `StorageBox/`. This site reads that folder through the GitHub API, gives you a browsable dashboard, and can serve any individual asset at a clean URL.

## 1. Configure your repository

Open `script.js` and edit the `CONFIG` block at the top:

```js
const CONFIG = {
  githubOwner: "YOUR_USERNAME",
  githubRepo: "YOUR_REPOSITORY",
  branch: "main",
  storagePath: "StorageBox"
};
```

The repository must be **public** — this is a client-only app with no token, so it can only read what GitHub's API serves anonymously.

## 2. Add assets

Drop files straight into `StorageBox/` in your GitHub repo, in as many nested folders as you like:

```
StorageBox/
├── img/
│   ├── icon.png
│   └── logos/
│       └── discord.png
├── gifs/
│   └── animation.gif
├── videos/
│   └── demo.mp4
└── music/
    └── intro.mp3
```

The dashboard doesn't hardcode this structure — it reads it live from GitHub's tree API every time it loads, so new folders and files just appear after a refresh.

## 3. How URLs work

- **Dashboard:** `https://yourdomain.com/`
- **Asset:** `https://yourdomain.com/img/icon.png` (also works as `https://yourdomain.com/storagebox/img/icon.png`)

Opening an asset URL directly shows *only* that image, GIF, video, or audio file — full-bleed, with no sidebar, buttons, or dashboard UI.

### The static-hosting limitation, explained honestly

A real backend could look at the request path and decide instantly what to serve. A static host can't run that logic — it can only redirect an unknown path to a file it already has. Both `netlify.toml` and `vercel.json` in this project rewrite **every** path to `index.html`. When that page loads, `script.js` reads `location.pathname` and, if it looks like a file (has an extension), immediately hides the dashboard and renders just the asset — pulling the actual bytes from `raw.githubusercontent.com`.

The trade-off: the browser still technically loads `index.html` first before the JS decides what to show, so this isn't a true zero-overhead CDN redirect, and it won't work with `<img>` tags on *other* sites unless you point those directly at the GitHub raw URL instead. For embedding elsewhere, use the raw URL shown when you click "Open direct URL" in the preview modal, or copy it from the Copy URL button (which copies the pretty `yourdomain.com/...` URL, resolvable by this site).

## 4. Deploy to Netlify

1. Push this project (with your `StorageBox/` assets) to a public GitHub repo.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Build command: leave blank. Publish directory: `.`
4. Deploy. `netlify.toml` already contains the redirect rule needed for asset URLs to work.

## 5. Deploy to Vercel

1. In Vercel: **Add New → Project** → import the repo.
2. Framework preset: **Other**. Build command: none. Output directory: `.`
3. Deploy. `vercel.json` already contains the rewrite rule needed for asset URLs to work.

## 6. Using the dashboard

- **Sidebar** — click any folder to open it; nested folders expand inline.
- **Breadcrumbs** — jump back up the path at any depth.
- **Search** — filters the current folder by filename.
- **Type chips** (All / Images / GIFs / Video / Audio / Other) — filter by file type.
- **Grid / list toggle** — switch how assets are displayed.
- **Card actions** — copy URL or download without opening the preview.
- **Click an asset** — opens the preview modal with a large view, file path, public URL, copy/download/open-direct-URL buttons.
- **Refresh** — re-reads the repo tree from GitHub (useful right after pushing new files).

## 7. How discovery works, technically

On load, the app calls:

```
GET https://api.github.com/repos/{owner}/{repo}/branches/{branch}
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{sha}?recursive=1
```

The second call returns every file and folder in the repo in one request. The app filters that list down to anything under `StorageBox/`, builds a nested tree in memory, and renders the sidebar and grid from it — no hardcoded folder list, no token required (GitHub's API allows a modest number of unauthenticated requests per hour per IP, which is enough for personal use).

## File structure

```
/
├── index.html
├── style.css
├── script.js
├── netlify.toml
├── vercel.json
├── StorageBox/
│   ├── img/
│   ├── gifs/
│   ├── videos/
│   └── music/
└── README.md
```
