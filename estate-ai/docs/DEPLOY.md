# Putting ESTATE AI online later

`npm run build` produces `dist/`: static files with relative paths and hash routing. Any static host works.

## Free options (no purchase needed)

* **GitHub Pages** — free for public repositories; serves `https://<user>.github.io/<repo>/`.
* **Cloudflare Pages / Netlify / Vercel** — free tiers for static sites, https included.

Data stays in each visitor's browser: putting the app online does **not** upload anyone's properties.

## What would cost money (not done)

| Item | Typical cost |
| --- | --- |
| Custom domain (e.g. estate-ai.com) | ~US$10–20 per year from a registrar |
| Cloud sync between devices / accounts | Needs a backend and storage; free tiers exist but have limits |
| Cloud AI (LLM or image) | Pay per request |

Connecting a custom domain later is a DNS setting on the host above; no code change is needed.
