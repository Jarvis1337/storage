# StorageBox

A self-hosted asset dashboard — a personal alternative to Cloudinary, built with plain HTML, CSS, and JavaScript. No backend server, no database, and no GitHub API calls at runtime — which means **private repos work fine**.

## How it actually works

When Netlify or Vercel deploys your site, they clone your repository first — private repos included, since you've already connected/authorized them. So by the time the build runs, `StorageBox/` already exists on disk.

`build.js` is a small Node script that runs **once, during that build step** (never in the browser). It walks `StorageBox/` and writes `storagebox-manifest.json` — a plain JSON file listing every folder and file. `script.js` (which *does* run in the browser) just fetches that JSON file from the same domain. No GitHub token, no CORS, no "repo not found" errors, because there's no external API call at all — everything the dashboard needs is already sitting on the same server as the site.

## 1. Add assets

Drop files into `StorageBox/` in your repo, in as many nested folders as you like:

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

Nothing needs to be listed by hand anywhere — `build.js` discovers the structure automatically on every deploy.

## 2. Deploy to Netlify

1. Push this project (with your `StorageBox/` assets) to your GitHub repo — public or private, both work.
2. In Netlify: **Add new site → Import an existing project** → pick the repo (authorize Netlify's GitHub App if it's private).
3. Netlify reads `netlify.toml`, which already sets:
   - Build command: `node build.js`
   - Publish directory: `.`
   - A redirect so every path falls through to `index.html`
4. Deploy. Done — no extra config needed.

## 3. Deploy to Vercel

1. In Vercel: **Add New → Project** → import the repo (grant access if private).
2. Vercel reads `vercel.json`, which already sets the build command (`node build.js`), output directory (`.`), and the rewrite rule.
3. Deploy.

Both platforms provide a Node.js environment during the build step by default — that's exactly what `build.js` needs, and it's a build-time tool, not a runtime server, so the "static site only" requirement still holds for the deployed app itself.

### If the dashboard shows folders/files with wrong counts or no live previews

This almost always means `storagebox-manifest.json` was never generated (Vercel's dashboard project settings can silently override `vercel.json`'s build command if the project was created before you added it). `package.json` is included specifically to make Vercel/Netlify auto-detect a Node build step and run `node build.js` regardless of dashboard settings — but to confirm it's actually working:

1. Open your deploy's build logs and look for the line `[build.js] Wrote storagebox-manifest.json from "StorageBox/".` If it's missing, the build command never ran.
2. Visit `https://yourdomain.com/storagebox-manifest.json` directly in the browser. It should show JSON starting with `{"folders":...}`. If it shows your `index.html` page instead, the rewrite rule is swallowing the manifest request — double check the filename matches exactly (case-sensitive) in `vercel.json` / `netlify.toml`.
3. In Vercel: **Project Settings → Build & Development Settings**, make sure "Override" is on for Build Command with the value `node build.js`, and Output Directory is `.` (or blank).

## 4. How URLs work

- **Dashboard:** `https://yourdomain.com/`
- **Asset:** `https://yourdomain.com/img/icon.png` (also works as `https://yourdomain.com/storagebox/img/icon.png`)

Opening an asset URL directly shows *only* that image, GIF, video, or audio file — full-bleed, no sidebar or dashboard chrome.

### The one static-hosting limitation

A real backend can look at a request path and decide instantly what to serve. A static host can't run that logic mid-request — it can only redirect an unknown path to a file it already has. `netlify.toml` / `vercel.json` rewrite unmatched paths to `index.html`. Once that loads, `script.js` reads `location.pathname` and, if it looks like a file, immediately hides the dashboard and shows just the asset (pulled from the same domain, same-origin, no external calls). The browser does still load `index.html` first before the JS decides — this isn't a zero-overhead CDN redirect. For embedding assets on *other* sites, use the URL from "Open direct URL" in the preview modal — that's a same-origin link this site can always resolve.

## 5. Using the dashboard

- **Sidebar** — click a folder to open it; nested folders expand inline.
- **Breadcrumbs** — jump back up the path at any depth.
- **Search** — filters the current folder by filename.
- **Type chips** (All / Images / GIFs / Video / Audio / Other) — filter by file type.
- **Grid / list toggle** — switch how assets are displayed.
- **Card actions** — copy URL or download without opening the preview.
- **Click an asset** — opens the preview modal: large view, file path, public URL, copy/download/open-direct-URL buttons.
- **Refresh** — re-fetches `storagebox-manifest.json` (useful right after a new deploy).

## 6. Updating assets

Add or remove files in `StorageBox/`, commit, push. The next deploy re-runs `build.js`, which regenerates the manifest automatically — nothing to edit by hand.

## File structure

```
/
├── index.html
├── style.css
├── script.js
├── build.js                    ← runs at deploy time, generates the manifest below
├── storagebox-manifest.json    ← generated, don't edit by hand
├── netlify.toml
├── vercel.json
├── StorageBox/
│   ├── img/
│   ├── gifs/
│   ├── videos/
│   └── music/
└── README.md
```
