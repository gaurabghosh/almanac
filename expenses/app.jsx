import { useState, useEffect, useMemo, useRef, createContext, useContext, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence, animate, LayoutGroup } from "framer-motion";

/* ============================== crypto ============================== */
const b64ToBuf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function decryptPayload(payload, passphrase) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBuf(payload.salt), iterations: payload.iterations, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(payload.iv) }, key, b64ToBuf(payload.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function unlock(passphrase) {
  const res = await fetch("data.enc.json", { cache: "no-store" });
  if (!res.ok) throw new Error("could not load data");
  return decryptPayload(await res.json(), passphrase);
}

/* ============================== utils ============================== */
const EASE = [0.22, 1, 0.36, 1];
const SPRING = { type: "spring", stiffness: 260, damping: 30 };
const monthLabel = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-SG", { month: "long", year: "numeric" });
const monthShort = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-SG", { month: "short" });
const monthShortYr = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-SG", { month: "short", year: "2-digit" });
const dayFull = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dayShort = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-SG", { day: "2-digit", month: "short" });
const dayShortYr = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
// Axis label for a month: adds the year on January and on the first column so long ranges stay unambiguous
const axisMonth = (k, i, n) => (n > 14 ? (i === 0 || k.endsWith("-01") ? monthShortYr(k) : monthShort(k)) : monthShortYr(k));
const fmt = (n, d = 0) => n.toLocaleString("en-SG", { minimumFractionDigits: d, maximumFractionDigits: d });
const sgd = (n, d = 0) => (n < 0 ? "−" : "") + "$" + fmt(Math.abs(n), d);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
function niceTicks(min, max, n) {
  const span = max - min || 1;
  const mag = 10 ** Math.floor(Math.log10(span / n));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => span / s <= n) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
const roundTop = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, Math.max(h, 0.01));
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
};
const roundRight = (x, y, w, h, r) => {
  r = Math.min(r, h / 2, Math.max(w, 0.01));
  return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
};
const kfmt = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : String(Math.round(v)));

/* ============================== shared UI ============================== */
const CARD = "rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-xl shadow-[0_1px_2px_rgba(16,16,20,.04),0_10px_34px_-12px_rgba(16,16,20,.14)]";
const GRAD = "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500";
const TipCtx = createContext(() => {});
function Tooltip({ tip }) {
  return (
    <AnimatePresence>
      {tip && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.12 }} style={{ left: tip.x, top: tip.y }}
          className="pointer-events-none fixed z-50 max-w-[320px] rounded-xl border border-black/10 bg-white/95 backdrop-blur-xl px-3 py-2 text-[12.5px] leading-snug text-ink shadow-xl">
          {tip.title && <div className="mb-0.5 text-[11px] text-muted">{tip.title}</div>}
          <div dangerouslySetInnerHTML={{ __html: tip.body }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
function useSetTip() {
  const set = useContext(TipCtx);
  return useCallback((e, body, title) => {
    const pad = 16;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x > window.innerWidth - 340) x = e.clientX - 340;
    if (y > window.innerHeight - 130) y = e.clientY - 120;
    set({ x, y, body, title });
  }, [set]);
}
function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", duration = 1.1 }) {
  const [n, setN] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    const c = animate(shown.current, value, { duration, ease: EASE, onUpdate: (v) => { shown.current = v; setN(v); } });
    return () => c.stop();
  }, [value, duration]);
  return <>{prefix}{fmt(n, decimals)}{suffix}</>;
}
function ChartCard({ title, desc, children, className = "", legend }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE }} className={`${CARD} min-w-0 p-5 ${className}`}>
      <h3 className="text-[14.5px] font-semibold tracking-tight">{title}</h3>
      {desc && <p className="mt-0.5 mb-3 text-[12.5px] text-muted">{desc}</p>}
      {children}
      {legend && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">{legend}</div>}
    </motion.div>
  );
}
const Swatch = ({ color, label }) => (
  <span className="flex items-center gap-1.5 text-[12px] text-ink2"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />{label}</span>
);
function Kpi({ k, v, s, i, decimals = 0, prefix = "", suffix = "", text }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.06, ease: EASE }}
      whileHover={{ y: -3 }} className={`${CARD} p-4 transition-shadow hover:shadow-[0_8px_34px_-14px_rgba(99,102,241,.35)]`}>
      <div className="text-[12px] text-muted">{k}</div>
      <div className={`mt-0.5 font-bold tracking-tight ${text ? "text-[18px] leading-tight pt-1" : "text-[27px]"}`}>
        {text ? text : <AnimatedNumber value={v} decimals={decimals} prefix={prefix} suffix={suffix} />}
      </div>
      <div className="mt-0.5 text-[12px] text-ink2">{s}</div>
    </motion.div>
  );
}

