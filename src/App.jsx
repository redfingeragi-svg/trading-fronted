import { useState, useEffect, useRef } from "react";

const BACKEND_URL = "https://trading-backend-nu.vercel.app";

// ── KEPUTUSAN DETERMINISTIK — tidak butuh AI API ─────────────────
// Semua logika 3-layer dihitung di sini, bukan oleh AI
function makeDecision(d4, d1) {
  if (!d4 || !d1) return null;

  const ez = d4.entryZone;
  const cp = d4.currentPrice;

  // ── LAYER 1: TREND CHECK ──────────────────────────────────────
  const trend4h  = d4.trendBullish;
  const trend1h  = d1.trendBullish;
  const vmcBull4 = d4.vmc.bullish || d4.vmc.moneyFlow > 0;
  const vmcBear4 = d4.vmc.bearish || d4.vmc.moneyFlow < 0;
  const vmcBull1 = d1.vmc.bullish || d1.vmc.moneyFlow > 0;
  const vmcBear1 = d1.vmc.bearish || d1.vmc.moneyFlow < 0;
  const sep4h    = parseFloat(d4.maSeparation);
  const ranging  = sep4h < 0.05;

  // Layer 1 verdict
  const l1Long  = trend4h && vmcBull4;
  const l1Short = !trend4h && vmcBear4;
  const l1Valid = l1Long || l1Short;

  // ── LAYER 2: S&R ZONE CHECK ───────────────────────────────────
  const inLongZone  = ez?.long?.inZone  ?? false;
  const inShortZone = ez?.short?.inZone ?? false;

  // ── LAYER 3: RR CALCULATION ───────────────────────────────────
  let longSetup = null, shortSetup = null;
  if (ez?.long && ez.long.sl && ez.long.tp) {
    const entry  = parseFloat(cp);
    const sl     = parseFloat(ez.long.sl);
    const tp     = parseFloat(ez.long.tp);
    const risk   = (entry - sl).toFixed(2);
    const reward = (tp - entry).toFixed(2);
    longSetup = { entry: entry.toFixed(2), sl: sl.toFixed(2), tp: tp.toFixed(2), risk, reward, rrCalc: `Risk: $${risk} | Reward: $${reward} | RR: 1:3` };
  }
  if (ez?.short && ez.short.sl && ez.short.tp) {
    const entry  = parseFloat(cp);
    const sl     = parseFloat(ez.short.sl);
    const tp     = parseFloat(ez.short.tp);
    const risk   = (sl - entry).toFixed(2);
    const reward = (entry - tp).toFixed(2);
    shortSetup = { entry: entry.toFixed(2), sl: sl.toFixed(2), tp: tp.toFixed(2), risk, reward, rrCalc: `Risk: $${risk} | Reward: $${reward} | RR: 1:3` };
  }

  // ── FINAL DECISION ────────────────────────────────────────────
  // Semua 3 layer harus terpenuhi untuk ENTRY

  // Confluence 4H + 1H
  const conf4h1hLong  = trend4h && trend1h && vmcBull4;
  const conf4h1hShort = !trend4h && !trend1h && vmcBear4;

  let signal = "WAIT";
  let setup  = null;
  let reasons = [];
  let waitReasons = [];
  let confidence = 0;

  if (ranging) {
    signal = "WAIT";
    waitReasons.push(`MA separation hanya ${sep4h}% — market RANGING, sinyal tidak valid`);
  } else if (l1Long && inLongZone && longSetup) {
    signal = "LONG";
    setup  = longSetup;
    confidence = conf4h1hLong ? 85 : 70;
    reasons.push(`✅ L1: MA13 > MA21 (${d4.maStatus}) + VMC ${d4.vmc.dot !== "NONE" ? d4.vmc.dot : "MF " + d4.vmc.moneyFlow}`);
    reasons.push(`✅ L2: Harga ${cp} dalam zona LONG [${ez.long.entryZoneMin}–${ez.long.entryZoneMax}] — ${ez.long.distancePct} dari support`);
    reasons.push(`✅ L3: SL=$${longSetup.sl} (2% bawah support $${ez.long.supportLevel}) | TP=$${longSetup.tp} | RR 1:3`);
    if (conf4h1hLong) reasons.push(`✅ KONFLUENSI: 4H+1H sama-sama BULLISH — sinyal kuat`);
    else reasons.push(`⚠️ 1H: ${d1.maStatus} — konfluensi parsial`);
  } else if (l1Short && inShortZone && shortSetup) {
    signal = "SHORT";
    setup  = shortSetup;
    confidence = conf4h1hShort ? 85 : 70;
    reasons.push(`✅ L1: MA13 < MA21 (${d4.maStatus}) + VMC ${d4.vmc.dot !== "NONE" ? d4.vmc.dot : "MF " + d4.vmc.moneyFlow}`);
    reasons.push(`✅ L2: Harga ${cp} dalam zona SHORT [${ez.short.entryZoneMin}–${ez.short.entryZoneMax}] — ${ez.short.distancePct} ke resistance`);
    reasons.push(`✅ L3: SL=$${shortSetup.sl} (2% atas resistance $${ez.short.resistanceLevel}) | TP=$${shortSetup.tp} | RR 1:3`);
    if (conf4h1hShort) reasons.push(`✅ KONFLUENSI: 4H+1H sama-sama BEARISH — sinyal kuat`);
    else reasons.push(`⚠️ 1H: ${d1.maStatus} — konfluensi parsial`);
  } else {
    // WAIT — tentukan kenapa
    if (!l1Valid) {
      if (ranging) waitReasons.push("Market ranging — MA terlalu berdekatan");
      else waitReasons.push(`L1 GAGAL: Trend & VMC bertentangan (Trend: ${trend4h?"BULLISH":"BEARISH"}, VMC: ${d4.vmc.dot})`);
    }
    if (l1Long && !inLongZone) {
      waitReasons.push(`L2 GAGAL: Trend BULLISH tapi harga belum di zona LONG. Tunggu harga turun ke $${ez.long?.entryZoneMin}–$${ez.long?.entryZoneMax} (${ez.long?.distancePct} dari support)`);
    }
    if (l1Short && !inShortZone) {
      waitReasons.push(`L2 GAGAL: Trend BEARISH tapi harga belum di zona SHORT. Tunggu harga naik ke $${ez.short?.entryZoneMin}–$${ez.short?.entryZoneMax} (${ez.short?.distancePct} ke resistance)`);
    }
    if (!ez?.long?.supportLevel && !ez?.short?.resistanceLevel) {
      waitReasons.push("L2 GAGAL: Tidak ada level S&R yang terdeteksi dari data candle");
    }
    confidence = 0;
  }

  return {
    signal, confidence, setup, reasons, waitReasons,
    layer1: { trend4h, trend1h, vmcBull4, vmcBear4, vmcBull1, vmcBear1, ranging, sep4h, l1Long, l1Short },
    layer2: { inLongZone, inShortZone, longZone: ez?.long, shortZone: ez?.short },
    layer3: { longSetup, shortSetup },
    confluence: conf4h1hLong || conf4h1hShort,
    sr: d4.sr,
    price: cp,
    pair: d4.pair,
    timestamp: d4.timestamp,
  };
}

