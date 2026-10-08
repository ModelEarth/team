When the browser or a local server gets slow, find what's using the memory.
The panels above show your browser's own pages for this, this tab's memory,
and the CloudRoot dev server's memory, refreshed every 10 seconds.

## Which tab is using the memory?

Chromium browsers (Brave, Chrome, Edge) have the same tools. Their internal
pages start with the browser's name, e.g. `brave://discards` in Brave and
`chrome://discards` in Chrome. Web pages can't link to them, so copy the one
shown above into the address bar.

1. **Task manager.** On a Mac: menu ⋮ → **More tools → Task manager**
   (Shift+Esc on Windows). Each tab and extension gets a row.
   - Click **Memory footprint** to sort; the top row is the heaviest.
   - Right-click a column header to add **JavaScript memory**.
   - **Double-click** a row to switch to that tab.
   - **End process** frees that tab's memory; the tab stays and reloads
     when you click it.
2. **`brave://discards`** (or `chrome://discards`) lists every tab with its
   memory and how recently it was used. The actions are in the right-most
   column of the table, so scroll right or widen the window:
   - **Discard** frees the tab's memory but keeps it in the tab bar; it
     reloads when you return to it.
   - There's no visit or close action on this page. Use the Task manager
     (double-click a row) to go to a tab, and close it from the tab bar.
   - Freezing tabs isn't offered here in current versions; Memory Saver
     does the equivalent automatically.
3. **Memory Saver** (Settings → System → Memory Saver) frees inactive tabs
   automatically, so one heavy background tab can't slow everything down.
4. **Is a page leaking?** Open DevTools → **More tools → Performance
   monitor** and watch **JS heap size** and **DOM Nodes**. If they keep
   rising while you aren't using the page, it's leaking. The **Memory** tab
   takes heap snapshots you can compare.

Localhost tabs left open while code changes are a common cause: every hot
reload adds to the page's memory. Reload or close them after a long editing
session.

## The CloudRoot dev server (port 3700)

`node chat/server.mjs` runs the Next.js dev server, which keeps more memory
with each recompile. With Node's default heap limit (about 4 GB), a long
editing session ends in "JavaScript heap out of memory". Start it with a
larger limit, from the CloudRoot folder:

```bash
NODE_OPTIONS=--max-old-space-size=8192 PORT=3700 node chat/server.mjs
```

The Node.js panel above reads `http://localhost:3700/api/server-memory`, and
the **Active ports** panel lists every process listening on a local port,
with its memory, from `http://localhost:3700/api/port-memory`.
Growth only while files change is the dev server; growth while it's idle
and only serving pages could be a leak. From a terminal:

```bash
ps -o rss= -p $(lsof -t -iTCP:3700 -sTCP:LISTEN) | awk '{print $1/1024 " MB"}'
```

Restarting the server frees the memory. Production (Vercel, Cloudflare)
doesn't run the dev server, so this only affects local development.