/* ============================== charts ============================== */
function StackedColumns({ data, series, height = 260, width = 980, onPick }) {
  // data: [{label, key, values:{seriesId: number}, total}], series: [{id,label,color}]
  const setTip = useSetTip();
  const clear = useContext(TipCtx);
  const m = { t: 22, r: 8, b: 26, l: 40 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const max = Math.max(...data.map((d) => d.total)) * 1.08 || 1;
  const bw = Math.min(46, (iw / data.length) * 0.64);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full h-auto overflow-visible">
      {niceTicks(0, max, 4).map((t) => {
        const y = m.t + ih - (t / max) * ih;
        return <g key={t}><line x1={m.l} x2={width - m.r} y1={y} y2={y} className="gridline" /><text x={m.l - 6} y={y + 3.5} textAnchor="end" className="axis-t">{kfmt(t)}</text></g>;
      })}
      {data.map((d, i) => {
        const cx = m.l + (iw / data.length) * (i + 0.5);
        let acc = 0;
        const segs = series.map((s) => {
          const v = d.values[s.id] || 0;
          const h = (v / max) * ih;
          const y = m.t + ih - (acc / max) * ih - h;
          acc += v;
          return { s, v, h, y };
        }).filter((x) => x.v > 0);
        const top = m.t + ih - (d.total / max) * ih;
        const tipBody = `<b>${monthLabel(d.key)}</b> · ${sgd(d.total)}<br>` +
          segs.slice().reverse().map((x) => `<span style="color:${x.s.color}">■</span> ${x.s.label} ${sgd(x.v)}`).join("<br>");
        return (
          <g key={d.key} style={{ cursor: onPick ? "pointer" : "default" }} onClick={() => onPick && onPick(d.key)}>
            {segs.map((x, j) => (
              <motion.path key={x.s.id} d={j === segs.length - 1 ? roundTop(cx - bw / 2, x.y, bw, Math.max(x.h - 1.5, 0.5), 5) : `M${cx - bw / 2},${x.y} h${bw} v${Math.max(x.h - 1.5, 0.5)} h${-bw} Z`}
                fill={x.s.color} initial={{ opacity: 0, scaleY: 0 }} whileInView={{ opacity: 1, scaleY: 1 }} viewport={{ once: true }}
                style={{ transformOrigin: `${cx}px ${m.t + ih}px` }} transition={{ duration: 0.6, delay: i * 0.04, ease: EASE }}
                onMouseMove={(e) => setTip(e, tipBody)} onMouseLeave={() => clear(null)} />
            ))}
            <motion.text x={cx} y={top - 6} textAnchor="middle" className="lbl-strong" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.35 + i * 0.04 }}>
              {kfmt(d.total)}
            </motion.text>
            <text x={cx} y={height - 8} textAnchor="middle" className="axis-t">{d.label}</text>
          </g>
        );
      })}
      <line x1={m.l} x2={width - m.r} y1={m.t + ih} y2={m.t + ih} className="baseline-s" />
    </svg>
  );
}
function HBars({ data, labelWidth = 150, width = 520, money = true }) {
  const setTip = useSetTip();
  const clear = useContext(TipCtx);
  const rowH = 27, m = { t: 6, r: 56, b: 6, l: labelWidth };
  const height = m.t + m.b + rowH * data.length;
  const iw = width - m.l - m.r;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full h-auto overflow-visible">
      {data.map((d, i) => {
        const y = m.t + rowH * i + rowH / 2;
        const w = Math.max(3, (d.value / max) * iw);
        return (
          <g key={d.label}>
            <text x={m.l - 8} y={y + 4} textAnchor="end" className="lbl">{d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label}</text>
            <motion.path d={roundRight(m.l, y - 7.5, w, 15, 5)} fill={d.color || "var(--seq-400)"} initial={{ opacity: 0, scaleX: 0 }} whileInView={{ opacity: 1, scaleX: 1 }} viewport={{ once: true }}
              style={{ transformOrigin: `${m.l}px 0px` }} transition={{ duration: 0.65, delay: i * 0.045, ease: EASE }}
              onMouseMove={(e) => setTip(e, d.tip)} onMouseLeave={() => clear(null)} />
            <motion.text x={m.l + w + 7} y={y + 4} className="lbl-strong" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 + i * 0.045 }}>
              {money ? sgd(d.value) : d.value}
            </motion.text>
          </g>
        );
      })}
      <line x1={m.l} x2={m.l} y1={m.t} y2={height - m.b} className="baseline-s" />
    </svg>
  );
}
function Columns({ data, height = 210, width = 520 }) {
  const setTip = useSetTip();
  const clear = useContext(TipCtx);
  const m = { t: 22, r: 8, b: 26, l: 36 };
  const iw = width - m.l - m.r, ih = height - m.t - m.b;
  const max = Math.max(...data.map((d) => d.value)) * 1.1 || 1;
  const bw = Math.min(44, (iw / data.length) * 0.6);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full h-auto overflow-visible">
      {niceTicks(0, max, 4).map((t) => {
        const y = m.t + ih - (t / max) * ih;
        return <g key={t}><line x1={m.l} x2={width - m.r} y1={y} y2={y} className="gridline" /><text x={m.l - 6} y={y + 3.5} textAnchor="end" className="axis-t">{kfmt(t)}</text></g>;
      })}
      {data.map((d, i) => {
        const cx = m.l + (iw / data.length) * (i + 0.5);
        const h = Math.max(2, (d.value / max) * ih);
        const y = m.t + ih - h;
        return (
          <g key={d.label}>
            <motion.path d={roundTop(cx - bw / 2, y, bw, h, 5)} fill={d.color || "var(--seq-400)"} initial={{ opacity: 0, scaleY: 0 }} whileInView={{ opacity: 1, scaleY: 1 }} viewport={{ once: true }}
              style={{ transformOrigin: `${cx}px ${m.t + ih}px` }} transition={{ duration: 0.6, delay: i * 0.06, ease: EASE }}
              onMouseMove={(e) => setTip(e, d.tip)} onMouseLeave={() => clear(null)} />
            <motion.text x={cx} y={y - 6} textAnchor="middle" className="lbl-strong" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.35 + i * 0.06 }}>{d.text ?? kfmt(d.value)}</motion.text>
            <text x={cx} y={height - 8} textAnchor="middle" className="axis-t">{d.label}</text>
          </g>
        );
      })}
      <line x1={m.l} x2={width - m.r} y1={m.t + ih} y2={m.t + ih} className="baseline-s" />
    </svg>
  );
}
function Heatmap({ rows, cols, get, labelWidth = 150, width = 520 }) {
  const setTip = useSetTip();
  const clear = useContext(TipCtx);
  const m = { t: 24, r: 8, b: 8, l: labelWidth };
  const cellH = 27, gap = 4;
  const height = m.t + m.b + rows.length * (cellH + gap);
  const cw = (width - m.l - m.r - (cols.length - 1) * gap) / cols.length;
  let max = 0;
  rows.forEach((r) => cols.forEach((c) => (max = Math.max(max, get(r, c).value))));
  const steps = ["var(--seq-100)", "var(--seq-200)", "var(--seq-300)", "var(--seq-400)", "var(--seq-550)", "var(--seq-700)"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full h-auto overflow-visible">
      {cols.map((c, j) => <text key={c.id} x={m.l + j * (cw + gap) + cw / 2} y={14} textAnchor="middle" className="axis-t">{c.label}</text>)}
      {rows.map((r, i) => {
        const y = m.t + i * (cellH + gap);
        return (
          <g key={r.id}>
            <text x={m.l - 8} y={y + cellH / 2 + 4} textAnchor="end" className="lbl">{r.label}</text>
            {cols.map((c, j) => {
              const { value, tip } = get(r, c);
              const x = m.l + j * (cw + gap);
              const ratio = max ? value / max : 0;
              const fill = value === 0 ? "color-mix(in srgb, var(--grid) 60%, transparent)" : steps[Math.min(5, Math.floor(ratio * 6))];
              return (
                <g key={c.id}>
                  <motion.rect x={x} y={y} width={cw} height={cellH} rx={7} fill={fill} initial={{ opacity: 0, scale: 0.82 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
                    style={{ transformOrigin: `${x + cw / 2}px ${y + cellH / 2}px` }} transition={{ duration: 0.4, delay: (i * cols.length + j) * 0.012, ease: EASE }}
                    onMouseMove={(e) => setTip(e, tip)} onMouseLeave={() => clear(null)} />
                  {value > 0 && cw > 30 && <text x={x + cw / 2} y={y + cellH / 2 + 4} textAnchor="middle" className="axis-t" style={ratio >= 0.55 ? { fill: "#fff" } : undefined} pointerEvents="none">{kfmt(value)}</text>}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ============================== lock screen ============================== */
function LockScreen({ onUnlocked }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (!pass.trim() || busy) return;
    setBusy(true); setErr("");
    try { onUnlocked(await unlock(pass.trim())); }
    catch { setErr("That passcode didn't work — try again."); setBusy(false); inputRef.current?.select(); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 22, scale: 0.96, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.65, ease: EASE }} className={`${CARD} w-full max-w-[380px] p-8 text-center`}>
        <motion.div initial={{ scale: 0.5, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...SPRING, delay: 0.15 }}
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${GRAD} text-[26px] shadow-lg shadow-violet-500/25`}>💳</motion.div>
        <h1 className="text-[20px] font-bold tracking-tight">Expense Analytics</h1>
        <p className="mx-auto mt-1.5 mb-6 max-w-[260px] text-[13px] leading-relaxed text-muted">GG's Almanac. Transactions are encrypted — enter the passcode to unlock.</p>
        <input ref={inputRef} type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" placeholder="Passcode"
          className="w-full rounded-xl border border-black/10 bg-white/60 px-4 py-2.5 text-center tracking-[0.12em] text-ink outline-none transition placeholder:tracking-normal placeholder:text-muted focus:border-transparent focus:ring-2 focus:ring-violet-500/60" />
        <motion.button type="submit" disabled={busy} whileHover={{ scale: busy ? 1 : 1.02 }} whileTap={{ scale: busy ? 1 : 0.98 }}
          className={`mt-3 w-full rounded-xl ${GRAD} py-2.5 font-semibold text-white shadow-lg shadow-violet-500/25 transition disabled:opacity-70`}>
          {busy ? "Unlocking…" : "Unlock"}
        </motion.button>
        <div className="mt-3 min-h-[20px] text-[13px] text-rose-500">
          <AnimatePresence>{err && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{err}</motion.div>}</AnimatePresence>
        </div>
        <a href="../" className="almanac-crumb mt-5 justify-center"><span className="dot" />Back to GG's Almanac</a>
      </motion.form>
    </div>
  );
}

/* ============================== range picker ============================== */
function RangePicker({ presets, value, onChange, from, to, bounds }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = presets.find((p) => p.id === value);
  const label = value === "custom" ? `${dayShort(from)} – ${dayShort(to)}` : active?.label || "All time";
  return (
    <div className="relative" ref={ref}>
      <motion.button onClick={() => setOpen((o) => !o)} whileTap={{ scale: 0.98 }} className={`${CARD} flex min-w-[200px] items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-medium`}>
        <span className="flex items-center gap-2"><span className="text-muted">🗓</span>{label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-muted">▾</motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16, ease: EASE }}
            className={`${CARD} absolute z-40 mt-2 w-[264px] overflow-hidden p-1.5`}>
            {presets.map((p) => (
              <button key={p.id} onClick={() => { onChange({ preset: p.id }); setOpen(false); }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] transition hover:bg-black/[0.05] ${p.id === value ? "font-semibold" : "text-ink2"}`}>
                {p.label}{p.id === value && <span className="text-[16px] font-bold text-violet-500">✓</span>}
              </button>
            ))}
            <div className="mt-1.5 border-t border-black/[0.08] px-3 pb-1 pt-2.5">
              <div className="mb-1.5 text-[11.5px] text-muted">Custom range</div>
              <div className="flex items-center gap-1.5">
                <input type="date" value={from} min={bounds[0]} max={to} onChange={(e) => onChange({ preset: "custom", from: e.target.value, to })} className="w-full rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50" />
                <span className="text-muted">–</span>
                <input type="date" value={to} min={from} max={bounds[1]} onChange={(e) => onChange({ preset: "custom", from, to: e.target.value })} className="w-full rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================== analytics ============================== */
const MAX_SERIES = 6;
const OTHER_COLOR = "#8a8880";

function useRange(all) {
  const bounds = [all[0].date, all[all.length - 1].date];
  const presets = useMemo(() => {
    const end = bounds[1];
    const monthsBack = (n) => { const d = new Date(end + "T00:00:00"); d.setMonth(d.getMonth() - n); d.setDate(1); return d.toISOString().slice(0, 10); };
    const yr = end.slice(0, 4);
    return [
      { id: "3m", label: "Last 3 months", from: monthsBack(2) },
      { id: "6m", label: "Last 6 months", from: monthsBack(5) },
      { id: "12m", label: "Last 12 months", from: monthsBack(11) },
      { id: "ytd", label: `This year (${yr})`, from: `${yr}-01-01` },
      { id: "ly", label: `Last year (${yr - 1})`, from: `${yr - 1}-01-01`, to: `${yr - 1}-12-31` },
      { id: "all", label: "All time", from: bounds[0] },
    ];
  }, [bounds[0], bounds[1]]);
  const [range, setRange] = useState({ preset: "all", from: bounds[0], to: bounds[1] });
  const onChange = (r) => {
    if (r.preset === "custom") setRange({ preset: "custom", from: r.from, to: r.to });
    else { const p = presets.find((x) => x.id === r.preset); setRange({ preset: p.id, from: p.from < bounds[0] ? bounds[0] : p.from, to: p.to || bounds[1] }); }
  };
  return { bounds, presets, range, onChange };
}

function AnalyticsTab({ data, catOf, range, presets, bounds, onRange, sel, goToTx }) {
  const all = data.transactions;
  const monthsInRange = useMemo(() => {
    const out = []; const d = new Date(range.from.slice(0, 7) + "-01T00:00:00");
    while (d.toISOString().slice(0, 7) <= range.to.slice(0, 7)) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
    return out;
  }, [range]);

  // Category totals across the range → fixed series order (by all-time rank, so colours never repaint)
  const catRank = useMemo(() => {
    const t = {}; for (const x of all) t[x.category] = (t[x.category] || 0) + x.amount;
    return Object.keys(t).sort((a, b) => t[b] - t[a]);
  }, [all]);
  const series = useMemo(() => {
    const top = catRank.slice(0, MAX_SERIES);
    return [...top.map((id) => ({ id, label: id, color: catOf(id).color })), { id: "__other", label: "Other categories", color: OTHER_COLOR }];
  }, [catRank, catOf]);
  const seriesOf = (c) => (series.find((s) => s.id === c) ? c : "__other");

  const monthly = useMemo(() => monthsInRange.map((k, i) => {
    const rows = sel.filter((x) => x.date.slice(0, 7) === k);
    const values = {}; let total = 0;
    for (const r of rows) { const s = seriesOf(r.category); values[s] = (values[s] || 0) + r.amount; total += r.amount; }
    return { key: k, label: axisMonth(k, i, monthsInRange.length), values, total, n: rows.length };
  }), [sel, monthsInRange, series]);

  const total = sel.reduce((a, x) => a + x.amount, 0);
  const nMonths = Math.max(1, monthly.filter((m) => m.n > 0).length);
  const spends = sel.filter((x) => x.amount > 0).map((x) => x.amount).sort((a, b) => a - b);
  const median = spends.length ? spends[Math.floor(spends.length / 2)] : 0;
  const abroad = sel.filter((x) => x.country !== "SG").reduce((a, x) => a + x.amount, 0);
  const refunds = sel.filter((x) => x.amount < 0).reduce((a, x) => a + x.amount, 0);
  const biggestMonth = monthly.reduce((b, m) => (m.total > (b?.total ?? -1) ? m : b), null);
  const days = Math.max(1, Math.round((new Date(range.to) - new Date(range.from)) / 864e5) + 1);

  const byCat = useMemo(() => {
    const t = {}; const n = {};
    for (const x of sel) { t[x.category] = (t[x.category] || 0) + x.amount; n[x.category] = (n[x.category] || 0) + 1; }
    return Object.keys(t).sort((a, b) => t[b] - t[a]).map((c) => ({ label: `${catOf(c).emoji} ${c}`, value: Math.max(0, t[c]), color: catOf(c).color, tip: `<b>${c}</b><br>${sgd(t[c])} · ${n[c]} transactions · ${(t[c] / total * 100).toFixed(1)}% of spend<br>avg ${sgd(t[c] / n[c], 2)}` }));
  }, [sel, total, catOf]);
  const byMerchant = useMemo(() => {
    const t = {}; const n = {}; const c = {};
    for (const x of sel) { t[x.merchant] = (t[x.merchant] || 0) + x.amount; n[x.merchant] = (n[x.merchant] || 0) + 1; c[x.merchant] = x.category; }
    return Object.keys(t).sort((a, b) => t[b] - t[a]).slice(0, 12).map((m) => ({ label: m, value: Math.max(0, t[m]), color: catOf(c[m]).color, tip: `<b>${esc(m)}</b> · ${c[m]}<br>${sgd(t[m])} · ${n[m]} transactions · avg ${sgd(t[m] / n[m], 2)}` }));
  }, [sel, catOf]);
  const byFreq = useMemo(() => {
    const n = {}; const t = {}; const c = {};
    for (const x of sel) { n[x.merchant] = (n[x.merchant] || 0) + 1; t[x.merchant] = (t[x.merchant] || 0) + x.amount; c[x.merchant] = x.category; }
    return Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 10).map((m) => ({ label: m, value: n[m], color: catOf(c[m]).color, tip: `<b>${esc(m)}</b><br>${n[m]} visits · ${sgd(t[m])} total · ${(n[m] / nMonths).toFixed(1)} per month` }));
  }, [sel, nMonths, catOf]);
  const dow = useMemo(() => {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const t = Array(7).fill(0), n = Array(7).fill(0);
    for (const x of sel) { const i = (new Date(x.date + "T00:00:00").getDay() + 6) % 7; t[i] += x.amount; n[i] += 1; }
    return names.map((l, i) => ({ label: l, value: t[i], tip: `<b>${l}</b><br>${sgd(t[i])} across ${n[i]} transactions<br>avg ${sgd(n[i] ? t[i] / n[i] : 0, 2)} each` }));
  }, [sel]);
  const homeAbroad = useMemo(() => monthsInRange.map((k, i) => {
    const rows = sel.filter((x) => x.date.slice(0, 7) === k);
    const home = rows.filter((x) => x.country === "SG").reduce((a, x) => a + x.amount, 0);
    const away = rows.filter((x) => x.country !== "SG").reduce((a, x) => a + x.amount, 0);
    return { key: k, label: axisMonth(k, i, monthsInRange.length), values: { home, away }, total: home + away };
  }), [sel, monthsInRange]);
  const heatCols = monthsInRange.slice(-12).map((k) => ({ id: k, label: monthShort(k) }));
  const heatRows = catRank.slice(0, 8).map((c) => ({ id: c, label: c }));
  const heatGet = useCallback((r, c) => {
    const v = sel.filter((x) => x.category === r.id && x.date.slice(0, 7) === c.id).reduce((a, x) => a + x.amount, 0);
    return { value: Math.max(0, Math.round(v)), tip: `<b>${r.label}</b> · ${monthLabel(c.id)}<br>${sgd(v)}` };
  }, [sel]);
  const countries = useMemo(() => {
    const t = {}; const n = {};
    for (const x of sel) if (x.country !== "SG") { t[x.country] = (t[x.country] || 0) + x.amount; n[x.country] = (n[x.country] || 0) + 1; }
    return Object.keys(t).sort((a, b) => t[b] - t[a]).slice(0, 10).map((c) => ({ label: c, value: Math.max(0, t[c]), color: "var(--seq-400)", tip: `<b>${c}</b><br>${sgd(t[c])} · ${n[c]} transactions` }));
  }, [sel]);
  const insights = useMemo(() => {
    const out = [];
    if (!sel.length) return out;
    const topC = byCat[0]; if (topC) out.push(`${topC.label.slice(3)} is the biggest bucket at ${(topC.value / total * 100).toFixed(0)}% of spend (${sgd(topC.value)}).`);
    const grab = sel.filter((x) => x.merchant === "Grab (Ride)");
    if (grab.length) out.push(`${grab.length} Grab rides — ${(grab.length / nMonths).toFixed(1)} a month, averaging ${sgd(grab.reduce((a, x) => a + x.amount, 0) / grab.length, 2)} a ride.`);
    out.push(`Average ${sgd(total / days, 2)} a day, ${sgd(total / nMonths)} a month; the median transaction is ${sgd(median, 2)}.`);
    if (biggestMonth) out.push(`${monthLabel(biggestMonth.key)} was the peak month at ${sgd(biggestMonth.total)} — ${(biggestMonth.total / (total / nMonths)).toFixed(1)}× the monthly average.`);
    if (abroad > 0) out.push(`${(abroad / total * 100).toFixed(0)}% of spend was outside Singapore${countries.length ? ` (top: ${countries.slice(0, 3).map((c) => c.label).join(", ")})` : ""}.`);
    const big = sel.filter((x) => x.amount >= 500).length; if (big) out.push(`${big} transactions of $500 or more account for ${(sel.filter((x) => x.amount >= 500).reduce((a, x) => a + x.amount, 0) / total * 100).toFixed(0)}% of the total.`);
    if (refunds < 0) out.push(`${sgd(-refunds)} came back as refunds or credits and is netted out of every figure here.`);
    return out;
  }, [sel, byCat, total, nMonths, days, median, biggestMonth, abroad, countries, refunds]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <RangePicker presets={presets} value={range.preset} onChange={onRange} from={range.from} to={range.to} bounds={bounds} />
        <span className="text-[13px] text-muted">{sel.length.toLocaleString()} transactions · {dayShortYr(range.from)} – {dayShortYr(range.to)}</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi i={0} k="Total spend" v={total} prefix="$" s="net of refunds" />
        <Kpi i={1} k="Per month" v={total / nMonths} prefix="$" s={`${nMonths} month${nMonths === 1 ? "" : "s"} with spend`} />
        <Kpi i={2} k="Per day" v={total / days} prefix="$" decimals={2} s={`${days} days`} />
        <Kpi i={3} k="Transactions" v={sel.length} s={`${(sel.length / nMonths).toFixed(0)} a month`} />
        <Kpi i={4} k="Median transaction" v={median} prefix="$" decimals={2} s={`mean ${sgd(sel.length ? total / sel.length : 0, 2)}`} />
        <Kpi i={5} k="Abroad" v={total ? abroad / total * 100 : 0} suffix="%" s={`${sgd(abroad)} outside SG`} />
      </div>

      <ChartCard title="Monthly spend by category" desc="Statement-independent — grouped by transaction date. Click a month to see its transactions." className="mb-4"
        legend={series.map((s) => <Swatch key={s.id} color={s.color} label={s.label} />)}>
        <StackedColumns data={monthly} series={series} onPick={(k) => goToTx({ month: k })} />
      </ChartCard>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Where it goes" desc="Spend by category in the selected range.">
          <HBars data={byCat} labelWidth={150} />
        </ChartCard>
        <ChartCard title="Top merchants" desc="Coloured by category.">
          <HBars data={byMerchant} labelWidth={150} />
        </ChartCard>
        <ChartCard title="Most frequent" desc="Merchants by number of visits.">
          <HBars data={byFreq} labelWidth={150} money={false} />
        </ChartCard>
        <ChartCard title="Home vs abroad" desc="Singapore-billed vs overseas merchants, by month."
          legend={[<Swatch key="h" color="var(--seq-400)" label="Singapore" />, <Swatch key="a" color="#eda100" label="Abroad" />]}>
          <StackedColumns data={homeAbroad} series={[{ id: "home", label: "Singapore", color: "var(--seq-400)" }, { id: "away", label: "Abroad", color: "#eda100" }]} width={520} height={220} />
        </ChartCard>
        <ChartCard title="Category × month" desc={`Last ${heatCols.length} months of the range, top ${heatRows.length} categories.`}>
          <Heatmap rows={heatRows} cols={heatCols} get={heatGet} labelWidth={118} />
        </ChartCard>
        <div className="grid gap-4">
          <ChartCard title="Weekday pattern" desc="Total spend by day of the week.">
            <Columns data={dow} height={190} />
          </ChartCard>
          {countries.length > 0 && (
            <ChartCard title="Countries" desc="Overseas spend by billing country.">
              <HBars data={countries} labelWidth={50} />
            </ChartCard>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, ease: EASE }} className={`${CARD} mt-4 p-6`}>
        <h3 className="mb-3 text-[14.5px] font-semibold tracking-tight">Insights <span className="ml-2 font-normal text-[12px] text-muted">· computed for the selected range</span></h3>
        <ul className="m-0 space-y-2.5 p-0">
          {insights.map((t, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }} className="flex gap-3 text-[14px] leading-relaxed text-ink2">
              <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${GRAD}`} /><span>{t}</span>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

/* ============================== transactions ============================== */
function TransactionsTab({ data, catOf, sel, filter, setFilter }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("date");
  const cats = data.categories.map((c) => c.id).filter((c) => sel.some((x) => x.category === c));
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = sel.filter((x) => (!filter.category || x.category === filter.category) && (!filter.month || x.date.slice(0, 7) === filter.month) &&
      (!needle || x.desc.toLowerCase().includes(needle) || x.merchant.toLowerCase().includes(needle) || x.category.toLowerCase().includes(needle)));
    r = [...r];
    if (sort === "amount") r.sort((a, b) => b.amount - a.amount); else r.sort((a, b) => b.date.localeCompare(a.date));
    return r;
  }, [sel, filter, q, sort]);
  const total = rows.reduce((a, x) => a + x.amount, 0);
  const groups = useMemo(() => {
    if (sort !== "date") return [{ key: "all", rows }];
    const g = {}; for (const r of rows) (g[r.date.slice(0, 7)] = g[r.date.slice(0, 7)] || []).push(r);
    return Object.keys(g).sort().reverse().map((k) => ({ key: k, rows: g[k] }));
  }, [rows, sort]);
  const input = "rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-[13.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or description…" className={`${input} min-w-[240px] flex-1`} />
        <select value={filter.category || ""} onChange={(e) => setFilter({ ...filter, category: e.target.value || null })} className={input}>
          <option value="">All categories</option>{cats.map((c) => <option key={c} value={c}>{catOf(c).emoji} {c}</option>)}
        </select>
        {filter.month && <button onClick={() => setFilter({ ...filter, month: null })} className={`${CARD} px-3 py-2 text-[13px] text-ink2`}>{monthLabel(filter.month)} ✕</button>}
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={input}><option value="date">Newest first</option><option value="amount">Largest first</option></select>
        <span className="ml-auto text-[13px] text-muted">{rows.length.toLocaleString()} rows · {sgd(total, 2)}</span>
      </div>
      {groups.map((g) => (
        <div key={g.key} className="mb-6">
          {g.key !== "all" && <div className="mb-2 flex items-baseline gap-2 px-1"><h3 className="text-[15px] font-semibold tracking-tight">{monthLabel(g.key)}</h3><span className="text-[12.5px] text-muted">{g.rows.length} · {sgd(g.rows.reduce((a, x) => a + x.amount, 0), 2)}</span></div>}
          <div className={`${CARD} overflow-hidden`}>
            {g.rows.map((x, i) => (
              <motion.div key={x.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 30) * 0.015 }}
                className="flex items-center gap-3 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 hover:bg-black/[0.025]">
                <span className="w-[54px] shrink-0 text-[12px] tabular-nums text-muted">{dayShort(x.date)}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: catOf(x.category).color }} title={x.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{x.merchant}{x.country !== "SG" && <span className="ml-1.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">{x.country}</span>}</span>
                  <span className="block truncate text-[11.5px] text-muted">{x.desc}{x.fx ? ` · ${x.fx.ccy} ${fmt(x.fx.amount, 2)}` : ""}</span>
                </span>
                <span className="hidden w-[130px] shrink-0 text-[12px] text-ink2 md:block">{x.category}</span>
                <span className={`w-[86px] shrink-0 text-right text-[13.5px] font-semibold tabular-nums ${x.amount < 0 ? "text-emerald-600" : ""}`}>{sgd(x.amount, 2)}</span>
              </motion.div>
            ))}
            {!g.rows.length && <div className="px-4 py-8 text-center text-[13px] text-muted">Nothing matches.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================== statements ============================== */
function StatementsTab({ data }) {
  const s = [...data.meta.statements].sort((a, b) => b.statement.localeCompare(a.statement));
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex gap-3 border-b border-black/[0.07] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted"><span className="w-[140px]">Statement</span><span className="flex-1">File</span><span className="w-[90px] text-right">Rows</span><span className="w-[110px] text-right">Net spend</span></div>
      {s.map((x) => (
        <div key={x.statement} className="flex gap-3 border-b border-black/[0.05] px-4 py-2.5 text-[13.5px] last:border-b-0"><span className="w-[140px] font-medium">{monthLabel(x.statement)}</span><span className="flex-1 text-muted">{x.file}</span><span className="w-[90px] text-right tabular-nums text-ink2">{x.count}</span><span className="w-[110px] text-right font-semibold tabular-nums">{sgd(x.spend, 2)}</span></div>
      ))}
    </div>
  );
}

/* ============================== shell ============================== */
const TABS = [
  { id: "analytics", label: "Analytics" },
  { id: "tx", label: "Transactions" },
  { id: "statements", label: "Statements" },
];
function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("analytics");
  const [tip, setTip] = useState(null);
  const [filter, setFilter] = useState({ category: null, month: null });
  useEffect(() => { document.getElementById("boot")?.remove(); }, []);
  const catOf = useCallback((id) => data?.categories.find((c) => c.id === id) || { id, emoji: "", color: OTHER_COLOR }, [data]);
  if (!data) return <TipCtx.Provider value={setTip}><LockScreen onUnlocked={setData} /></TipCtx.Provider>;
  return <TipCtx.Provider value={setTip}><Tooltip tip={tip} /><Shell data={data} catOf={catOf} tab={tab} setTab={setTab} filter={filter} setFilter={setFilter} /></TipCtx.Provider>;
}
function Shell({ data, catOf, tab, setTab, filter, setFilter }) {
  const all = data.transactions;
  const { bounds, presets, range, onChange } = useRange(all);
  const sel = useMemo(() => all.filter((x) => x.date >= range.from && x.date <= range.to), [all, range]);
  const r = data.meta.range;
  const sub = `${dayShortYr(r.start)} – ${dayShortYr(r.end)} · ${all.length.toLocaleString()} transactions · ${data.meta.statements.length} statements`;
  const goToTx = (f) => { setFilter({ ...filter, ...f }); setTab("tx"); };
  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-24">
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-center gap-3 pt-7 pb-2">
        <a href="../" className="almanac-crumb basis-full" title="Back to GG's Almanac"><span className="dot" />GG's Almanac</a>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${GRAD} text-[17px] shadow-md shadow-violet-500/25`}>💳</div>
        <h1 className="m-0 text-[21px] font-bold tracking-tight">Expense Analytics</h1>
        <span className="text-[13px] text-muted">{sub}</span>
        <div className="flex-1" />
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={() => location.reload()} className={`${CARD} px-3 py-1.5 text-[13px] text-ink2`} title="Lock">🔒 Lock</motion.button>
      </motion.header>
      <motion.nav initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="sticky top-0 z-20 -mx-5 mb-6 flex gap-1 border-b border-black/[0.07] px-5 pt-2 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--page) 82%, transparent)" }}>
        <LayoutGroup id="tabs">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`relative px-4 pb-3 pt-2 text-[14px] transition-colors ${tab === t.id ? "font-semibold text-ink" : "text-ink2 hover:text-ink"}`}>
              {t.label}{tab === t.id && <motion.span layoutId="tabline" transition={SPRING} className={`absolute inset-x-2 -bottom-px h-[2.5px] rounded-full ${GRAD}`} />}
            </button>
          ))}
        </LayoutGroup>
      </motion.nav>
      <motion.main key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
        {tab === "analytics" && <AnalyticsTab data={data} catOf={catOf} range={range} presets={presets} bounds={bounds} onRange={onChange} sel={sel} goToTx={goToTx} />}
        {tab === "tx" && <TransactionsTab data={data} catOf={catOf} sel={sel} filter={filter} setFilter={setFilter} />}
        {tab === "statements" && <StatementsTab data={data} />}
      </motion.main>
      <footer className="mt-14 border-t border-black/[0.07] pt-4 text-[12.5px] text-muted">
        Parsed from {data.meta.source} · every statement reconciles to its printed sub-total · amounts in {data.meta.currency}, net of refunds · encrypted at rest (AES-256-GCM); the passcode never leaves this browser.
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