const POPULAR = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","DOT","MATIC","LINK","LTC","ATOM","UNI","APT"];

function fmt(n, d=4) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d });
}

// ── STYLES ───────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-tap-highlight-color: transparent; }
  body { background: #080c14; color: #e2e8f0; font-family: 'Space Mono', monospace; overscroll-behavior: none; }
  :root { --g:#00ff88; --c:#00c4ff; --r:#ff5050; --o:#ffb400; --p:#a080ff; --bg:#080c14; }

  .app { min-height:100vh; min-height:100dvh; background:var(--bg);
    background-image: radial-gradient(ellipse 80% 40% at 50% -10%, rgba(0,255,136,0.09) 0%, transparent 60%),
    linear-gradient(180deg,#080c14 0%,#0d1421 100%); display:flex; flex-direction:column; max-width:600px; margin:0 auto; }

  /* HEADER */
  .hdr { padding:12px 16px; border-bottom:1px solid rgba(0,255,136,0.12); display:flex; align-items:center;
    gap:10px; background:rgba(0,0,0,0.5); backdrop-filter:blur(16px); position:sticky; top:0; z-index:100; }
  .logo { width:34px; height:34px; background:linear-gradient(135deg,var(--g),var(--c)); border-radius:9px;
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px;
    color:var(--bg); flex-shrink:0; font-family:'Syne',sans-serif; }
  .hdr-t h1 { font-family:'Syne',sans-serif; font-size:11px; font-weight:800; color:var(--g); letter-spacing:0.04em; line-height:1; }
  .hdr-t p { font-size:8px; color:#3a5060; letter-spacing:0.06em; margin-top:3px; }
  .hdr-r { margin-left:auto; display:flex; align-items:center; gap:5px; }
  .bdg { border-radius:20px; padding:3px 9px; font-size:8px; font-family:'Syne',sans-serif; font-weight:700; }
  .bdg-g { background:rgba(0,255,136,0.12); border:1px solid rgba(0,255,136,0.3); color:var(--g); }
  .bdg-b { background:rgba(0,196,255,0.1); border:1px solid rgba(0,196,255,0.25); color:var(--c); }
  .bdg-p { background:rgba(120,80,255,0.1); border:1px solid rgba(120,80,255,0.25); color:var(--p); }
  .live-i { display:flex; align-items:center; gap:4px; font-size:8px; color:#4a6080; }
  .dot-l { width:6px; height:6px; background:var(--g); border-radius:50%; animation:pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

  /* COIN INPUT */
  .coin-sec { padding:12px 14px 10px; border-bottom:1px solid rgba(0,255,136,0.08); background:rgba(0,0,0,0.2); }
  .sec-lbl { font-size:8px; color:#3a5060; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:7px; }
  .coin-row { display:flex; gap:7px; align-items:center; margin-bottom:9px; }
  .coin-inp { flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(0,255,136,0.2); border-radius:10px;
    padding:10px 13px; font-size:15px; font-weight:700; color:var(--g); font-family:'Syne',sans-serif;
    outline:none; letter-spacing:0.08em; text-transform:uppercase; transition:border-color 0.2s; }
  .coin-inp::placeholder { color:#2a4055; font-size:11px; font-weight:400; text-transform:none; }
  .coin-inp:focus { border-color:rgba(0,255,136,0.5); box-shadow:0 0 0 3px rgba(0,255,136,0.06); }
  .ana-btn { background:linear-gradient(135deg,var(--g),var(--c)); border:none; border-radius:10px; padding:10px 16px;
    font-size:12px; font-weight:700; color:var(--bg); font-family:'Syne',sans-serif; cursor:pointer;
    transition:all 0.2s; white-space:nowrap; letter-spacing:0.04em; }
  .ana-btn:active { transform:scale(0.96); }
  .ana-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .pop-c { display:flex; gap:5px; flex-wrap:wrap; }
  .c-chip { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:5px;
    padding:4px 10px; font-size:10px; color:#5a7080; cursor:pointer; transition:all 0.15s;
    font-family:'Syne',sans-serif; font-weight:600; }
  .c-chip.active { background:rgba(0,255,136,0.12); border-color:rgba(0,255,136,0.5); color:var(--g); }
  .fetch-s { display:flex; align-items:center; gap:7px; font-size:10px; color:#4a6080; padding:6px 0; }
  .spin { width:13px; height:13px; border:2px solid rgba(0,255,136,0.2); border-top-color:var(--g);
    border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; }
  @keyframes spin { to { transform:rotate(360deg); } }

  /* LIVE CARD */
  .live-card { margin:10px 14px 0; background:rgba(0,0,0,0.35); border:1px solid rgba(0,255,136,0.1); border-radius:12px; overflow:hidden; }
  .lc-hdr { display:flex; align-items:center; justify-content:space-between; padding:9px 13px; border-bottom:1px solid rgba(255,255,255,0.05); }
  .lc-pair { font-family:'Syne',sans-serif; font-size:14px; font-weight:800; color:#fff; }
  .lc-price { font-family:'Syne',sans-serif; font-size:16px; font-weight:800; color:var(--g); }
  .lc-src { font-size:8px; color:#3a5060; margin-top:2px; }
  .lc-tabs { display:flex; border-bottom:1px solid rgba(255,255,255,0.05); }
  .lc-tab { flex:1; padding:8px 4px; font-size:9px; font-family:'Syne',sans-serif; font-weight:600;
    letter-spacing:0.05em; text-align:center; cursor:pointer; color:#3a5060; border:none; background:none; transition:all 0.2s; }
  .lc-tab.active { color:var(--g); border-bottom:2px solid var(--g); background:rgba(0,255,136,0.04); }
  .lc-body { padding:10px 13px; }
  .dg { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:8px; }
  .dc { background:rgba(255,255,255,0.025); border-radius:6px; padding:6px 8px; }
  .dc-l { font-size:8px; color:#3a5060; letter-spacing:0.07em; text-transform:uppercase; margin-bottom:3px; }
  .dc-v { font-size:10px; font-weight:700; color:#c8d8e8; }
  .dc-v.g{color:var(--g)} .dc-v.r{color:var(--r)} .dc-v.o{color:var(--o)} .dc-v.b{color:var(--c)}
  .sp { border-radius:5px; padding:3px 9px; font-size:10px; font-weight:700; font-family:'Syne',sans-serif; display:inline-flex; align-items:center; gap:4px; }
  .sp-g { background:rgba(0,255,136,0.1); border:1px solid rgba(0,255,136,0.3); color:var(--g); }
  .sp-r { background:rgba(255,80,80,0.1); border:1px solid rgba(255,80,80,0.3); color:var(--r); }
  .sp-b { background:rgba(0,196,255,0.1); border:1px solid rgba(0,196,255,0.25); color:var(--c); }
  .sp-n { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:#5a7080; }
  .sr-row { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:5px; }
  .sr-r { background:rgba(255,80,80,0.08); border:1px solid rgba(255,80,80,0.2); border-radius:4px; padding:2px 8px; font-size:9px; font-weight:700; color:#ff7070; }
  .sr-s { background:rgba(0,255,136,0.07); border:1px solid rgba(0,255,136,0.2); border-radius:4px; padding:2px 8px; font-size:9px; font-weight:700; color:#00cc70; }

  /* ═══ DECISION CARD — UTAMA ═══ */
  .decision-wrap { margin:12px 14px 0; }

  .dec-card { border-radius:14px; padding:16px; border:2px solid; }
  .dec-LONG  { background:linear-gradient(135deg,rgba(0,255,136,0.08),rgba(0,196,255,0.04)); border-color:rgba(0,255,136,0.5); }
  .dec-SHORT { background:linear-gradient(135deg,rgba(255,80,80,0.08),rgba(255,120,80,0.04)); border-color:rgba(255,80,80,0.5); }
  .dec-WAIT  { background:linear-gradient(135deg,rgba(255,180,0,0.06),rgba(255,140,0,0.03)); border-color:rgba(255,180,0,0.35); }

  .dec-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .dec-signal { display:flex; align-items:center; gap:10px; }
  .dec-badge { font-family:'Syne',sans-serif; font-size:26px; font-weight:800; letter-spacing:0.06em; line-height:1; }
  .dec-badge.LONG{color:var(--g)} .dec-badge.SHORT{color:var(--r)} .dec-badge.WAIT{color:var(--o)}
  .dec-sub { font-size:9px; color:#4a6080; margin-top:3px; letter-spacing:0.08em; }
  .conf-wrap { text-align:right; }
  .conf-num { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
  .conf-num.LONG{color:var(--g)} .conf-num.SHORT{color:var(--r)} .conf-num.WAIT{color:var(--o)}
  .conf-lbl { font-size:8px; color:#3a5060; letter-spacing:0.08em; }
  .conf-bar-wrap { width:60px; height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden; margin:4px 0 0 auto; }
  .conf-bar-fill { height:100%; border-radius:2px; transition:width 1.2s ease; }
  .fill-LONG{background:linear-gradient(90deg,var(--g),var(--c))}
  .fill-SHORT{background:linear-gradient(90deg,var(--r),#ff8080)}
  .fill-WAIT{background:linear-gradient(90deg,var(--o),#ffcc44)}

  /* LAYER CHECKLIST */
  .layer-list { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
  .layer-item { display:flex; gap:9px; align-items:flex-start; font-size:11px; color:#8899aa; line-height:1.5; }
  .layer-icon { width:20px; height:20px; border-radius:5px; display:flex; align-items:center;
    justify-content:center; font-size:10px; flex-shrink:0; margin-top:1px; }
  .li-pass { background:rgba(0,255,136,0.15); color:var(--g); }
  .li-fail { background:rgba(255,80,80,0.15); color:var(--r); }
  .li-warn { background:rgba(255,180,0,0.15); color:var(--o); }

  /* PRICE BOXES */
  .price-boxes { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
  .pb { border-radius:10px; padding:10px 12px; }
  .pb-entry { background:rgba(0,196,255,0.06); border:1px solid rgba(0,196,255,0.25); }
  .pb-sl { background:rgba(255,80,80,0.06); border:1px solid rgba(255,80,80,0.25); }
  .pb-tp { background:rgba(0,255,136,0.06); border:1px solid rgba(0,255,136,0.25); grid-column:1/-1; }
  .pb-lbl { font-size:8px; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px; }
  .pb-entry .pb-lbl{color:var(--c)} .pb-sl .pb-lbl{color:var(--r)} .pb-tp .pb-lbl{color:var(--g)}
  .pb-val { font-family:'Syne',sans-serif; font-size:16px; font-weight:800; }
  .pb-entry .pb-val{color:#e2e8f0} .pb-sl .pb-val{color:var(--r)} .pb-tp .pb-val{color:var(--g); font-size:20px;}
  .pb-note { font-size:9px; color:#4a6080; margin-top:3px; }

  /* RR STRIP */
  .rr-strip { background:rgba(255,180,0,0.07); border:1px solid rgba(255,180,0,0.25); border-radius:8px;
    padding:9px 12px; display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .rr-big { font-family:'Syne',sans-serif; font-size:18px; font-weight:800; color:var(--o); }
  .rr-detail { font-size:10px; color:#6a8099; text-align:right; line-height:1.6; }

  /* WAIT REASONS */
  .wait-box { border-radius:10px; padding:12px 14px; background:rgba(255,180,0,0.06); border:1px solid rgba(255,180,0,0.2); }
  .wait-title { font-family:'Syne',sans-serif; font-size:10px; font-weight:700; color:var(--o); letter-spacing:0.08em; margin-bottom:8px; }
  .wait-item { display:flex; gap:8px; font-size:11px; color:#8899aa; line-height:1.5; margin-bottom:6px; }
  .wait-item:last-child { margin-bottom:0; }

  /* CONFLUENCE STRIP */
  .conf-strip { border-radius:8px; padding:9px 12px; display:flex; align-items:center; gap:8px;
    font-size:11px; color:#8899aa; margin-bottom:10px; }
  .conf-strip.yes { background:rgba(0,255,136,0.06); border:1px solid rgba(0,255,136,0.2); }
  .conf-strip.no  { background:rgba(255,180,0,0.05); border:1px solid rgba(255,180,0,0.15); }

  /* MESSAGES */
  .msgs { flex:1; overflow-y:auto; padding:12px 14px; display:flex; flex-direction:column; gap:11px;
    -webkit-overflow-scrolling:touch; scrollbar-width:thin; scrollbar-color:rgba(0,255,136,0.2) transparent; }
  .msg { display:flex; gap:8px; animation:fadeUp 0.3s ease; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .msg.user { flex-direction:row-reverse; }
  .av { width:26px; height:26px; border-radius:7px; flex-shrink:0; display:flex; align-items:center;
    justify-content:center; font-size:9px; font-weight:700; margin-top:2px; }
  .av-a { background:linear-gradient(135deg,var(--g),var(--c)); color:var(--bg); font-family:'Syne',sans-serif; }
  .av-u { background:rgba(255,255,255,0.08); color:#8899aa; }
  .mc { max-width:88%; }
  .bbl { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:12px;
    padding:10px 13px; font-size:12px; line-height:1.7; color:#c8d8e8; }
  .msg.user .bbl { background:rgba(0,255,136,0.07); border-color:rgba(0,255,136,0.15); color:#e2e8f0; }

  /* LOADING */
  .ldm { display:flex; gap:8px; align-items:flex-start; }
  .ldd { display:flex; gap:4px; padding:12px 14px; background:rgba(255,255,255,0.04);
    border:1px solid rgba(255,255,255,0.06); border-radius:12px; }
  .ld { width:5px; height:5px; background:var(--g); border-radius:50%; animation:bounce 1.2s infinite; }
  .ld:nth-child(2){animation-delay:0.2s} .ld:nth-child(3){animation-delay:0.4s}
  @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-6px);opacity:1} }

  /* INPUT */
  .inp-a { padding:9px 14px 16px; border-top:1px solid rgba(0,255,136,0.08); background:rgba(0,0,0,0.3); }
  .inp-r { display:flex; gap:7px; align-items:flex-end; }
  .iw { flex:1; background:rgba(255,255,255,0.04); border:1px solid rgba(0,255,136,0.12);
    border-radius:10px; overflow:hidden; transition:border-color 0.2s; }
  .iw:focus-within { border-color:rgba(0,255,136,0.35); }
  .ti { width:100%; background:none; border:none; outline:none; padding:10px 12px; font-size:13px;
    color:#e2e8f0; font-family:'Space Mono',monospace; resize:none; max-height:80px; line-height:1.5; }
  .ti::placeholder { color:#1e3040; }
  .sb { width:42px; height:42px; background:linear-gradient(135deg,var(--g),var(--c)); border:none;
    border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;
    flex-shrink:0; transition:transform 0.15s; }
  .sb:active { transform:scale(0.92); }
  .sb:disabled { opacity:0.35; cursor:not-allowed; transform:none; }
  .hint { font-size:9px; color:#1a2f40; margin-top:7px; }

  /* WELCOME */
  .welcome { background:linear-gradient(135deg,rgba(0,255,136,0.05),rgba(0,196,255,0.03));
    border:1px solid rgba(0,255,136,0.15); border-radius:14px; padding:16px; margin-bottom:4px; }
  .welcome h2 { font-family:'Syne',sans-serif; font-size:15px; font-weight:800; color:#fff; margin-bottom:6px; }
  .welcome h2 span { color:var(--g); }
  .welcome p { font-size:11px; color:#6a8099; line-height:1.6; margin-bottom:10px; }
  .flow { display:flex; flex-direction:column; gap:6px; }
  .flow-item { display:flex; gap:8px; align-items:center; font-size:10px; color:#6a8099; }
  .flow-n { width:20px; height:20px; border-radius:5px; background:rgba(0,196,255,0.12);
    color:var(--c); display:flex; align-items:center; justify-content:center; font-size:9px; flex-shrink:0; font-family:'Syne',sans-serif; font-weight:700; }

  ::-webkit-scrollbar { width:3px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:rgba(0,255,136,0.15); border-radius:2px; }
`;

// ── LIVE DATA CARD ────────────────────────────────────────────────
function LiveCard({ d4, d1 }) {
  const [tab, setTab] = useState("ma");
  if (!d4) return null;
  return (
    <div className="live-card">
      <div className="lc-hdr">
        <div>
          <div className="lc-pair">{d4.pair}</div>
          <div className="lc-src">BingX Futures · {new Date(d4.timestamp).toLocaleTimeString("id-ID")}</div>
        </div>
        <div className="lc-price">${fmt(d4.currentPrice)}</div>
      </div>
      <div className="lc-tabs">
        {[["ma","MA + VMC"],["sr","S&R"]].map(([k,v])=>(
          <button key={k} className={`lc-tab${tab===k?" active":""}`} onClick={()=>setTab(k)}>{v}</button>
        ))}
      </div>
      <div className="lc-body">
        {tab==="ma" && <>
          <div style={{fontSize:"8px",color:"#3a5060",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:"6px"}}>4H ▸ Trend</div>
          <div className="dg">
            <div className="dc"><div className="dc-l">MA 13</div><div className="dc-v">{d4.ma13}</div></div>
            <div className="dc"><div className="dc-l">MA 21</div><div className="dc-v">{d4.ma21}</div></div>
            <div className="dc" style={{gridColumn:"1/-1"}}><div className="dc-l">Status 4H</div>
              <span className={`sp ${d4.trendBullish?"sp-g":"sp-r"}`}>{d4.trendBullish?"▲ BULLISH":"▼ BEARISH"}</span>
            </div>
            <div className="dc"><div className="dc-l">VMC Dot</div>
              <span className={`sp ${d4.vmc?.dot==="GREEN"?"sp-g":d4.vmc?.dot==="RED"?"sp-r":"sp-n"}`}>{d4.vmc?.dot==="GREEN"?"● HIJAU":d4.vmc?.dot==="RED"?"● MERAH":"◌ NONE"}</span>
            </div>
            <div className="dc"><div className="dc-l">Money Flow</div>
              <div className={`dc-v ${d4.vmc?.moneyFlow>0?"g":"r"}`}>{d4.vmc?.moneyFlow>0?"+":""}{d4.vmc?.moneyFlow}</div>
            </div>
          </div>
          {d1 && <>
            <div style={{fontSize:"8px",color:"#3a5060",letterSpacing:"0.08em",textTransform:"uppercase",margin:"8px 0 6px"}}>1H ▸ Entry Timing</div>
            <div className="dg">
              <div className="dc"><div className="dc-l">Status 1H</div>
                <span className={`sp ${d1.trendBullish?"sp-g":"sp-r"}`}>{d1.trendBullish?"▲ BULLISH":"▼ BEARISH"}</span>
              </div>
              <div className="dc"><div className="dc-l">Money Flow</div>
                <div className={`dc-v ${d1.vmc?.moneyFlow>0?"g":"r"}`}>{d1.vmc?.moneyFlow>0?"+":""}{d1.vmc?.moneyFlow}</div>
              </div>
            </div>
          </>}
        </>}
        {tab==="sr" && <>
          <div style={{fontSize:"8px",color:"#ff7070",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:"5px"}}>🔴 Resistance</div>
          <div className="sr-row">{d4.sr?.resistanceLevels?.length ? d4.sr.resistanceLevels.map((r,i)=><span key={i} className="sr-r">R{i+1}: ${fmt(r)}</span>) : <span style={{fontSize:"10px",color:"#3a5060"}}>—</span>}</div>
          <div style={{fontSize:"8px",color:"#00cc70",letterSpacing:"0.08em",textTransform:"uppercase",margin:"8px 0 5px"}}>🟢 Support</div>
          <div className="sr-row">{d4.sr?.supportLevels?.length ? d4.sr.supportLevels.map((s,i)=><span key={i} className="sr-s">S{i+1}: ${fmt(s)}</span>) : <span style={{fontSize:"10px",color:"#3a5060"}}>—</span>}</div>
        </>}
      </div>
    </div>
  );
}

// ── DECISION CARD — KOMPONEN UTAMA ────────────────────────────────
function DecisionCard({ dec }) {
  const [fw, setFw] = useState(0);
  useEffect(()=>{ setTimeout(()=>setFw(dec.confidence),200); },[dec.confidence]);

  return (
    <div className="decision-wrap">
      <div className={`dec-card dec-${dec.signal}`}>
        {/* TOP: SIGNAL + CONFIDENCE */}
        <div className="dec-top">
          <div className="dec-signal">
            <div>
              <div className={`dec-badge ${dec.signal}`}>
                {dec.signal==="LONG"&&"▲ LONG"}{dec.signal==="SHORT"&&"▼ SHORT"}{dec.signal==="WAIT"&&"◆ TUNGGU"}
              </div>
              <div className="dec-sub">
                {dec.signal==="LONG"&&"BUKA POSISI BUY"}
                {dec.signal==="SHORT"&&"BUKA POSISI SELL"}
                {dec.signal==="WAIT"&&"JANGAN ENTRY SEKARANG"}
              </div>
            </div>
          </div>
          <div className="conf-wrap">
            <div className={`conf-num ${dec.signal}`}>{dec.confidence}%</div>
            <div className="conf-lbl">CONFIDENCE</div>
            <div className="conf-bar-wrap">
              <div className={`conf-bar-fill fill-${dec.signal}`} style={{width:`${fw}%`}}/>
            </div>
          </div>
        </div>

        {/* CONFLUENCE */}
        {dec.signal !== "WAIT" && (
          <div className={`conf-strip ${dec.confluence?"yes":"no"}`}>
            <span style={{fontSize:"14px"}}>{dec.confluence?"⚡":"⚠️"}</span>
            <span style={{fontSize:"11px",color:dec.confluence?"#00ff88":"#ffb400"}}>
              {dec.confluence ? "KONFLUENSI KUAT — 4H & 1H sama arah" : "KONFLUENSI PARSIAL — hanya 4H terkonfirmasi"}
            </span>
          </div>
        )}

        {/* 3-LAYER CHECKLIST */}
        <div className="layer-list">
          {dec.reasons.map((r,i)=>{
            const isPass = r.startsWith("✅");
            const isWarn = r.startsWith("⚠️");
            return (
              <div key={i} className="layer-item">
                <div className={`layer-icon ${isPass?"li-pass":isWarn?"li-warn":"li-fail"}`}>
                  {isPass?"✓":isWarn?"!":"✗"}
                </div>
                <span>{r.replace(/^[✅⚠️❌]\s*/,"")}</span>
              </div>
            );
          })}
        </div>

        {/* PRICE BOXES — hanya jika LONG/SHORT */}
        {dec.signal !== "WAIT" && dec.setup && <>
          <div className="price-boxes">
            <div className="pb pb-entry">
              <div className="pb-lbl">Entry</div>
              <div className="pb-val">${fmt(dec.setup.entry)}</div>
              <div className="pb-note">Harga masuk sekarang</div>
            </div>
            <div className="pb pb-sl">
              <div className="pb-lbl">Stop Loss</div>
              <div className="pb-val">${fmt(dec.setup.sl)}</div>
              <div className="pb-note">2% di {dec.signal==="LONG"?"bawah support":"atas resistance"}</div>
            </div>
            <div className="pb pb-tp">
              <div className="pb-lbl">Take Profit (Target)</div>
              <div className="pb-val">${fmt(dec.setup.tp)}</div>
              <div className="pb-note">Target profit dengan RR 1:3</div>
            </div>
          </div>
          <div className="rr-strip">
            <div><div style={{fontSize:"8px",color:"#4a6080",letterSpacing:"0.1em",marginBottom:"4px"}}>RISK / REWARD</div><div className="rr-big">1 : 3</div></div>
            <div className="rr-detail">{dec.setup.rrCalc}</div>
          </div>
        </>}

        {/* WAIT REASONS */}
        {dec.signal === "WAIT" && dec.waitReasons.length > 0 && (
          <div className="wait-box">
            <div className="wait-title">🎯 KENAPA WAIT — TUNGGU KONDISI INI:</div>
            {dec.waitReasons.map((r,i)=>(
              <div key={i} className="wait-item">
                <span style={{color:"#ffb400",flexShrink:0}}>→</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────
export default function App() {
  const [coinInput, setCoinInput] = useState("");
  const [activeCoin, setActiveCoin] = useState(null);
  const [d4, setD4] = useState(null);
  const [d1, setD1] = useState(null);
  const [decision, setDecision] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [manual, setManual] = useState("");
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoad, setChatLoad] = useState(false);
  const [activeTab, setActiveTab] = useState("signal");
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[chatMsgs, chatLoad]);

  async function fetchAndDecide(coin) {
    const sym = coin.toUpperCase().replace(/USDT$/,"");
    setFetching(true); setD4(null); setD1(null); setDecision(null);
    try {
      setFetchStatus(`Fetching ${sym}USDT dari BingX Futures…`);
      const [r4, r1] = await Promise.all([
        fetch(`${BACKEND_URL}/api/market?symbol=${sym}&timeframe=4h`),
        fetch(`${BACKEND_URL}/api/market?symbol=${sym}&timeframe=1h`),
      ]);
      const [j4, j1] = await Promise.all([r4.json(), r1.json()]);
      if (j4.error) throw new Error(j4.error);
      if (j1.error) throw new Error(j1.error);
      setD4(j4); setD1(j1);
      // Keputusan deterministik langsung — tanpa AI API
      const dec = makeDecision(j4, j1);
      setDecision(dec);
      setFetchStatus("");
      setActiveTab("signal");
    } catch(e) {
      setFetchStatus("");
      alert(`Error: ${e.message}`);
    } finally { setFetching(false); }
  }

  function handleAnalyze() {
    const coin = coinInput.trim() || activeCoin;
    if (!coin || fetching) return;
    setActiveCoin(coin.toUpperCase());
    fetchAndDecide(coin);
  }

  // Chat via backend proxy — API key aman di Vercel env variable
  async function handleChat() {
    const text = manual.trim();
    if (!text || chatLoad) return;
    const ctx = decision ? [
      `Pair: ${decision.pair} | Harga: $${decision.price}`,
      `Keputusan: ${decision.signal} | Confidence: ${decision.confidence}%`,
      decision.setup ? `Entry: $${decision.setup.entry} | SL: $${decision.setup.sl} | TP: $${decision.setup.tp}` : "",
      `Trend 4H: ${decision.layer1?.trend4h?"BULLISH":"BEARISH"} | Zone Long: ${decision.layer2?.inLongZone} | Zone Short: ${decision.layer2?.inShortZone}`,
      `S&R: R=${decision.sr?.nearestResistance||"—"} | S=${decision.sr?.nearestSupport||"—"}`,
      [...(decision.reasons||[]),...(decision.waitReasons||[])].join(" | "),
    ].filter(Boolean).join("\n") : "";
    setChatMsgs(prev=>[...prev,{role:"user",content:text}]);
    setManual("");
    const nh = [...chatHistory, {role:"user", content:text}];
    setChatHistory(nh);
    setChatLoad(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nh, context: ctx }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const at = data.text || "Tidak ada respons";
      setChatHistory([...nh, {role:"assistant", content:at}]);
      setChatMsgs(prev=>[...prev,{role:"assistant",content:at}]);
    } catch(e) {
      setChatMsgs(prev=>[...prev,{role:"assistant",content:`❌ ${e.message}`}]);
    } finally { setChatLoad(false); }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* HEADER */}
        <div className="hdr">
          <div className="logo">AI</div>
          <div className="hdr-t">
            <h1>TRADING AGENT — MA × VMC × S&R</h1>
            <p>BINGX FUTURES LIVE · 3-LAYER DECISION · RR 1:3</p>
          </div>
          <div className="hdr-r">
            <span className="bdg bdg-p">S&R</span>
            <span className="bdg bdg-g">RR 1:3</span>
            <span className="live-i"><span className="dot-l"/>LIVE</span>
          </div>
        </div>

        {/* COIN INPUT */}
        <div className="coin-sec">
          <div className="sec-lbl">Masukkan nama coin → keputusan otomatis</div>
          <div className="coin-row">
            <input className="coin-inp" placeholder="BTC, ETH, SOL…" value={coinInput}
              onChange={e=>setCoinInput(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&handleAnalyze()}/>
            <button className="ana-btn" onClick={handleAnalyze} disabled={(!coinInput.trim()&&!activeCoin)||fetching}>
              {fetching?"Fetching…":"🔍 Analisis"}
            </button>
          </div>
          {fetching && <div className="fetch-s"><div className="spin"/>{fetchStatus}</div>}
          <div className="sec-lbl" style={{marginBottom:"6px"}}>Populer</div>
          <div className="pop-c">
            {POPULAR.map(c=>(
              <button key={c} className={`c-chip${activeCoin===c?" active":""}`}
                onClick={()=>{setActiveCoin(c);setCoinInput(c);}}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* TABS */}
        {(d4||decision) && (
          <div style={{display:"flex",borderBottom:"1px solid rgba(0,255,136,0.1)",background:"rgba(0,0,0,0.3)"}}>
            {[["signal","🎯 Keputusan"],["data","📊 Data"],["chat","💬 Tanya AI"]].map(([k,v])=>(
              <button key={k} style={{flex:1,padding:"9px 4px",fontSize:"9px",fontFamily:"'Syne',sans-serif",
                fontWeight:"700",letterSpacing:"0.05em",textAlign:"center",cursor:"pointer",
                color:activeTab===k?"#00ff88":"#3a5060",border:"none",background:"none",
                borderBottom:activeTab===k?"2px solid #00ff88":"none",
                transition:"all 0.2s",textTransform:"uppercase"}}
                onClick={()=>setActiveTab(k)}>{v}</button>
            ))}
          </div>
        )}

        {/* SIGNAL TAB — KEPUTUSAN UTAMA */}
        {activeTab==="signal" && (
          <div style={{flex:1,overflowY:"auto",paddingBottom:"16px"}}>
            {!decision && !fetching && (
              <div style={{padding:"20px 14px"}}>
                <div className="welcome">
                  <h2>Trading Agent <span>v6</span></h2>
                  <p>Ketik nama coin → agent fetch data BingX Futures → evaluasi 3-layer → keluarkan <strong style={{color:"#00ff88"}}>KEPUTUSAN FINAL</strong> langsung tanpa perlu input manual.</p>
                  <div className="flow">
                    {[["1","Fetch data BingX Futures (4H + 1H)"],["2","Layer 1: Cek trend MA13/21 + VuManChu"],["3","Layer 2: Cek posisi vs Support & Resistance"],["4","Layer 3: Hitung SL & TP (RR 1:3)"],["5","Output: LONG / SHORT / WAIT + alasan"]].map(([n,t])=>(
                      <div key={n} className="flow-item"><div className="flow-n">{n}</div><span>{t}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {decision && <DecisionCard dec={decision}/>}
          </div>
        )}

        {/* DATA TAB */}
        {activeTab==="data" && (
          <div style={{flex:1,overflowY:"auto",paddingBottom:"16px"}}>
            <LiveCard d4={d4} d1={d1}/>
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab==="chat" && (
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div className="msgs">
              {chatMsgs.length===0 && (
                <div style={{padding:"12px 0",fontSize:"11px",color:"#3a5060",lineHeight:"1.8",textAlign:"center"}}>
                  Tanya apapun tentang analisis ini.<br/>
                  Contoh: "Kenapa WAIT?", "Kapan bisa entry?", "Jelaskan kondisi VMC"
                </div>
              )}
              {chatMsgs.map((m,i)=>(
                <div key={i} className={`msg ${m.role}`}>
                  <div className={`av ${m.role==="assistant"?"av-a":"av-u"}`}>{m.role==="user"?"TM":"AI"}</div>
                  <div className="mc"><div className="bbl">{m.content}</div></div>
                </div>
              ))}
              {chatLoad && <div className="ldm msg"><div className="av av-a">AI</div><div className="ldd"><div className="ld"/><div className="ld"/><div className="ld"/></div></div>}
              <div ref={endRef}/>
            </div>
            <div className="inp-a">
              <div className="inp-r">
                <div className="iw">
                  <textarea className="ti" placeholder="Tanya tentang analisis ini…" value={manual}
                    onChange={e=>setManual(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleChat();}}} rows={1}/>
                </div>
                <button className="sb" onClick={handleChat} disabled={!manual.trim()||chatLoad}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#080c14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div className="hint">Tanya tentang hasil analisis · keputusan dibuat otomatis oleh rules 3-layer</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
