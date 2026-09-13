#!/usr/bin/env python3
"""Parse Citi (Singapore) credit-card statement PDFs into expenses/data.plain.json.

Usage:
    python3 expenses/scripts/parse_statements.py <folder-with-pdfs> [--out expenses/data.plain.json]

Requires `pdftotext` (poppler-utils). Every *.pdf in the folder is treated as one statement.
Only transaction lines are kept — no card numbers, addresses, balances or limits leave this
script. The output is git-ignored; run `node encrypt.js expenses <passcode>` to publish it.

Categorisation is rule-driven: see expenses/scripts/rules.json (first match wins, ordered).
"""
import json, re, subprocess, sys, os, hashlib
from collections import Counter, defaultdict
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
RULES = json.load(open(os.path.join(HERE, "rules.json")))
CATEGORIES = RULES["categories"]
MERCHANT_RULES = [(re.compile(r["match"], re.I), r) for r in RULES["merchants"]]

MONTHS = {m: i + 1 for i, m in enumerate(["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"])}
MONTH_FULL = {m: i + 1 for i, m in enumerate(["January","February","March","April","May","June","July","August","September","October","November","December"])}

TXN = re.compile(r"^\s*(\d{2}) ([A-Z]{3})\s{2,}(.+?)\s{2,}(\(?[\d,]+\.\d{2}\)?)\s*$")
FX = re.compile(r"^\s*FOREIGN AMOUNT\s+([A-Z][A-Z ]+?)\s+([\d,]+\.\d{2})\s*$")
STMT_DATE = re.compile(r"Statement Date\s+([A-Z][a-z]+) (\d{1,2}), (\d{4})")
# Lines that are not spend (payments to the card, statement bookkeeping)
NOT_SPEND = re.compile(r"MONEYSEND|PAYMENT\s*-\s*THANK YOU|BALANCE PREVIOUS STATEMENT|SUB-TOTAL|GRAND TOTAL|^PAYMENT\b|FAST PAYMENT|INTERNET PAYMENT|BILL PAYMENT", re.I)

def money(s):
    neg = s.startswith("(")
    v = float(s.strip("()").replace(",", ""))
    return -v if neg else v

def categorise(desc):
    for rx, r in MERCHANT_RULES:
        if rx.search(desc):
            return r["merchant"], r["category"]
    # fallback: first token cleaned up
    m = re.sub(r"[\*#@].*$", "", desc.split("  ")[0]).strip()
    m = re.sub(r"\s+(SINGAPORE|Singapore|SG)$", "", m).strip()
    return (m[:40] or "Unknown"), "Other"

def parse_pdf(path):
    txt = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, check=True).stdout
    m = STMT_DATE.search(txt)
    if not m:
        raise SystemExit(f"{path}: no statement date found")
    s_month, s_day, s_year = MONTH_FULL[m.group(1)], int(m.group(2)), int(m.group(3))
    stmt = f"{s_year:04d}-{s_month:02d}"
    lines = txt.splitlines()
    out = []
    for i, line in enumerate(lines):
        t = TXN.match(line)
        if not t:
            continue
        day, mon, desc, amt = int(t.group(1)), t.group(2), t.group(3), money(t.group(4))
        desc = re.sub(r"\s{2,}", " ", desc).strip()
        if NOT_SPEND.search(desc):
            continue
        month = MONTHS[mon]
        year = s_year if month <= s_month else s_year - 1
        fx = None
        for j in range(i + 1, min(i + 4, len(lines))):
            f = FX.match(lines[j])
            if f:
                fx = {"ccy": f.group(1).strip(), "amount": money(f.group(2))}
                break
            if TXN.match(lines[j]):
                break
        merchant, category = categorise(desc)
        cm = re.search(r"([A-Z]{2})$", desc)
        country = cm.group(1) if cm else None
        d = date(year, month, day).isoformat()
        tid = hashlib.sha1(f"{stmt}|{d}|{desc}|{amt:.2f}|{len(out)}".encode()).hexdigest()[:10]
        out.append({"id": tid, "date": d, "statement": stmt, "desc": desc, "merchant": merchant,
                    "category": category, "amount": round(amt, 2), "country": country or "SG",
                    **({"fx": fx} if fx else {})})
    return stmt, out

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_path = os.path.join(HERE, "..", "data.plain.json")
    if "--out" in sys.argv:
        out_path = sys.argv[sys.argv.index("--out") + 1]
    if not args:
        raise SystemExit(__doc__)
    folder = args[0]
    pdfs = sorted(p for p in os.listdir(folder) if p.lower().endswith(".pdf"))
    txns, statements = [], []
    for p in pdfs:
        stmt, rows = parse_pdf(os.path.join(folder, p))
        statements.append({"statement": stmt, "file": p, "count": len(rows), "spend": round(sum(r["amount"] for r in rows), 2)})
        txns.extend(rows)
    txns.sort(key=lambda r: (r["date"], r["statement"], r["desc"]))
    by_cat = Counter()
    for r in txns:
        by_cat[r["category"]] += r["amount"]
    unknown = Counter(r["merchant"] for r in txns if r["category"] == "Other")
    data = {
        "meta": {
            "source": "Citi credit-card statements (PDF)",
            "currency": "SGD",
            "generated": date.today().isoformat(),
            "range": {"start": txns[0]["date"], "end": txns[-1]["date"]},
            "statements": statements,
        },
        "categories": CATEGORIES,
        "transactions": txns,
    }
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    json.dump(data, open(out_path, "w"), indent=0, ensure_ascii=False)
    print(f"{len(pdfs)} statements, {len(txns)} transactions, SGD {sum(by_cat.values()):,.2f}")
    for c, v in by_cat.most_common():
        print(f"  {c:<26} {v:>12,.2f}")
    if unknown:
        print(f"\n{sum(unknown.values())} uncategorised transactions across {len(unknown)} merchants; top:")
        for m, n in unknown.most_common(25):
            print(f"  {n:>3}  {m}")
    print(f"\nwrote {out_path}")

if __name__ == "__main__":
    main()
