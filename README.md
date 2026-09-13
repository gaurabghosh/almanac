# 📖 GG's Almanac

A private, static site of journals and personal analytics. One hub, one folder per section.

**Live:** https://gaurabghosh.github.io/almanac/

| Section | Folder | Status | Source |
|---|---|---|---|
| Personal Journal — *Homework for Life* | `life/` | live | Notion "Story" database, refreshed weekly |
| Expense Analytics | `expenses/` | live | Citi credit-card statement PDFs, monthly |
| Work Journal | `work/` | coming soon | — |
| Travel Journal | `travel/` | coming soon | — |

## Layout

```
index.html        hub — renders cards from sections.js
sections.js       section registry (title, emoji, blurb, status, href)
assets/           shared design tokens (almanac.css)
encrypt.js        node encrypt.js <section> <passcode>
life/             React app + data.enc.json
expenses/         React app + data.enc.json + scripts/ (PDF parser, category rules)
work/ travel/     placeholder pages
```

### Adding a section

1. Create `<name>/index.html` (copy `work/index.html` for a placeholder, or `expenses/` for a full encrypted app).
2. Add an entry to `sections.js`. Status `live` makes the card clickable; anything else renders it as a placeholder.
3. If it has data: keep `<name>/data.plain.json` git-ignored and publish only `data.enc.json` via `node encrypt.js <name> <passcode>`.

## Stack

React 19 + Framer Motion + Tailwind CSS v4 loaded as ES modules from a CDN — no bundler, no install step.
Each section's `app.js` is compiled from its `app.jsx` and committed:

```bash
cd expenses   # or life
tsc --allowJs --jsx react-jsx --target es2022 --module es2022 --moduleResolution bundler --outDir . app.jsx
```

## Privacy

Nothing personal is stored in this repo in plaintext. Each section's `data.enc.json` is AES-256-GCM
(key from the passcode via PBKDF2-SHA256, 310k iterations). Decryption happens in the browser; the
passcode is never persisted and every page load asks again. Sections have independent passcodes.

## Updating data

### Personal Journal
1. Edit `life/data.plain.json` (git-ignored)
2. `node encrypt.js life "<passcode>"`
3. Commit `life/data.enc.json`, push

### Expense Analytics
1. Drop the month's statement PDF into the `Finances/Spending/credit_card_statements` Drive folder (or any local folder)
2. `python3 expenses/scripts/parse_statements.py <folder-with-pdfs>` — needs `pdftotext` (poppler). Writes
   `expenses/data.plain.json`, prints category totals and anything left uncategorised. Every statement is
   reconciled against its printed transaction sub-total (net of refunds); card numbers, addresses and balances
   are never extracted.
3. Tweak `expenses/scripts/rules.json` for new merchants (ordered regex → merchant, category; first match wins) and re-run
4. `node encrypt.js expenses "<passcode>"`
5. Commit `expenses/data.enc.json`, push
