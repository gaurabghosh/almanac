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
const dayParts = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return {
        day: d.toLocaleDateString("en-SG", { day: "2-digit", month: "short" }),
        dow: d.toLocaleDateString("en-SG", { weekday: "short" }),
        full: d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" }),
    };
};
const sentColor = (s) => (s >= 0.15 ? "var(--pos)" : s <= -0.15 ? "var(--neg)" : "var(--neu)");
const sentWord = (s) => (s >= 0.15 ? "positive" : s <= -0.15 ? "negative" : "neutral");
const signed = (n, d = 1) => (n >= 0 ? "+" : "") + n.toFixed(d);
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
const roundLeft = (x, y, w, h, r) => {
    r = Math.min(r, h / 2, Math.max(w, 0.01));
    return `M${x + w},${y} L${x + r},${y} Q${x},${y} ${x},${y + r} L${x},${y + h - r} Q${x},${y + h} ${x + r},${y + h} L${x + w},${y + h} Z`;
};
/* ============================== shared UI ============================== */
const CARD = "rounded-2xl border border-black/[0.06] bg-white/70 " +
    "backdrop-blur-xl shadow-[0_1px_2px_rgba(16,16,20,.04),0_10px_34px_-12px_rgba(16,16,20,.14)]";
const GRAD = "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500";
const TipCtx = createContext(() => { });
function Tooltip({ tip }) {
    return (_jsx(AnimatePresence, { children: tip && (_jsxs(motion.div, { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 }, transition: { duration: 0.12 }, style: { left: tip.x, top: tip.y }, className: "pointer-events-none fixed z-50 max-w-[320px] rounded-xl border border-black/10\n                     bg-white/95 backdrop-blur-xl px-3 py-2 text-[12.5px] leading-snug\n                     text-ink shadow-xl", children: [tip.title && _jsx("div", { className: "mb-0.5 text-[11px] text-muted", children: tip.title }), _jsx("div", { dangerouslySetInnerHTML: { __html: tip.body } })] })) }));
}
function useTip() {
    const set = useContext(TipCtx);
    return useCallback((body, title) => ({
        onMouseMove: (e) => {
            const pad = 16;
            let x = e.clientX + pad, y = e.clientY + pad;
            if (x > window.innerWidth - 340)
                x = e.clientX - 340;
            if (y > window.innerHeight - 130)
                y = e.clientY - 120;
            set({ x, y, body, title });
        },
        onMouseLeave: () => set(null),
    }), [set, body, title]);
}
function AnimatedNumber({ value, decimals = 0, sign = false, suffix = "", duration = 1.1 }) {
    const [n, setN] = useState(0);
    const shown = useRef(0); // animate from what's on screen, not from 0, when the range changes
    useEffect(() => {
        const c = animate(shown.current, value, {
            duration, ease: EASE,
            onUpdate: (v) => { shown.current = v; setN(v); },
        });
        return () => c.stop();
    }, [value, duration]);
    const s = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString();
    return _jsxs(_Fragment, { children: [sign && value >= 0 ? "+" : "", s, suffix] });
}
function Card({ className = "", children, ...rest }) {
    return _jsx("div", { className: `${CARD} ${className}`, ...rest, children: children });
}
function ChartCard({ title, desc, children, className = "", legend }) {
    return (_jsxs(motion.div, { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55, ease: EASE }, className: `${CARD} min-w-0 p-5 ${className}`, children: [_jsx("h3", { className: "text-[14.5px] font-semibold tracking-tight", children: title }), desc && _jsx("p", { className: "mt-0.5 mb-3 text-[12.5px] text-muted", children: desc }), children, legend && _jsx("div", { className: "mt-3 flex flex-wrap gap-x-4 gap-y-1.5", children: legend })] }));
}
const Swatch = ({ color, label }) => (_jsxs("span", { className: "flex items-center gap-1.5 text-[12px] text-ink2", children: [_jsx("span", { className: "h-2.5 w-2.5 rounded-[3px]", style: { background: color } }), label] }));
/* ============================== charts ============================== */
function Columns({ data, height = 210, width = 520 }) {
    const tip = useTip;
    const m = { t: 22, r: 8, b: 26, l: 32 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const max = Math.max(...data.map((d) => d.value)) * 1.1 || 1;
    const bw = Math.min(44, (iw / data.length) * 0.6);
    const setTip = useContext(TipCtx);
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [niceTicks(0, max, 4).map((t) => {
                const y = m.t + ih - (t / max) * ih;
                return (_jsxs("g", { children: [_jsx("line", { x1: m.l, x2: width - m.r, y1: y, y2: y, className: "gridline" }), _jsx("text", { x: m.l - 6, y: y + 3.5, textAnchor: "end", className: "axis-t", children: t })] }, t));
            }), data.map((d, i) => {
                const cx = m.l + (iw / data.length) * (i + 0.5);
                const h = Math.max(2, (d.value / max) * ih);
                const y = m.t + ih - h;
                return (_jsxs("g", { children: [_jsx(motion.path, { d: roundTop(cx - bw / 2, y, bw, h, 5), fill: d.color || "var(--seq-400)", initial: { opacity: 0, scaleY: 0 }, whileInView: { opacity: 1, scaleY: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx}px ${m.t + ih}px` }, transition: { duration: 0.6, delay: i * 0.06, ease: EASE }, onMouseMove: (e) => setTip({ x: e.clientX + 16, y: e.clientY + 16, body: d.tip }), onMouseLeave: () => setTip(null) }), _jsx(motion.text, { x: cx, y: y - 6, textAnchor: "middle", className: "lbl-strong", initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { delay: 0.35 + i * 0.06 }, children: d.value }), _jsx("text", { x: cx, y: height - 8, textAnchor: "middle", className: "axis-t", children: d.label })] }, d.label));
            }), _jsx("line", { x1: m.l, x2: width - m.r, y1: m.t + ih, y2: m.t + ih, className: "baseline-s" })] }));
}
function HBars({ data, labelWidth = 150, width = 520 }) {
    const setTip = useContext(TipCtx);
    const rowH = 27, m = { t: 6, r: 44, b: 6, l: labelWidth };
    const height = m.t + m.b + rowH * data.length;
    const iw = width - m.l - m.r;
    const max = Math.max(...data.map((d) => d.value)) || 1;
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [data.map((d, i) => {
                const y = m.t + rowH * i + rowH / 2;
                const w = Math.max(3, (d.value / max) * iw);
                return (_jsxs("g", { children: [_jsx("text", { x: m.l - 8, y: y + 4, textAnchor: "end", className: "lbl", children: d.label }), _jsx(motion.path, { d: roundRight(m.l, y - 7.5, w, 15, 5), fill: d.color || "var(--seq-400)", initial: { opacity: 0, scaleX: 0 }, whileInView: { opacity: 1, scaleX: 1 }, viewport: { once: true }, style: { transformOrigin: `${m.l}px 0px` }, transition: { duration: 0.65, delay: i * 0.045, ease: EASE }, onMouseMove: (e) => setTip({ x: e.clientX + 16, y: e.clientY + 16, body: d.tip }), onMouseLeave: () => setTip(null) }), _jsx(motion.text, { x: m.l + w + 7, y: y + 4, className: "lbl-strong", initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { delay: 0.4 + i * 0.045 }, children: d.value })] }, d.label));
            }), _jsx("line", { x1: m.l, x2: m.l, y1: m.t, y2: height - m.b, className: "baseline-s" })] }));
}
function SentimentLine({ points, width = 980, height = 250 }) {
    const setTip = useContext(TipCtx);
    const [focus, setFocus] = useState(null);
    const svgRef = useRef(null);
    const m = { t: 16, r: 16, b: 26, l: 36 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const xs = points.map((p) => +p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
    const Y = (v) => m.t + ih - ((v + 1) / 2) * ih;
    const avg = useMemo(() => points.map((p) => {
        const win = points.filter((q) => Math.abs(+q.x - +p.x) <= 3.5 * 864e5);
        return { x: p.x, y: win.reduce((a, q) => a + q.y, 0) / win.length };
    }), [points]);
    const path = avg.map((p, i) => `${i ? "L" : "M"}${X(+p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    const area = `${path} L${X(x1)},${Y(-1)} L${X(x0)},${Y(-1)} Z`;
    const months = [];
    const d = new Date(x0);
    d.setDate(1);
    for (; +d <= x1; d.setMonth(d.getMonth() + 1))
        if (+d >= x0)
            months.push(new Date(d));
    const onMove = (e) => {
        const r = svgRef.current.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * width;
        let best = points[0], bd = Infinity;
        for (const p of points) {
            const dd = Math.abs(X(+p.x) - px);
            if (dd < bd) {
                bd = dd;
                best = p;
            }
        }
        setFocus(best);
        setTip({
            x: e.clientX + 16, y: e.clientY + 16,
            title: `${best.full} · ${sentWord(best.y)} ${signed(best.y)}`,
            body: best.themes ? `${best.story}<div style="margin-top:5px;color:var(--muted)">${best.themes}</div>` : best.story,
        });
    };
    return (_jsxs("svg", { ref: svgRef, viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "areaFade", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "var(--accent)", stopOpacity: "0.20" }), _jsx("stop", { offset: "100%", stopColor: "var(--accent)", stopOpacity: "0" })] }) }), [-1, -0.5, 0, 0.5, 1].map((t) => (_jsxs("g", { children: [_jsx("line", { x1: m.l, x2: width - m.r, y1: Y(t), y2: Y(t), className: t === 0 ? "baseline-s" : "gridline" }), _jsx("text", { x: m.l - 6, y: Y(t) + 3.5, textAnchor: "end", className: "axis-t", children: t })] }, t))), months.map((md) => (_jsx("text", { x: X(+md), y: height - 8, className: "axis-t", children: md.toLocaleDateString("en-SG", { month: "short" }) }, +md))), _jsx(motion.path, { d: area, fill: "url(#areaFade)", initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { duration: 0.9, delay: 0.5 } }), _jsx(motion.path, { d: path, fill: "none", stroke: "var(--accent)", strokeWidth: "2.25", strokeLinecap: "round", strokeLinejoin: "round", initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: 1.5, ease: EASE } }), points.map((p, i) => (_jsx(motion.circle, { cx: X(+p.x), cy: Y(p.y), r: 3.2, fill: sentColor(p.y), stroke: "var(--surface-1)", strokeWidth: "1.5", initial: { opacity: 0, scale: 0 }, whileInView: { opacity: 1, scale: 1 }, viewport: { once: true }, transition: { duration: 0.35, delay: 0.5 + i * 0.008 } }, +p.x))), focus && (_jsxs("g", { children: [_jsx("line", { x1: X(+focus.x), x2: X(+focus.x), y1: m.t, y2: m.t + ih, className: "gridline" }), _jsx("circle", { cx: X(+focus.x), cy: Y(focus.y), r: 6.5, fill: "none", stroke: "var(--accent)", strokeWidth: "2" })] })), _jsx("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", onMouseMove: onMove, onMouseLeave: () => { setFocus(null); setTip(null); } })] }));
}
function Diverging({ data, labelWidth = 66, width = 520 }) {
    const setTip = useContext(TipCtx);
    const rowH = 36, m = { t: 8, r: 16, b: 8, l: labelWidth };
    const height = m.t + m.b + rowH * data.length;
    const iw = width - m.l - m.r;
    const maxSide = Math.max(...data.map((d) => Math.max(d.neg + d.neu / 2, d.pos + d.neu / 2))) * 1.06 || 1;
    const cx = m.l + iw / 2;
    const k = iw / 2 / maxSide;
    const gap = 2;
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [_jsx("line", { x1: cx, x2: cx, y1: m.t, y2: height - m.b, className: "baseline-s" }), data.map((d, i) => {
                const y = m.t + rowH * i + 7, h = rowH - 14;
                const hn = (d.neu / 2) * k;
                const T = (body) => ({
                    onMouseMove: (e) => setTip({ x: e.clientX + 16, y: e.clientY + 16, body }),
                    onMouseLeave: () => setTip(null),
                });
                return (_jsxs("g", { children: [_jsx("text", { x: m.l - 8, y: y + h / 2 + 4, textAnchor: "end", className: "lbl", children: d.label }), d.neu > 0 && (_jsx(motion.rect, { x: cx - hn, y: y, width: hn * 2, height: h, rx: 3, fill: "var(--neu)", initial: { opacity: 0, scaleX: 0 }, whileInView: { opacity: 1, scaleX: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx}px 0px` }, transition: { duration: 0.55, delay: i * 0.07, ease: EASE }, ...T(`<b>${d.label}</b>: ${d.neu} neutral day${d.neu === 1 ? "" : "s"}`) })), d.neg > 0 && (_jsx(motion.path, { d: roundLeft(cx - hn - gap - d.neg * k, y, d.neg * k, h, 5), fill: "var(--neg)", initial: { opacity: 0, scaleX: 0 }, whileInView: { opacity: 1, scaleX: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx - hn}px 0px` }, transition: { duration: 0.55, delay: 0.08 + i * 0.07, ease: EASE }, ...T(`<b>${d.label}</b>: ${d.neg} negative day${d.neg === 1 ? "" : "s"}`) })), d.pos > 0 && (_jsx(motion.path, { d: roundRight(cx + hn + gap, y, d.pos * k, h, 5), fill: "var(--pos)", initial: { opacity: 0, scaleX: 0 }, whileInView: { opacity: 1, scaleX: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx + hn}px 0px` }, transition: { duration: 0.55, delay: 0.08 + i * 0.07, ease: EASE }, ...T(`<b>${d.label}</b>: ${d.pos} positive day${d.pos === 1 ? "" : "s"}`) })), d.neg > 0 && (_jsx("text", { x: cx - hn - gap - d.neg * k - 6, y: y + h / 2 + 4, textAnchor: "end", className: "lbl-strong", children: d.neg })), d.pos > 0 && (_jsx("text", { x: cx + hn + gap + d.pos * k + 6, y: y + h / 2 + 4, className: "lbl-strong", children: d.pos }))] }, d.label));
            })] }));
}
function Heatmap({ rows, cols, get, labelWidth = 150, width = 520 }) {
    const setTip = useContext(TipCtx);
    const m = { t: 24, r: 8, b: 8, l: labelWidth };
    const cellH = 27, gap = 4;
    const height = m.t + m.b + rows.length * (cellH + gap);
    const cw = (width - m.l - m.r - (cols.length - 1) * gap) / cols.length;
    let max = 0;
    rows.forEach((r) => cols.forEach((c) => (max = Math.max(max, get(r, c).value))));
    const steps = ["var(--seq-100)", "var(--seq-200)", "var(--seq-300)", "var(--seq-400)", "var(--seq-550)", "var(--seq-700)"];
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [cols.map((c, j) => (_jsx("text", { x: m.l + j * (cw + gap) + cw / 2, y: 14, textAnchor: "middle", className: "axis-t", children: c.label }, c.id))), rows.map((r, i) => {
                const y = m.t + i * (cellH + gap);
                return (_jsxs("g", { children: [_jsx("text", { x: m.l - 8, y: y + cellH / 2 + 4, textAnchor: "end", className: "lbl", children: r.label }), cols.map((c, j) => {
                            const { value, tip } = get(r, c);
                            const x = m.l + j * (cw + gap);
                            const ratio = max ? value / max : 0;
                            const fill = value === 0 ? "color-mix(in srgb, var(--grid) 60%, transparent)" : steps[Math.min(5, Math.floor(ratio * 6))];
                            return (_jsxs("g", { children: [_jsx(motion.rect, { x: x, y: y, width: cw, height: cellH, rx: 7, fill: fill, initial: { opacity: 0, scale: 0.82 }, whileInView: { opacity: 1, scale: 1 }, viewport: { once: true }, style: { transformOrigin: `${x + cw / 2}px ${y + cellH / 2}px` }, transition: { duration: 0.4, delay: (i * cols.length + j) * 0.018, ease: EASE }, onMouseMove: (e) => setTip({ x: e.clientX + 16, y: e.clientY + 16, body: tip }), onMouseLeave: () => setTip(null) }), value > 0 && (_jsx("text", { x: x + cw / 2, y: y + cellH / 2 + 4, textAnchor: "middle", className: "axis-t", style: ratio >= 0.55 ? { fill: "#fff" } : undefined, pointerEvents: "none", children: value }))] }, c.id));
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
            const data = await unlock(pass.trim());
            // The passcode is deliberately NOT persisted: every page load re-prompts.
            onUnlocked(data);
        }
        catch {
            setErr("That passcode didn't work — try again.");
            setBusy(false);
            inputRef.current?.select();
        }
    };
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center p-5", children: _jsxs(motion.form, { onSubmit: submit, initial: { opacity: 0, y: 22, scale: 0.96, filter: "blur(6px)" }, animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }, transition: { duration: 0.65, ease: EASE }, className: `${CARD} w-full max-w-[380px] p-8 text-center`, children: [_jsx(motion.div, { initial: { scale: 0.5, rotate: -12, opacity: 0 }, animate: { scale: 1, rotate: 0, opacity: 1 }, transition: { ...SPRING, delay: 0.15 }, className: `mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${GRAD} text-[26px] shadow-lg shadow-violet-500/25`, children: "\u270D\uFE0F" }), _jsx("h1", { className: "text-[20px] font-bold tracking-tight", children: "Homework for Life" }), _jsx("p", { className: "mx-auto mt-1.5 mb-6 max-w-[260px] text-[13px] leading-relaxed text-muted", children: "Personal Journal \u00B7 GG's Almanac. This journal is encrypted \u2014 enter the passcode to unlock." }), _jsx("input", { ref: inputRef, type: "password", value: pass, onChange: (e) => setPass(e.target.value), autoComplete: "current-password", placeholder: "Passcode", className: "w-full rounded-xl border border-black/10 bg-white/60\n                     px-4 py-2.5 text-center tracking-[0.12em] text-ink outline-none transition\n                     placeholder:tracking-normal placeholder:text-muted\n                     focus:border-transparent focus:ring-2 focus:ring-violet-500/60" }), _jsx(motion.button, { type: "submit", disabled: busy, whileHover: { scale: busy ? 1 : 1.02 }, whileTap: { scale: busy ? 1 : 0.98 }, className: `mt-3 w-full rounded-xl ${GRAD} py-2.5 font-semibold text-white shadow-lg
                      shadow-violet-500/25 transition disabled:opacity-70`, children: busy ? "Unlocking…" : "Unlock" }), _jsx("div", { className: "mt-3 min-h-[20px] text-[13px] text-rose-500", children: _jsx(AnimatePresence, { children: err && (_jsx(motion.div, { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, children: err })) }) })] }) }));
}
/* ============================== raw data tab ============================== */
function EntryRow({ entry, themeOf, i }) {
    const { day, dow } = dayParts(entry.date);
    return (_jsxs(motion.article, { layout: true, initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay: Math.min(i * 0.018, 0.35), ease: EASE }, whileHover: { x: 3 }, className: "group grid grid-cols-[78px_1fr] gap-4 rounded-xl px-3 py-3 transition-colors\n                 hover:bg-white/70:bg-white/[0.045] max-sm:grid-cols-1 max-sm:gap-1", children: [_jsxs("div", { className: "pt-0.5 text-[12.5px] tabular-nums text-muted", children: [day, _jsx("span", { className: "block text-[11px] max-sm:inline max-sm:ml-1.5", children: dow })] }), _jsxs("div", { children: [_jsx("p", { className: "m-0 text-[14.5px] leading-relaxed", children: entry.story }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-1.5", children: [entry.themes.map((t) => {
                                const th = themeOf(t);
                                return (_jsxs("span", { className: "rounded-full bg-black/[0.045] px-2.5 py-0.5 text-[11.5px] text-ink2", children: [th.emoji, " ", th.label] }, t));
                            }), _jsx("span", { className: "ml-0.5 h-2 w-2 rounded-full", style: { background: sentColor(entry.sentiment) } }), _jsx("span", { className: "text-[11.5px] tabular-nums text-muted", children: signed(entry.sentiment) })] })] })] }));
}
function RawTab({ data, themeOf, months, monthKeys }) {
    const [q, setQ] = useState("");
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        const out = {};
        for (const ym of monthKeys) {
            const list = months[ym]
                .filter((e) => !s || e.story.toLowerCase().includes(s) || e.themes.some((t) => themeOf(t).label.toLowerCase().includes(s)))
                .sort((a, b) => b.date.localeCompare(a.date));
            if (list.length)
                out[ym] = list;
        }
        return out;
    }, [q, months, monthKeys, themeOf]);
    const shown = Object.values(filtered).reduce((a, l) => a + l.length, 0);
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-6 flex flex-wrap items-center gap-3", children: [_jsxs("div", { className: "relative flex-1 min-w-[240px]", children: [_jsx("span", { className: "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted", children: "\uD83D\uDD0D" }), _jsx("input", { type: "search", value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search stories or themes\u2026", className: `${CARD} w-full py-2.5 pl-10 pr-4 text-[14px] text-ink outline-none
                        transition placeholder:text-muted focus:ring-2 focus:ring-violet-500/50` })] }), _jsx("span", { className: "text-[12.5px] tabular-nums text-muted", children: q ? `${shown} matching` : `${data.entries.length} entries` })] }), _jsx(AnimatePresence, { mode: "popLayout", children: Object.keys(filtered).sort().reverse().map((ym) => {
                    const list = filtered[ym];
                    const avg = list.reduce((a, e) => a + e.sentiment, 0) / list.length;
                    return (_jsxs(motion.section, { layout: true, initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.4, ease: EASE }, className: "mb-9", children: [_jsxs("div", { className: "mb-2 flex flex-wrap items-baseline gap-3 border-b border-black/[0.07] pb-2", children: [_jsx("h2", { className: "text-[16px] font-semibold tracking-tight", children: monthLabel(ym) }), _jsxs("span", { className: "text-[12.5px] text-muted", children: [list.length, " ", list.length === 1 ? "entry" : "entries", " \u00B7 avg sentiment", " ", _jsx("span", { style: { color: sentColor(avg) }, className: "font-medium tabular-nums", children: signed(avg, 2) })] })] }), list.map((e, i) => _jsx(EntryRow, { entry: e, themeOf: themeOf, i: i }, e.date))] }, ym));
                }) }), shown === 0 && (_jsxs(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, className: "py-16 text-center text-muted", children: ["No entries match \u201C", q, "\u201D."] }))] }));
}
/* ============================== summary tab ============================== */
function MonthPicker({ value, options, labels, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target))
            setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
    return (_jsxs("div", { className: "relative", ref: ref, children: [_jsxs(motion.button, { onClick: () => setOpen((o) => !o), whileTap: { scale: 0.98 }, className: `${CARD} flex min-w-[190px] items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-medium`, children: [labels[value], _jsx(motion.span, { animate: { rotate: open ? 180 : 0 }, transition: { duration: 0.2 }, className: "text-muted", children: "\u25BE" })] }), _jsx(AnimatePresence, { children: open && (_jsx(motion.ul, { initial: { opacity: 0, y: -6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.97 }, transition: { duration: 0.16, ease: EASE }, className: `${CARD} absolute z-30 mt-2 w-full overflow-hidden p-1.5`, children: options.map((o) => (_jsx("li", { children: _jsxs("button", { onClick: () => { onChange(o); setOpen(false); }, className: `flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] transition
                              hover:bg-black/[0.05]:bg-white/[0.07] ${o === value ? "font-semibold" : "text-ink2"}`, children: [labels[o], o === value && _jsx("span", { className: "text-violet-500", children: "\u2713" })] }) }, o))) })) })] }));
}
function SummaryTab({ data, themeOf, months }) {
    const keys = useMemo(() => Object.keys(data.summaries).sort().reverse(), [data]);
    const [ym, setYm] = useState(keys[0]);
    const labels = useMemo(() => Object.fromEntries(keys.map((k) => [k, data.summaries[k].label])), [keys, data]);
    const s = data.summaries[ym];
    const count = (months[ym] || []).length;
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-6 flex flex-wrap items-center gap-3", children: [_jsx("span", { className: "text-[14px] text-ink2", children: "Month" }), _jsx(MonthPicker, { value: ym, options: keys, labels: labels, onChange: setYm })] }), _jsx(AnimatePresence, { mode: "wait", children: _jsxs(motion.div, { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.35, ease: EASE }, children: [_jsxs("div", { className: `${CARD} relative mb-6 overflow-hidden p-6 pl-7`, children: [_jsx("div", { className: `absolute inset-y-0 left-0 w-1 ${GRAD}` }), _jsx("p", { className: "m-0 text-[17px] font-medium leading-snug tracking-tight", children: s.headline }), _jsxs("p", { className: "mt-1.5 mb-0 text-[12.5px] text-muted", children: [count, " entries this month"] })] }), _jsx("div", { className: "grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4", children: s.sections.map((sec, i) => {
                                const th = themeOf(sec.theme);
                                return (_jsxs(motion.div, { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: 0.06 + i * 0.07, ease: EASE }, whileHover: { y: -3 }, className: `${CARD} p-5 transition-shadow hover:shadow-[0_8px_40px_-12px_rgba(99,102,241,.3)]`, children: [_jsxs("h3", { className: "mb-3 flex items-center gap-2 text-[14.5px] font-semibold tracking-tight", children: [_jsx("span", { className: "text-[17px]", children: th.emoji }), " ", th.label] }), _jsx("ul", { className: "m-0 space-y-2 p-0", children: sec.bullets.map((b, j) => (_jsxs(motion.li, { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.35, delay: 0.14 + i * 0.07 + j * 0.04 }, className: "flex gap-2.5 text-[14px] leading-relaxed text-ink2", children: [_jsx("span", { className: "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" }), _jsx("span", { children: b })] }, j))) })] }, sec.theme));
                            }) })] }, ym) })] }));
}
/* ---------- what was written about, over time (stacked weekly mix) ---------- */
const THEME_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const OTHER_COLOR = "#8a8880";
function ThemeStream({ buckets, series, width = 980, height = 260 }) {
    // buckets: [{ label, start, total, counts:{id:n} }]  series: [{id,label,color}]
    const setTip = useContext(TipCtx);
    const m = { t: 16, r: 10, b: 30, l: 34 };
    const iw = width - m.l - m.r, ih = height - m.t - m.b;
    const max = Math.max(...buckets.map((b) => b.total)) * 1.08 || 1;
    const bw = Math.min(56, (iw / buckets.length) * 0.74);
    const gap = 2;
    return (_jsxs("svg", { viewBox: `0 0 ${width} ${height}`, className: "block w-full h-auto overflow-visible", children: [niceTicks(0, max, 4).map((t) => {
                const y = m.t + ih - (t / max) * ih;
                return (_jsxs("g", { children: [_jsx("line", { x1: m.l, x2: width - m.r, y1: y, y2: y, className: "gridline" }), _jsx("text", { x: m.l - 6, y: y + 3.5, textAnchor: "end", className: "axis-t", children: t })] }, t));
            }), buckets.map((b, i) => {
                const cx = m.l + (iw / buckets.length) * (i + 0.5);
                let acc = 0;
                return (_jsxs("g", { children: [series.map((s, si) => {
                            const n = b.counts[s.id] || 0;
                            if (!n)
                                return null;
                            const h = (n / max) * ih - gap;
                            if (h <= 0.5)
                                return null;
                            const y = m.t + ih - ((acc + n) / max) * ih;
                            acc += n;
                            const isTop = acc === b.total;
                            return (_jsxs("g", { children: [_jsx(motion.path, { d: isTop ? roundTop(cx - bw / 2, y, bw, h, 5) : `M${cx - bw / 2},${y} h${bw} v${h} h${-bw} Z`, fill: s.color, initial: { opacity: 0, scaleY: 0 }, whileInView: { opacity: 1, scaleY: 1 }, viewport: { once: true }, style: { transformOrigin: `${cx}px ${m.t + ih}px` }, transition: { duration: 0.55, delay: i * 0.045 + si * 0.02, ease: EASE }, onMouseMove: (e) => setTip({
                                            x: e.clientX + 16, y: e.clientY + 16,
                                            title: `Week of ${b.label}`,
                                            body: `<b>${s.label}</b> — ${n} ${n === 1 ? "entry" : "entries"} of ${b.total}`,
                                        }), onMouseLeave: () => setTip(null) }), h >= 15 && (_jsx("text", { x: cx, y: y + h / 2 + 4, textAnchor: "middle", className: "axis-t", style: { fill: "#fff", fontWeight: 600 }, pointerEvents: "none", children: n }))] }, s.id));
                        }), (buckets.length <= 13 || i % 2 === 0) && (_jsx("text", { x: cx, y: height - 10, textAnchor: "middle", className: "axis-t", children: b.label }))] }, b.label));
            }), _jsx("line", { x1: m.l, x2: width - m.r, y1: m.t + ih, y2: m.t + ih, className: "baseline-s" })] }));
}
/* ---------- date range control ---------- */
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
    const label = value === "custom"
        ? `${new Date(from).toLocaleDateString("en-SG", { day: "numeric", month: "short" })} – ${new Date(to).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`
        : active?.label || "All time";
    return (_jsxs("div", { className: "relative", ref: ref, children: [_jsxs(motion.button, { onClick: () => setOpen((o) => !o), whileTap: { scale: 0.98 }, className: `${CARD} flex min-w-[200px] items-center justify-between gap-3 px-4 py-2.5 text-[14px] font-medium`, children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-muted", children: "\uD83D\uDDD3" }), label] }), _jsx(motion.span, { animate: { rotate: open ? 180 : 0 }, transition: { duration: 0.2 }, className: "text-muted", children: "\u25BE" })] }), _jsx(AnimatePresence, { children: open && (_jsxs(motion.div, { initial: { opacity: 0, y: -6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -6, scale: 0.97 }, transition: { duration: 0.16, ease: EASE }, className: `${CARD} absolute z-40 mt-2 w-[264px] overflow-hidden p-1.5`, children: [presets.map((p) => (_jsxs("button", { onClick: () => { onChange({ preset: p.id }); setOpen(false); }, className: `flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[14px] transition
                            hover:bg-black/[0.05] ${p.id === value ? "font-semibold" : "text-ink2"}`, children: [p.label, p.id === value && _jsx("span", { className: "text-[16px] font-bold text-violet-500", children: "\u2713" })] }, p.id))), _jsxs("div", { className: "mt-1.5 border-t border-black/[0.08] px-3 pb-1 pt-2.5", children: [_jsx("div", { className: "mb-1.5 text-[11.5px] text-muted", children: "Custom range" }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("input", { type: "date", value: from, min: bounds[0], max: to, onChange: (e) => onChange({ preset: "custom", from: e.target.value, to }), className: "w-full rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50" }), _jsx("span", { className: "text-muted", children: "\u2013" }), _jsx("input", { type: "date", value: to, min: from, max: bounds[1], onChange: (e) => onChange({ preset: "custom", from, to: e.target.value }), className: "w-full rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[12.5px] text-ink outline-none focus:ring-2 focus:ring-violet-500/50" })] })] })] })) })] }));
}
/* ============================== analytics tab ============================== */
function Kpi({ k, v, s, i, accent, decimals = 0, sign = false, suffix = "", text }) {
    return (_jsxs(motion.div, { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: i * 0.06, ease: EASE }, whileHover: { y: -3 }, className: `${CARD} p-4 transition-shadow hover:shadow-[0_8px_34px_-14px_rgba(99,102,241,.35)]`, children: [_jsx("div", { className: "text-[12px] text-muted", children: k }), _jsx("div", { className: `mt-0.5 font-bold tracking-tight ${text ? "text-[18px] leading-tight pt-1" : "text-[27px]"}`, style: accent ? { color: accent } : undefined, children: text ? text : _jsx(AnimatedNumber, { value: v, decimals: decimals, sign: sign, suffix: suffix }) }), _jsx("div", { className: "mt-0.5 text-[12px] text-ink2", children: s })] }));
}
function AnalyticsTab({ data, themeOf }) {
    const all = useMemo(() => [...data.entries].sort((a, b) => a.date.localeCompare(b.date)), [data]);
    const bounds = [all[0].date, all[all.length - 1].date];
    const allMonthKeys = useMemo(() => [...new Set(all.map((e) => e.date.slice(0, 7)))].sort(), [all]);
    const presets = useMemo(() => {
        const end = bounds[1];
        const minus = (n) => {
            const d = new Date(end + "T00:00:00");
            d.setDate(d.getDate() - n + 1);
            return d.toISOString().slice(0, 10);
        };
        return [
            { id: "all", label: "All time", from: bounds[0], to: end },
            { id: "14", label: "Last 14 days", from: minus(14), to: end },
            { id: "30", label: "Last 30 days", from: minus(30), to: end },
            { id: "60", label: "Last 60 days", from: minus(60), to: end },
            ...allMonthKeys.slice().reverse().map((k) => ({
                id: k,
                label: monthLabel(k),
                from: k + "-01",
                to: new Date(new Date(k + "-01T00:00:00").getFullYear(), new Date(k + "-01T00:00:00").getMonth() + 1, 0)
                    .toISOString().slice(0, 10),
            })),
        ];
    }, [bounds[0], bounds[1], allMonthKeys]);
    const [range, setRange] = useState({ preset: "all" });
    const { from, to } = useMemo(() => {
        if (range.preset === "custom")
            return { from: range.from, to: range.to };
        const p = presets.find((x) => x.id === range.preset) || presets[0];
        return { from: p.from, to: p.to };
    }, [range, presets]);
    const entries = useMemo(() => all.filter((e) => e.date >= from && e.date <= to), [all, from, to]);
    const months = useMemo(() => {
        const m = {};
        for (const e of entries)
            (m[e.date.slice(0, 7)] = m[e.date.slice(0, 7)] || []).push(e);
        return m;
    }, [entries]);
    const monthKeys = useMemo(() => Object.keys(months).sort(), [months]);
    const zoomed = range.preset !== "all";
    const rangeBar = (_jsxs(motion.div, { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE }, className: "mb-4 flex flex-wrap items-center gap-3", children: [_jsx(RangePicker, { presets: presets, value: range.preset, onChange: setRange, from: from, to: to, bounds: bounds }), _jsxs("span", { className: "text-[12.5px] tabular-nums text-muted", children: [entries.length, " of ", all.length, " entries"] }), _jsx(AnimatePresence, { children: zoomed && (_jsx(motion.button, { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.9 }, onClick: () => setRange({ preset: "all" }), whileTap: { scale: 0.96 }, className: "rounded-lg px-2.5 py-1 text-[12.5px] text-violet-600 transition hover:bg-violet-500/10", children: "\u21BA Reset zoom" })) })] }));
    const stats = useMemo(() => {
        const total = entries.length;
        if (!total)
            return { total: 0, span: 0, best: 0, cur: 0, avgS: 0, themeCount: {}, words: 0 };
        const d0 = new Date(entries[0].date), d1 = new Date(entries[total - 1].date);
        const span = Math.round((d1 - d0) / 864e5) + 1;
        const set = new Set(entries.map((e) => e.date));
        let run = 0, best = 0;
        for (let t = +d0; t <= +d1; t += 864e5) {
            const s = new Date(t).toISOString().slice(0, 10);
            if (set.has(s)) {
                run++;
                best = Math.max(best, run);
            }
            else
                run = 0;
        }
        let cur = 0;
        for (let t = +d1; t >= +d0; t -= 864e5) {
            if (set.has(new Date(t).toISOString().slice(0, 10)))
                cur++;
            else
                break;
        }
        const avgS = entries.reduce((a, e) => a + e.sentiment, 0) / total;
        const themeCount = {};
        entries.forEach((e) => e.themes.forEach((t) => (themeCount[t] = (themeCount[t] || 0) + 1)));
        const words = entries.reduce((a, e) => a + e.story.split(/\s+/).length, 0);
        return { total, span, best, cur, avgS, themeCount, words };
    }, [entries]);
    const themesSorted = useMemo(() => Object.entries(stats.themeCount).sort((a, b) => b[1] - a[1]), [stats]);
    const top = themesSorted[0];
    const points = useMemo(() => entries.map((e) => ({
        x: new Date(e.date + "T00:00:00"), y: e.sentiment, story: e.story,
        full: dayParts(e.date).full,
        themes: e.themes.map((t) => `${themeOf(t).emoji} ${themeOf(t).label}`).join(" · "),
    })), [entries, themeOf]);
    const words = useMemo(() => {
        const stop = new Set(("the a an and or but with for from to of in on at is was were are be been got get had has have do did very much more most this that these those my me i we our us he she her his they them their it its as by after before about into over under again just also so not no lol haha ha phew sigh finally since while when where which who whom what because though despite around out up down off then than too still ever never both all some any few couple another other same day days month week whole time first last next new good bad big small long short high low today yesterday lot bit way back home going went come came").split(/\s+/));
        const freq = {};
        for (const e of entries) {
            const seen = new Set();
            for (const tk of e.story.replace(/[’']/g, "'").split(/[^A-Za-z0-9']+/)) {
                const w = tk.toLowerCase();
                if (w.length < 3 || stop.has(w) || seen.has(w))
                    continue;
                seen.add(w);
                freq[w] = (freq[w] || 0) + 1;
            }
        }
        const nice = { hk: "HK", urmi: "Urmi", grab: "Grab", gopuff: "Gopuff", photon: "Photon", mumma: "Mumma", lalamove: "Lalamove", sodexo: "Sodexo", odissi: "Odissi", golu: "Golu", dhunuchi: "dhunuchi" };
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12)
            .map(([w, n]) => ({ label: nice[w] || w, value: n, tip: `<b>${nice[w] || w}</b> appears in ${n} entries` }));
    }, [entries]);
    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dowData = useMemo(() => {
        const agg = dows.map(() => ({ n: 0, s: 0 }));
        for (const e of entries) {
            const i = (new Date(e.date + "T00:00:00").getDay() + 6) % 7;
            agg[i].n++;
            agg[i].s += e.sentiment;
        }
        return dows.map((d, i) => ({
            label: d, value: agg[i].n,
            tip: `<b>${d}</b><br>${agg[i].n} entries · avg sentiment ${agg[i].n ? signed(agg[i].s / agg[i].n, 2) : "—"}`,
        }));
    }, [entries]);
    const topIds = themesSorted.slice(0, 8).map(([id]) => id);
    // weekly theme mix: top 6 themes keep their own colour, the tail folds into "Other"
    const stream = useMemo(() => {
        const top = themesSorted.slice(0, 6).map(([id]) => id);
        const series = top.map((id, i) => ({ id, label: themeOf(id).label, color: THEME_COLORS[i] }));
        const hasOther = themesSorted.length > 6;
        if (hasOther)
            series.push({ id: "__other", label: "Other themes", color: OTHER_COLOR });
        const weekStart = (iso) => {
            const d = new Date(iso + "T00:00:00");
            d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
            return d;
        };
        const map = new Map();
        for (const e of entries) {
            const ws = weekStart(e.date);
            const key = ws.toISOString().slice(0, 10);
            if (!map.has(key))
                map.set(key, {
                    start: ws,
                    label: ws.toLocaleDateString("en-SG", { day: "numeric", month: "short" }),
                    counts: {}, total: 0,
                });
            const b = map.get(key);
            // one entry contributes once per distinct bucket-series it belongs to
            const hit = new Set(e.themes.map((t) => (top.includes(t) ? t : "__other")));
            for (const k of hit) {
                b.counts[k] = (b.counts[k] || 0) + 1;
                b.total++;
            }
        }
        return { series, buckets: [...map.values()].sort((a, b) => a.start - b.start) };
    }, [entries, themesSorted, themeOf]);
    if (!entries.length) {
        return (_jsxs("div", { children: [rangeBar, _jsx("div", { className: `${CARD} py-20 text-center text-muted`, children: "No entries in this date range." })] }));
    }
    return (_jsxs("div", { children: [rangeBar, _jsxs("div", { className: "mb-4 grid grid-cols-[repeat(auto-fit,minmax(152px,1fr))] gap-3", children: [_jsx(Kpi, { i: 0, k: "Entries", v: stats.total, s: `over ${stats.span} days` }), _jsx(Kpi, { i: 1, k: "Coverage", v: Math.round((stats.total / stats.span) * 100), suffix: "%", s: "of days captured" }), _jsx(Kpi, { i: 2, k: "Current streak", v: stats.cur, s: `longest ${stats.best} days` }), _jsx(Kpi, { i: 3, k: "Avg sentiment", v: stats.avgS, decimals: 2, sign: true, accent: sentColor(stats.avgS), s: "on a \u22121 \u2026 +1 scale" }), _jsx(Kpi, { i: 4, k: "Top theme", text: `${themeOf(top[0]).emoji} ${themeOf(top[0]).label}`, s: `${top[1]} of ${stats.total} entries (${Math.round((top[1] / stats.total) * 100)}%)` }), _jsx(Kpi, { i: 5, k: "Words written", v: stats.words, s: `≈ ${Math.round(stats.words / stats.total)} per entry` })] }), _jsxs("div", { className: "grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4", children: [_jsx(ChartCard, { className: "col-span-full", title: "Sentiment over time", desc: "Daily entries (dots) with a 7-day rolling average (line). Hover for the story behind each day.", legend: _jsxs(_Fragment, { children: [_jsx(Swatch, { color: "var(--pos)", label: "Positive day" }), _jsx(Swatch, { color: "var(--neu)", label: "Neutral day" }), _jsx(Swatch, { color: "var(--neg)", label: "Negative day" })] }), children: _jsx(SentimentLine, { points: points }) }), _jsx(ChartCard, { className: "col-span-full", title: "What I was writing about", desc: "Theme mix week by week \u2014 the taller the block, the more that topic dominated. Hover any block for the detail.", legend: stream.series.map((s) => _jsx(Swatch, { color: s.color, label: s.label }, s.id)), children: _jsx(ThemeStream, { buckets: stream.buckets, series: stream.series }) }), _jsx(ChartCard, { title: "Theme frequency", desc: "How often each theme appears (entries can carry several themes).", children: _jsx(HBars, { data: themesSorted.map(([id, n]) => ({
                                label: `${themeOf(id).emoji} ${themeOf(id).label}`,
                                value: n,
                                tip: `<b>${themeOf(id).label}</b><br>${n} entries (${Math.round((n / stats.total) * 100)}% of all)`,
                            })) }) }), _jsx(ChartCard, { title: "Sentiment mix by month", desc: "Days classed negative / neutral / positive, centered on neutral.", legend: _jsxs(_Fragment, { children: [_jsx(Swatch, { color: "var(--neg)", label: "Negative" }), _jsx(Swatch, { color: "var(--neu)", label: "Neutral" }), _jsx(Swatch, { color: "var(--pos)", label: "Positive" })] }), children: _jsx(Diverging, { data: monthKeys.map((k) => {
                                const es = months[k];
                                const neg = es.filter((e) => e.sentiment <= -0.15).length;
                                const pos = es.filter((e) => e.sentiment >= 0.15).length;
                                return { label: monthShort(k), neg, pos, neu: es.length - neg - pos };
                            }) }) }), _jsx(ChartCard, { title: "Themes by month", desc: "Where each theme concentrated over the summer.", children: _jsx(Heatmap, { rows: topIds.map((id) => ({ id, label: `${themeOf(id).emoji} ${themeOf(id).label}` })), cols: monthKeys.map((k) => ({ id: k, label: monthShort(k) })), get: (r, c) => {
                                const n = (months[c.id] || []).filter((e) => e.themes.includes(r.id)).length;
                                return { value: n, tip: `<b>${themeOf(r.id).label}</b> · ${monthLabel(c.id)}<br>${n} ${n === 1 ? "entry" : "entries"}` };
                            } }) }), _jsx(ChartCard, { title: "Most written about", desc: "Words appearing in the most entries (common words removed).", children: _jsx(HBars, { data: words, labelWidth: 110 }) }), _jsx(ChartCard, { title: "Entries per month", desc: "Logging volume by calendar month.", children: _jsx(Columns, { data: monthKeys.map((k) => ({ label: monthShort(k), value: months[k].length, tip: `<b>${monthLabel(k)}</b><br>${months[k].length} entries` })) }) }), _jsx(ChartCard, { title: "Weekday pattern", desc: "Which days get captured most. Hover for average sentiment.", children: _jsx(Columns, { data: dowData, height: 200 }) })] }), _jsxs(motion.div, { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.5, ease: EASE }, className: `${CARD} mt-4 p-6`, children: [_jsxs("h3", { className: "mb-3 text-[14.5px] font-semibold tracking-tight", children: ["Insights", zoomed && _jsxs("span", { className: "ml-2 font-normal text-[12px] text-muted", children: ["\u00B7 across all ", all.length, " entries, not the selected range"] })] }), _jsx("ul", { className: "m-0 space-y-2.5 p-0", children: data.insights.map((t, i) => (_jsxs(motion.li, { initial: { opacity: 0, x: -6 }, whileInView: { opacity: 1, x: 0 }, viewport: { once: true }, transition: { duration: 0.4, delay: i * 0.06 }, className: "flex gap-3 text-[14px] leading-relaxed text-ink2", children: [_jsx("span", { className: `mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${GRAD}` }), _jsx("span", { children: t })] }, i))) })] })] }));
}
/* ============================== shell ============================== */
const TABS = [
    { id: "analytics", label: "Analytics" },
    { id: "summary", label: "Monthly Summary" },
    { id: "raw", label: "Raw Data" },
];
function App() {
    const [data, setData] = useState(null);
    const [tab, setTab] = useState("analytics");
    const [tip, setTip] = useState(null);
    useEffect(() => {
        document.getElementById("boot")?.remove();
        // Clear any passcode cached by an earlier build so no tab stays silently unlocked.
        sessionStorage.removeItem("hfl_pass");
    }, []);
    const themeOf = useCallback((id) => data?.themes.find((t) => t.id === id) || { label: id, emoji: "" }, [data]);
    const months = useMemo(() => {
        if (!data)
            return {};
        const m = {};
        for (const e of data.entries)
            (m[e.date.slice(0, 7)] = m[e.date.slice(0, 7)] || []).push(e);
        return m;
    }, [data]);
    const monthKeys = useMemo(() => Object.keys(months).sort(), [months]);
    if (!data) {
        return (_jsx(TipCtx.Provider, { value: setTip, children: _jsx(LockScreen, { onUnlocked: setData }) }));
    }
    const r = data.meta.range;
    const sub = `${new Date(r.start).toLocaleDateString("en-SG", { day: "numeric", month: "short" })} – ${new Date(r.end).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })} · ${data.entries.length} moments`;
    return (_jsxs(TipCtx.Provider, { value: setTip, children: [_jsx(Tooltip, { tip: tip }), _jsxs("div", { className: "mx-auto max-w-[1120px] px-5 pb-24", children: [_jsxs(motion.header, { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE }, className: "flex flex-wrap items-center gap-3 pt-7 pb-2", children: [_jsxs("a", { href: "../", className: "almanac-crumb basis-full", title: "Back to GG's Almanac", children: [_jsx("span", { className: "dot" }), "GG's Almanac"] }), _jsx("div", { className: `flex h-9 w-9 items-center justify-center rounded-xl ${GRAD} text-[17px] shadow-md shadow-violet-500/25`, children: "\u270D\uFE0F" }), _jsx("h1", { className: "m-0 text-[21px] font-bold tracking-tight", children: "Homework for Life" }), _jsx("span", { className: "text-[13px] text-muted", children: sub }), _jsx("div", { className: "flex-1" }), _jsx(motion.button, { whileHover: { scale: 1.04 }, whileTap: { scale: 0.96 }, onClick: () => { sessionStorage.clear(); location.reload(); }, className: `${CARD} px-3 py-1.5 text-[13px] text-ink2`, title: "Lock the journal", children: "\uD83D\uDD12 Lock" })] }), _jsx(motion.nav, { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.1 }, className: "sticky top-0 z-20 -mx-5 mb-6 flex gap-1 border-b border-black/[0.07] px-5 pt-2\n                     backdrop-blur-xl", style: { background: "color-mix(in srgb, var(--page) 82%, transparent)" }, children: _jsx(LayoutGroup, { id: "tabs", children: TABS.map((t) => (_jsxs("button", { onClick: () => setTab(t.id), className: `relative px-4 pb-3 pt-2 text-[14px] transition-colors ${tab === t.id ? "font-semibold text-ink" : "text-ink2 hover:text-ink"}`, children: [t.label, tab === t.id && (_jsx(motion.span, { layoutId: "tabline", transition: SPRING, className: `absolute inset-x-2 -bottom-px h-[2.5px] rounded-full ${GRAD}` }))] }, t.id))) }) }), _jsxs(motion.main, { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: EASE }, children: [tab === "raw" && _jsx(RawTab, { data: data, themeOf: themeOf, months: months, monthKeys: monthKeys }), tab === "summary" && _jsx(SummaryTab, { data: data, themeOf: themeOf, months: months }), tab === "analytics" && _jsx(AnalyticsTab, { data: data, themeOf: themeOf })] }, tab), _jsx("footer", { className: "mt-14 border-t border-black/[0.07] pt-4 text-[12.5px] text-muted", children: "Built from the Notion \u201CStory\u201D database \u00B7 entries are encrypted at rest (AES-256-GCM); the passcode never leaves this browser." })] })] }));
}
createRoot(document.getElementById("root")).render(_jsx(App, {}));
