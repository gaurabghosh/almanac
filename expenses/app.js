import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useMemo, useRef, createContext, useContext, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence, animate, LayoutGroup } from "framer-motion";
/* ============================== crypto ============================== */
const b64ToBuf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function decryptPayload(payload, passphrase) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64ToBuf(payload.salt), iterations: payload.iterations, hash: "SHA-256" }, baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(payload.iv) }, key, b64ToBuf(payload.ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
}
async function unlock(passphrase) {
    const res = await fetch("data.enc.json", { cache: "no-store" });
    if (!res.ok)
        throw new Error("could not load data");
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
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
        out.push(+v.toFixed(6));
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
const TipCtx = createContext(() => { });
function Tooltip({ tip }) {
    return (_jsx(AnimatePresence, { children: tip && (_jsxs(motion.div, { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 }, transition: { duration: 0.12 }, style: { left: tip.x, top: tip.y }, className: "pointer-events-none fixed z-50 max-w-[320px] rounded-xl border border-black/10 bg-white/95 backdrop-blur-xl px-3 py-2 text-[12.5px] leading-snug text-ink shadow-xl", children: [tip.title && _jsx("div", { className: "mb-0.5 text-[11px] text-muted", children: tip.title }), _jsx("div", { dangerouslySetInnerHTML: { __html: tip.body } })] })) }));
}
function useSetTip() {
    const set = useContext(TipCtx);
    return useCallback((e, body, title) => {
        const pad = 16;
        let x = e.clientX + pad, y = e.clientY + pad;
        if (x > window.innerWidth - 340)
            x = e.clientX - 340;
        if (y > window.innerHeight - 130)
            y = e.clientY - 120;
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
    return _jsxs(_Fragment, { children: [prefix, fmt(n, decimals), suffix] });
}
function ChartCard({ title, desc, children, className = "", legend }) {
    return (_jsxs(motion.div, { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55, ease: EASE }, className: `${CARD} min-w-0 p-5 ${className}`, children: [_jsx("h3", { className: "text-[14.5px] font-semibold tracking-tight", children: title }), desc && _jsx("p", { className: "mt-0.5 mb-3 text-[12.5px] text-muted", children: desc }), children, legend && _jsx("div", { className: "mt-3 flex flex-wrap gap-x-4 gap-y-1.5", children: legend })] }));
}
const Swatch = ({ color, label }) => (_jsxs("span", { className: "flex items-center gap-1.5 text-[12px] text-ink2", children: [_jsx("span", { className: "h-2.5 w-2.5 rounded-[3px]", style: { background: color } }), label] }));
function Kpi({ k, v, s, i, decimals = 0, prefix = "", suffix = "", text }) {
    return (_jsxs(motion.div, { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: i * 0.06, ease: EASE }, whileHover: { y: -3 }, className: `${CARD} p-4 transition-shadow hover:shadow-[0_8px_34px_-14px_rgba(99,102,241,.35)]`, children: [_jsx("div", { className: "text-[12px] text-muted", children: k }), _jsx("div", { className: `mt-0.5 font-bold tracking-tight ${text ? "text-[18px] leading-tight pt-1" : "text-[27px]"}`, children: text ? text : _jsx(AnimatedNumber, { value: v, decimals: decimals, prefix: prefix, suffix: suffix }) }), _jsx("div", { className: "mt-0.5 text-[12px] text-ink2", children: s })] }));
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
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [niceTicks(0, max, 4).map((t) => {
                const y = m.t + ih - (t / max) * ih;
                return _jsxs("g", { children: [_jsx("line", { x1: m.l, x2: width - m.r, y1: y, y2: y, className: "gridline" }), _jsx("text", { x: m.l - 6, y: y + 3.5, textAnchor: "end", className: "axis-t", children: kfmt(t) })] }, t);
            }), data.map((d, i) => {
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
                return (_jsxs("g", { style: { cursor: onPick ? "pointer" : "default" }, onClick: () => onPick && onPick(d.key), children: [segs.map((x, j) => (_jsx(motion.path, { d: j === segs.length - 1 ? roundTop(cx - bw / 2, x.y, bw, Math.max(x.h - 1.5, 0.5), 5) : `M${cx - bw / 2},${x.y} h${bw} v${Math.max(x.h - 1.5, 0.5)} h${-bw} Z`, fill: x.s.color, initial: { opacity: 0, scaleY: 0 }, whileInView: { opacity: 1, scaleY: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx}px ${m.t + ih}px` }, transition: { duration: 0.6, delay: i * 0.04, ease: EASE }, onMouseMove: (e) => setTip(e, tipBody), onMouseLeave: () => clear(null) }, x.s.id))), _jsx(motion.text, { x: cx, y: top - 6, textAnchor: "middle", className: "lbl-strong", initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { delay: 0.35 + i * 0.04 }, children: kfmt(d.total) }), _jsx("text", { x: cx, y: height - 8, textAnchor: "middle", className: "axis-t", children: d.label })] }, d.key));
            }), _jsx("line", { x1: m.l, x2: width - m.r, y1: m.t + ih, y2: m.t + ih, className: "baseline-s" })] }));
}
function HBars({ data, labelWidth = 150, width = 520, money = true }) {
    const setTip = useSetTip();
    const clear = useContext(TipCtx);
    const rowH = 27, m = { t: 6, r: 56, b: 6, l: labelWidth };
    const height = m.t + m.b + rowH * data.length;
    const iw = width - m.l - m.r;
    const max = Math.max(...data.map((d) => d.value)) || 1;
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [data.map((d, i) => {
                const y = m.t + rowH * i + rowH / 2;
                const w = Math.max(3, (d.value / max) * iw);
                return (_jsxs("g", { children: [_jsx("text", { x: m.l - 8, y: y + 4, textAnchor: "end", className: "lbl", children: d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label }), _jsx(motion.path, { d: roundRight(m.l, y - 7.5, w, 15, 5), fill: d.color || "var(--seq-400)", initial: { opacity: 0, scaleX: 0 }, whileInView: { opacity: 1, scaleX: 1 }, viewport: { once: true }, style: { transformOrigin: `${m.l}px 0px` }, transition: { duration: 0.65, delay: i * 0.045, ease: EASE }, onMouseMove: (e) => setTip(e, d.tip), onMouseLeave: () => clear(null) }), _jsx(motion.text, { x: m.l + w + 7, y: y + 4, className: "lbl-strong", initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { delay: 0.4 + i * 0.045 }, children: money ? sgd(d.value) : d.value })] }, d.label));
            }), _jsx("line", { x1: m.l, x2: m.l, y1: m.t, y2: height - m.b, className: "baseline-s" })] }));
}
function Columns({ data, height = 210, width = 520 }) {
    const setTip = useSetTip();
    const clear = useContext(TipCtx);
    const m = { t: 22, r: 8, b: 26, l: 36 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const max = Math.max(...data.map((d) => d.value)) * 1.1 || 1;
    const bw = Math.min(44, (iw / data.length) * 0.6);
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [niceTicks(0, max, 4).map((t) => {
                const y = m.t + ih - (t / max) * ih;
                return _jsxs("g", { children: [_jsx("line", { x1: m.l, x2: width - m.r, y1: y, y2: y, className: "gridline" }), _jsx("text", { x: m.l - 6, y: y + 3.5, textAnchor: "end", className: "axis-t", children: kfmt(t) })] }, t);
            }), data.map((d, i) => {
                const cx = m.l + (iw / data.length) * (i + 0.5);
                const h = Math.max(2, (d.value / max) * ih);
                const y = m.t + ih - h;
                return (_jsxs("g", { children: [_jsx(motion.path, { d: roundTop(cx - bw / 2, y, bw, h, 5), fill: d.color || "var(--seq-400)", initial: { opacity: 0, scaleY: 0 }, whileInView: { opacity: 1, scaleY: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx}px ${m.t + ih}px` }, transition: { duration: 0.6, delay: i * 0.06, ease: EASE }, onMouseMove: (e) => setTip(e, d.tip), onMouseLeave: () => clear(null) }), _jsx(motion.text, { x: cx, y: y - 6, textAnchor: "middle", className: "lbl-strong", initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { delay: 0.35 + i * 0.06 }, children: d.text ?? kfmt(d.value) }), _jsx("text", { x: cx, y: height - 8, textAnchor: "middle", className: "axis-t", children: d.label })] }, d.label));
            }), _jsx("line", { x1: m.l, x2: width - m.r, y1: m.t + ih, y2: m.t + ih, className: "baseline-s" })] }));
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
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [cols.map((c, j) => _jsx("text", { x: m.l + j * (cw + gap) + cw / 2, y: 14, textAnchor: "middle", className: "axis-t", children: c.label }, c.id)), rows.map((r, i) => {
                const y = m.t + i * (cellH + gap);
                return (_jsxs("g", { children: [_jsx("text", { x: m.l - 8, y: y + cellH / 2 + 4, textAnchor: "end", className: "lbl", children: r.label }), cols.map((c, j) => {
                            const { value, tip } = get(r, c);
                            const x = m.l + j * (cw + gap);
                            const ratio = max ? value / max : 0;
                            const fill = value === 0 ? "color-mix(in srgb, var(--grid) 60%, transparent)" : steps[Math.min(5, Math.floor(ratio * 6))];
                            return (_jsxs("g", { children: [_jsx(motion.rect, { x: x, y: y, width: cw, height: cellH, rx: 7, fill: fill, initial: { opacity: 0, scale: 0.82 }, whileInView: { opacity: 1, scale: 1 }, viewport: { once: true }, style: { transformOrigin: `${x + cw / 2}px ${y + cellH / 2}px` }, transition: { duration: 0.4, delay: (i * cols.length + j) * 0.012, ease: EASE }, onMouseMove: (e) => setTip(e, tip), onMouseLeave: () => clear(null) }), value > 0 && cw > 30 && _jsx("text", { x: x + cw / 2, y: y + cellH / 2 + 4, textAnchor: "middle", className: "axis-t", style: ratio >= 0.55 ? { fill: "#fff" } : undefined, pointerEvents: "none", children: kfmt(value) })] }, c.id));
                        })] }, r.id));
            })] }));
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
        if (!pass.trim() || busy)
            return;
        setBusy(true);
        setErr("");
        try {
            onUnlocked(await unlock(pass.trim()));
        }
        catch {
            setErr("That passcode didn't work — try again.");
            setBusy(false);
            inputRef.current?.select();
        }
    };
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center p-5", children: _jsxs(motion.form, { onSubmit: submit, initial: { opacity: 0, y: 22, scale: 0.96, filter: "blur(6px)" }, animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }, transition: { duration: 0.65, ease: EASE }, className: `${CARD} w-full max-w-[380px] p-8 text-center`, children: [_jsx(motion.div, { initial: { scale: 0.5, rotate: -12, opacity: 0 }, animate: { scale: 1, rotate: 0, opacity: 1 }, transition: { ...SPRING, delay: 0.15 }, className: `mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${GRAD} text-[26px] shadow-lg shadow-violet-500/25`, children: "\uD83D\uDCB3" }), _jsx("h1", { className: "text-[20px] font-bold tracking-tight", children: "Expense Analytics" }), _jsx("p", { className: "mx-auto mt-1.5 mb-6 max-w-[260px] text-[13px] leading-relaxed text-muted", children: "GG's Almanac. Transactions are encrypted \u2014 enter the passcode to unlock." }), _jsx("input", { ref: inputRef, type: "password", value: pass, onChange: (e) => setPass(e.target.value), autoComplete: "current-password", placeholder: "Passcode", className: "w-full rounded-xl border border-black/10 bg-white/60 px-4 py-2.5 text-center tracking-[0.12em] text-ink outline-none transition placeholder:tracking-normal placeholder:text-muted focus:border-transparent focus:ring-2 focus:ring-violet-500/60" }), _jsx(motion.button, { type: "submit", disabled: busy, whileHover: { scale: busy ? 1 : 1.02 }, whileTap: { scale: busy ? 1 : 0.98 }, className: `mt-3 w-full rounded-xl ${GRAD} py-2.5 font-semibold text-white shadow-lg shadow-violet-500/25 transition disabled:opacity-70`, children: busy ? "Unlocking…" : "Unlock" }), _jsx("div", { className: "mt-3 min-h-[20px] text-[13px] text-rose-500", children: _jsx(AnimatePresence, { children: err && _jsx(motion.div, { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, children: err }) }) }), _jsxs("a", { href: "../", className: "almanac-crumb mt-5 justify-center", children: [_jsx("span", { className: "dot" }), "Back to GG's Almanac"] })] }) }));
}
/* ============================== range picker ============================== */
function RangePicker({ presets, value, onChange, from, to, bounds }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target))
            setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
    const active = presets.find((p) => p.id === value);
    const label = value === "custom" ? `${dayShort(from)} – ${dayShort(to)}` : active?.label || "All time";
    return (_jsxs("div", { className: "relative", ref: ref, children: [_jsxs(motion.button, { onClick: () => setOpen((o) => !o), whileTap: { scale: 0.98 }, className: `${CARD} flex min-w-[200px] items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-medium`, children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted", children: "\uD83D\uDDD3" }), label] }), _jsx(motion.span, { animate: { rotate: open ? 180 : 0 }, transition: { duration: 0.2 }, className: "text-muted", children: "\u25BE" })] }), _jsx(AnimatePresence, { children: open && (_jsxs(motion.div, { initial: { opacity: 0, y: -6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.97 }, transition: { duration: 0.16, ease: EASE }, className: `${CARD} absolute z-40 mt-2 w-[264px] overflow-hidden p-1.5`, children: [presets.map((p) => (_jsxs("button", { onClick: () => { onChange({ preset: p.id }); setOpen(false); }, className: `flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] transition hover:bg-black/[0.05] ${p.id === value ? "font-semibold" : "text-ink2"}`, children: [p.label, p.id === value && _jsx("span", { className: "text-[16px] font-bold text-violet-500", children: "\u2713" })] }, p.id))), _jsxs("div", { className: "mt-1.5 border-t border-black/[0.08] px-3 pb-1 pt-2.5", children: [_jsx("div", { className: "mb-1.5 text-[11.5px] text-muted", children: "Custom range" }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("input", { type: "date", value: from, min: bounds[0], max: to, onChange: (e) => onChange({ preset: "custom", from: e.target.value, to }), className: "w-full rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50" }), _jsx("span", { className: "text-muted", children: "\u2013" }), _jsx("input", { type: "date", value: to, min: from, max: bounds[1], onChange: (e) => onChange({ preset: "custom", from, to: e.target.value }), className: "w-full rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50" })] })] })] })) })] }));
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
        if (r.preset === "custom")
            setRange({ preset: "custom", from: r.from, to: r.to });
        else {
            const p = presets.find((x) => x.id === r.preset);
            setRange({ preset: p.id, from: p.from < bounds[0] ? bounds[0] : p.from, to: p.to || bounds[1] });
        }
    };
    return { bounds, presets, range, onChange };
}
function AnalyticsTab({ data, catOf, range, presets, bounds, onRange, sel, goToTx }) {
    const all = data.transactions;
    const monthsInRange = useMemo(() => {
        const out = [];
        const d = new Date(range.from.slice(0, 7) + "-01T00:00:00");
        while (d.toISOString().slice(0, 7) <= range.to.slice(0, 7)) {
            out.push(d.toISOString().slice(0, 7));
            d.setMonth(d.getMonth() + 1);
        }
        return out;
    }, [range]);
    // Category totals across the range → fixed series order (by all-time rank, so colours never repaint)
    const catRank = useMemo(() => {
        const t = {};
        for (const x of all)
            t[x.category] = (t[x.category] || 0) + x.amount;
        return Object.keys(t).sort((a, b) => t[b] - t[a]);
    }, [all]);
    const series = useMemo(() => {
        const top = catRank.slice(0, MAX_SERIES);
        return [...top.map((id) => ({ id, label: id, color: catOf(id).color })), { id: "__other", label: "Other categories", color: OTHER_COLOR }];
    }, [catRank, catOf]);
    const seriesOf = (c) => (series.find((s) => s.id === c) ? c : "__other");
    const monthly = useMemo(() => monthsInRange.map((k, i) => {
        const rows = sel.filter((x) => x.date.slice(0, 7) === k);
        const values = {};
        let total = 0;
        for (const r of rows) {
            const s = seriesOf(r.category);
            values[s] = (values[s] || 0) + r.amount;
            total += r.amount;
        }
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
        const t = {};
        const n = {};
        for (const x of sel) {
            t[x.category] = (t[x.category] || 0) + x.amount;
            n[x.category] = (n[x.category] || 0) + 1;
        }
        return Object.keys(t).sort((a, b) => t[b] - t[a]).map((c) => ({ label: `${catOf(c).emoji} ${c}`, value: Math.max(0, t[c]), color: catOf(c).color, tip: `<b>${c}</b><br>${sgd(t[c])} · ${n[c]} transactions · ${(t[c] / total * 100).toFixed(1)}% of spend<br>avg ${sgd(t[c] / n[c], 2)}` }));
    }, [sel, total, catOf]);
    const byMerchant = useMemo(() => {
        const t = {};
        const n = {};
        const c = {};
        for (const x of sel) {
            t[x.merchant] = (t[x.merchant] || 0) + x.amount;
            n[x.merchant] = (n[x.merchant] || 0) + 1;
            c[x.merchant] = x.category;
        }
        return Object.keys(t).sort((a, b) => t[b] - t[a]).slice(0, 12).map((m) => ({ label: m, value: Math.max(0, t[m]), color: catOf(c[m]).color, tip: `<b>${esc(m)}</b> · ${c[m]}<br>${sgd(t[m])} · ${n[m]} transactions · avg ${sgd(t[m] / n[m], 2)}` }));
    }, [sel, catOf]);
    const byFreq = useMemo(() => {
        const n = {};
        const t = {};
        const c = {};
        for (const x of sel) {
            n[x.merchant] = (n[x.merchant] || 0) + 1;
            t[x.merchant] = (t[x.merchant] || 0) + x.amount;
            c[x.merchant] = x.category;
        }
        return Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 10).map((m) => ({ label: m, value: n[m], color: catOf(c[m]).color, tip: `<b>${esc(m)}</b><br>${n[m]} visits · ${sgd(t[m])} total · ${(n[m] / nMonths).toFixed(1)} per month` }));
    }, [sel, nMonths, catOf]);
    const dow = useMemo(() => {
        const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const t = Array(7).fill(0), n = Array(7).fill(0);
        for (const x of sel) {
            const i = (new Date(x.date + "T00:00:00").getDay() + 6) % 7;
            t[i] += x.amount;
            n[i] += 1;
        }
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
        const t = {};
        const n = {};
        for (const x of sel)
            if (x.country !== "SG") {
                t[x.country] = (t[x.country] || 0) + x.amount;
                n[x.country] = (n[x.country] || 0) + 1;
            }
        return Object.keys(t).sort((a, b) => t[b] - t[a]).slice(0, 10).map((c) => ({ label: c, value: Math.max(0, t[c]), color: "var(--seq-400)", tip: `<b>${c}</b><br>${sgd(t[c])} · ${n[c]} transactions` }));
    }, [sel]);
    const insights = useMemo(() => {
        const out = [];
        if (!sel.length)
            return out;
        const topC = byCat[0];
        if (topC)
            out.push(`${topC.label.slice(3)} is the biggest bucket at ${(topC.value / total * 100).toFixed(0)}% of spend (${sgd(topC.value)}).`);
        const grab = sel.filter((x) => x.merchant === "Grab (Ride)");
        if (grab.length)
            out.push(`${grab.length} Grab rides — ${(grab.length / nMonths).toFixed(1)} a month, averaging ${sgd(grab.reduce((a, x) => a + x.amount, 0) / grab.length, 2)} a ride.`);
        out.push(`Average ${sgd(total / days, 2)} a day, ${sgd(total / nMonths)} a month; the median transaction is ${sgd(median, 2)}.`);
        if (biggestMonth)
            out.push(`${monthLabel(biggestMonth.key)} was the peak month at ${sgd(biggestMonth.total)} — ${(biggestMonth.total / (total / nMonths)).toFixed(1)}× the monthly average.`);
        if (abroad > 0)
            out.push(`${(abroad / total * 100).toFixed(0)}% of spend was outside Singapore${countries.length ? ` (top: ${countries.slice(0, 3).map((c) => c.label).join(", ")})` : ""}.`);
        const big = sel.filter((x) => x.amount >= 500).length;
        if (big)
            out.push(`${big} transactions of $500 or more account for ${(sel.filter((x) => x.amount >= 500).reduce((a, x) => a + x.amount, 0) / total * 100).toFixed(0)}% of the total.`);
        if (refunds < 0)
            out.push(`${sgd(-refunds)} came back as refunds or credits and is netted out of every figure here.`);
        return out;
    }, [sel, byCat, total, nMonths, days, median, biggestMonth, abroad, countries, refunds]);
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-5 flex flex-wrap items-center gap-3", children: [_jsx(RangePicker, { presets: presets, value: range.preset, onChange: onRange, from: range.from, to: range.to, bounds: bounds }), _jsxs("span", { className: "text-[13px] text-muted", children: [sel.length.toLocaleString(), " transactions \u00B7 ", dayShortYr(range.from), " \u2013 ", dayShortYr(range.to)] })] }), _jsxs("div", { className: "mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", children: [_jsx(Kpi, { i: 0, k: "Total spend", v: total, prefix: "$", s: "net of refunds" }), _jsx(Kpi, { i: 1, k: "Per month", v: total / nMonths, prefix: "$", s: `${nMonths} month${nMonths === 1 ? "" : "s"} with spend` }), _jsx(Kpi, { i: 2, k: "Per day", v: total / days, prefix: "$", decimals: 2, s: `${days} days` }), _jsx(Kpi, { i: 3, k: "Transactions", v: sel.length, s: `${(sel.length / nMonths).toFixed(0)} a month` }), _jsx(Kpi, { i: 4, k: "Median transaction", v: median, prefix: "$", decimals: 2, s: `mean ${sgd(sel.length ? total / sel.length : 0, 2)}` }), _jsx(Kpi, { i: 5, k: "Abroad", v: total ? abroad / total * 100 : 0, suffix: "%", s: `${sgd(abroad)} outside SG` })] }), _jsx(ChartCard, { title: "Monthly spend by category", desc: "Statement-independent \u2014 grouped by transaction date. Click a month to see its transactions.", className: "mb-4", legend: series.map((s) => _jsx(Swatch, { color: s.color, label: s.label }, s.id)), children: _jsx(StackedColumns, { data: monthly, series: series, onPick: (k) => goToTx({ month: k }) }) }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsx(ChartCard, { title: "Where it goes", desc: "Spend by category in the selected range.", children: _jsx(HBars, { data: byCat, labelWidth: 150 }) }), _jsx(ChartCard, { title: "Top merchants", desc: "Coloured by category.", children: _jsx(HBars, { data: byMerchant, labelWidth: 150 }) }), _jsx(ChartCard, { title: "Most frequent", desc: "Merchants by number of visits.", children: _jsx(HBars, { data: byFreq, labelWidth: 150, money: false }) }), _jsx(ChartCard, { title: "Home vs abroad", desc: "Singapore-billed vs overseas merchants, by month.", legend: [_jsx(Swatch, { color: "var(--seq-400)", label: "Singapore" }, "h"), _jsx(Swatch, { color: "#eda100", label: "Abroad" }, "a")], children: _jsx(StackedColumns, { data: homeAbroad, series: [{ id: "home", label: "Singapore", color: "var(--seq-400)" }, { id: "away", label: "Abroad", color: "#eda100" }], width: 520, height: 220 }) }), _jsx(ChartCard, { title: "Category \u00D7 month", desc: `Last ${heatCols.length} months of the range, top ${heatRows.length} categories.`, children: _jsx(Heatmap, { rows: heatRows, cols: heatCols, get: heatGet, labelWidth: 118 }) }), _jsxs("div", { className: "grid gap-4", children: [_jsx(ChartCard, { title: "Weekday pattern", desc: "Total spend by day of the week.", children: _jsx(Columns, { data: dow, height: 190 }) }), countries.length > 0 && (_jsx(ChartCard, { title: "Countries", desc: "Overseas spend by billing country.", children: _jsx(HBars, { data: countries, labelWidth: 50 }) }))] })] }), _jsxs(motion.div, { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5, ease: EASE }, className: `${CARD} mt-4 p-6`, children: [_jsxs("h3", { className: "mb-3 text-[14.5px] font-semibold tracking-tight", children: ["Insights ", _jsx("span", { className: "ml-2 font-normal text-[12px] text-muted", children: "\u00B7 computed for the selected range" })] }), _jsx("ul", { className: "m-0 space-y-2.5 p-0", children: insights.map((t, i) => (_jsxs(motion.li, { initial: { opacity: 0, x: -6 }, whileInView: { opacity: 1, x: 0 }, viewport: { once: true }, transition: { duration: 0.4, delay: i * 0.06 }, className: "flex gap-3 text-[14px] leading-relaxed text-ink2", children: [_jsx("span", { className: `mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${GRAD}` }), _jsx("span", { children: t })] }, i))) })] })] }));
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
        if (sort === "amount")
            r.sort((a, b) => b.amount - a.amount);
        else
            r.sort((a, b) => b.date.localeCompare(a.date));
        return r;
    }, [sel, filter, q, sort]);
    const total = rows.reduce((a, x) => a + x.amount, 0);
    const groups = useMemo(() => {
        if (sort !== "date")
            return [{ key: "all", rows }];
        const g = {};
        for (const r of rows)
            (g[r.date.slice(0, 7)] = g[r.date.slice(0, 7)] || []).push(r);
        return Object.keys(g).sort().reverse().map((k) => ({ key: k, rows: g[k] }));
    }, [rows, sort]);
    const input = "rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-[13.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50";
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search merchant or description\u2026", className: `${input} min-w-[240px] flex-1` }), _jsxs("select", { value: filter.category || "", onChange: (e) => setFilter({ ...filter, category: e.target.value || null }), className: input, children: [_jsx("option", { value: "", children: "All categories" }), cats.map((c) => _jsxs("option", { value: c, children: [catOf(c).emoji, " ", c] }, c))] }), filter.month && _jsxs("button", { onClick: () => setFilter({ ...filter, month: null }), className: `${CARD} px-3 py-2 text-[13px] text-ink2`, children: [monthLabel(filter.month), " \u2715"] }), _jsxs("select", { value: sort, onChange: (e) => setSort(e.target.value), className: input, children: [_jsx("option", { value: "date", children: "Newest first" }), _jsx("option", { value: "amount", children: "Largest first" })] }), _jsxs("span", { className: "ml-auto text-[13px] text-muted", children: [rows.length.toLocaleString(), " rows \u00B7 ", sgd(total, 2)] })] }), groups.map((g) => (_jsxs("div", { className: "mb-6", children: [g.key !== "all" && _jsxs("div", { className: "mb-2 flex items-baseline gap-2 px-1", children: [_jsx("h3", { className: "text-[15px] font-semibold tracking-tight", children: monthLabel(g.key) }), _jsxs("span", { className: "text-[12.5px] text-muted", children: [g.rows.length, " \u00B7 ", sgd(g.rows.reduce((a, x) => a + x.amount, 0), 2)] })] }), _jsxs("div", { className: `${CARD} overflow-hidden`, children: [g.rows.map((x, i) => (_jsxs(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: Math.min(i, 30) * 0.015 }, className: "flex items-center gap-3 border-b border-black/[0.05] px-4 py-2.5 last:border-b-0 hover:bg-black/[0.025]", children: [_jsx("span", { className: "w-[54px] shrink-0 text-[12px] tabular-nums text-muted", children: dayShort(x.date) }), _jsx("span", { className: "h-2.5 w-2.5 shrink-0 rounded-[3px]", style: { background: catOf(x.category).color }, title: x.category }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "block truncate text-[13.5px] font-medium", children: [x.merchant, x.country !== "SG" && _jsx("span", { className: "ml-1.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700", children: x.country })] }), _jsxs("span", { className: "block truncate text-[11.5px] text-muted", children: [x.desc, x.fx ? ` · ${x.fx.ccy} ${fmt(x.fx.amount, 2)}` : ""] })] }), _jsx("span", { className: "hidden w-[130px] shrink-0 text-[12px] text-ink2 md:block", children: x.category }), _jsx("span", { className: `w-[86px] shrink-0 text-right text-[13.5px] font-semibold tabular-nums ${x.amount < 0 ? "text-emerald-600" : ""}`, children: sgd(x.amount, 2) })] }, x.id))), !g.rows.length && _jsx("div", { className: "px-4 py-8 text-center text-[13px] text-muted", children: "Nothing matches." })] })] }, g.key)))] }));
}
/* ============================== statements ============================== */
function StatementsTab({ data }) {
    const s = [...data.meta.statements].sort((a, b) => b.statement.localeCompare(a.statement));
    return (_jsxs("div", { className: `${CARD} overflow-hidden`, children: [_jsxs("div", { className: "flex gap-3 border-b border-black/[0.07] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted", children: [_jsx("span", { className: "w-[140px]", children: "Statement" }), _jsx("span", { className: "flex-1", children: "File" }), _jsx("span", { className: "w-[90px] text-right", children: "Rows" }), _jsx("span", { className: "w-[110px] text-right", children: "Net spend" })] }), s.map((x) => (_jsxs("div", { className: "flex gap-3 border-b border-black/[0.05] px-4 py-2.5 text-[13.5px] last:border-b-0", children: [_jsx("span", { className: "w-[140px] font-medium", children: monthLabel(x.statement) }), _jsx("span", { className: "flex-1 text-muted", children: x.file }), _jsx("span", { className: "w-[90px] text-right tabular-nums text-ink2", children: x.count }), _jsx("span", { className: "w-[110px] text-right font-semibold tabular-nums", children: sgd(x.spend, 2) })] }, x.statement)))] }));
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
    if (!data)
        return _jsx(TipCtx.Provider, { value: setTip, children: _jsx(LockScreen, { onUnlocked: setData }) });
    return _jsxs(TipCtx.Provider, { value: setTip, children: [_jsx(Tooltip, { tip: tip }), _jsx(Shell, { data: data, catOf: catOf, tab: tab, setTab: setTab, filter: filter, setFilter: setFilter })] });
}
function Shell({ data, catOf, tab, setTab, filter, setFilter }) {
    const all = data.transactions;
    const { bounds, presets, range, onChange } = useRange(all);
    const sel = useMemo(() => all.filter((x) => x.date >= range.from && x.date <= range.to), [all, range]);
    const r = data.meta.range;
    const sub = `${dayShortYr(r.start)} – ${dayShortYr(r.end)} · ${all.length.toLocaleString()} transactions · ${data.meta.statements.length} statements`;
    const goToTx = (f) => { setFilter({ ...filter, ...f }); setTab("tx"); };
    return (_jsxs("div", { className: "mx-auto max-w-[1120px] px-5 pb-24", children: [_jsxs(motion.header, { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE }, className: "flex flex-wrap items-center gap-3 pt-7 pb-2", children: [_jsxs("a", { href: "../", className: "almanac-crumb basis-full", title: "Back to GG's Almanac", children: [_jsx("span", { className: "dot" }), "GG's Almanac"] }), _jsx("div", { className: `flex h-9 w-9 items-center justify-center rounded-xl ${GRAD} text-[17px] shadow-md shadow-violet-500/25`, children: "\uD83D\uDCB3" }), _jsx("h1", { className: "m-0 text-[21px] font-bold tracking-tight", children: "Expense Analytics" }), _jsx("span", { className: "text-[13px] text-muted", children: sub }), _jsx("div", { className: "flex-1" }), _jsx(motion.button, { whileHover: { scale: 1.04 }, whileTap: { scale: 0.96 }, onClick: () => location.reload(), className: `${CARD} px-3 py-1.5 text-[13px] text-ink2`, title: "Lock", children: "\uD83D\uDD12 Lock" })] }), _jsx(motion.nav, { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.1 }, className: "sticky top-0 z-20 -mx-5 mb-6 flex gap-1 border-b border-black/[0.07] px-5 pt-2 backdrop-blur-xl", style: { background: "color-mix(in srgb, var(--page) 82%, transparent)" }, children: _jsx(LayoutGroup, { id: "tabs", children: TABS.map((t) => (_jsxs("button", { onClick: () => setTab(t.id), className: `relative px-4 pb-3 pt-2 text-[14px] transition-colors ${tab === t.id ? "font-semibold text-ink" : "text-ink2 hover:text-ink"}`, children: [t.label, tab === t.id && _jsx(motion.span, { layoutId: "tabline", transition: SPRING, className: `absolute inset-x-2 -bottom-px h-[2.5px] rounded-full ${GRAD}` })] }, t.id))) }) }), _jsxs(motion.main, { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: EASE }, children: [tab === "analytics" && _jsx(AnalyticsTab, { data: data, catOf: catOf, range: range, presets: presets, bounds: bounds, onRange: onChange, sel: sel, goToTx: goToTx }), tab === "tx" && _jsx(TransactionsTab, { data: data, catOf: catOf, sel: sel, filter: filter, setFilter: setFilter }), tab === "statements" && _jsx(StatementsTab, { data: data })] }, tab), _jsxs("footer", { className: "mt-14 border-t border-black/[0.07] pt-4 text-[12.5px] text-muted", children: ["Parsed from ", data.meta.source, " \u00B7 every statement reconciles to its printed sub-total \u00B7 amounts in ", data.meta.currency, ", net of refunds \u00B7 encrypted at rest (AES-256-GCM); the passcode never leaves this browser."] })] }));
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
