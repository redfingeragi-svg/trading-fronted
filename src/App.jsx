import { useState, useEffect, useRef } from "react";

// ─── GANTI DENGAN URL BACKEND VERCEL KAMU ─────────────────────
const BACKEND_URL = "https://trading-backend-nu.vercel.app";
// ─── GANTI DENGAN ANTHROPIC API KEY KAMU ──────────────────────
// Dapatkan di: https://console.anthropic.com/
const ANTHROPIC_KEY = "MASUKKAN_API_KEY_KAMU_DISINI";
// ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Kamu adalah AI Trading Agent crypto dengan 3-layer decision system:

═══ LAYER 1 — TREND (MA13/21 + VuManChu) ═══
• BULLISH: MA13 > MA21 + VMC hijau/green circle + MF positif → kandidat LONG
• BEARISH: MA13 < MA21 + VMC merah/red circle + MF negatif → kandidat SHORT
• WAIT: MA separation < 0.05% (ranging) atau sinyal bertentangan

═══ LAYER 2 — POSISI (Support & Resistance) ═══
• LONG: entry hanya jika harga dalam 2.5% DI ATAS support terdekat
• SHORT: entry hanya jika harga dalam 2.5% DI BAWAH resistance terdekat
• Di luar zona → WAIT + jelaskan berapa jauh ke zona

═══ LAYER 3 — RISK MANAGEMENT WAJIB 1:3 ═══
• SL LONG:  support × 0.98  (2% di bawah support)
• SL SHORT: resistance × 1.02 (2% di atas resistance)
• TP = entry ± (jarak_SL × 3)
• Kalkulasi eksplisit: entry, SL, TP, Risk, Reward, RR 1:3

FORMAT RESPONS (JSON saja):
{
  "signal": "LONG"|"SHORT"|"WAIT",
  "confidence": 0-100,
  "trendAnalysis": "analisis MA + VMC kedua TF",
  "srAnalysis": "analisis posisi vs S&R + entry zone",
  "entryZoneStatus": "IN ZONE / APPROACHING / OUT OF ZONE + jarak",
  "entry": "harga entry",
  "stopLoss": "harga SL + penjelasan",
  "takeProfit": "harga TP",
  "rrCalc": "Risk: X | Reward: Y | RR: 1:3",
  "tf4hSummary": "ringkasan 4H",
  "tf1hSummary": "ringkasan 1H",
  "confluence": "konfluensi kedua TF",
  "nextActionIfWait": "kondisi yang harus ditunggu",
  "warning": "peringatan atau null",
  "timeframe": "4H + 1H"
}`;

const POPULAR = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","DOT","MATIC","LINK","LTC","ATOM","UNI","APT"];

function parseSignal(text) {
  try {
    const m = text.replace(/```json|```/g,"").trim().match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch(e) {}
  return null;
}

function fmt(n, d=2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: 4});
}

// ── STYLES ───────────────────────────────────────────────────────
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-tap-highlight-color: transparent; }
  body {
    background: #080c14;
    color: #e2e8f0;
    font-family: 'Space Mono', monospace;
    overscroll-behavior: none;
  }

  :root {
    --green: #00ff88;
    --cyan: #00c4ff;
    --red: #ff5050;
    --gold: #ffb400;
    --purple: #a080ff;
    --bg: #080c14;
    --bg2: #0d1421;
    --border: rgba(0,255,136,0.12);
  }

  .app {
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--bg);
    background-image:
      radial-gradient(ellipse 80% 40% at 50% -10%, rgba(0,255,136,0.08) 0%, transparent 60%),
      linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%);
    display: flex;
    flex-direction: column;
    max-width: 600px;
    margin: 0 auto;
  }

  /* HEADER */
  .hdr {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(16px);
    position: sticky; top: 0; z-index: 100;
  }
  .logo {
    width: 34px; height: 34px;
    background: linear-gradient(135deg, var(--green), var(--cyan));
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 11px; color: var(--bg);
    flex-shrink: 0; font-family: 'Syne', sans-serif;
  }
  .hdr-t h1 { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 800; color: var(--green); letter-spacing: 0.04em; line-height: 1; }
  .hdr-t p { font-size: 8px; color: #3a5060; letter-spacing: 0.06em; margin-top: 3px; }
  .hdr-r { margin-left: auto; display: flex; align-items: center; gap: 5px; }
  .bdg { border-radius: 20px; padding: 3px 9px; font-size: 8px; font-family: 'Syne', sans-serif; font-weight: 700; }
  .bdg-g { background: rgba(0,255,136,0.12); border: 1px solid rgba(0,255,136,0.3); color: var(--green); }
  .bdg-b { background: rgba(0,196,255,0.1); border: 1px solid rgba(0,196,255,0.25); color: var(--cyan); }
  .bdg-p { background: rgba(120,80,255,0.1); border: 1px solid rgba(120,80,255,0.25); color: var(--purple); }
  .live-i { display: flex; align-items: center; gap: 4px; font-size: 8px; color: #4a6080; }
  .dot-l { width: 6px; height: 6px; background: var(--green); border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }

  /* COIN INPUT */
  .coin-sec { padding: 12px 14px 10px; border-bottom: 1px solid rgba(0,255,136,0.08); background: rgba(0,0,0,0.2); }
  .sec-lbl { font-size: 8px; color: #3a5060; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 7px; }
  .coin-row { display: flex; gap: 7px; align-items: center; margin-bottom: 9px; }
  .coin-inp {
    flex: 1; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(0,255,136,0.2); border-radius: 10px;
    padding: 10px 13px; font-size: 15px; font-weight: 700;
    color: var(--green); font-family: 'Syne', sans-serif;
    outline: none; letter-spacing: 0.08em; text-transform: uppercase;
    transition: border-color 0.2s;
  }
  .coin-inp::placeholder { color: #2a4055; font-size: 11px; font-weight: 400; text-transform: none; }
  .coin-inp:focus { border-color: rgba(0,255,136,0.5); box-shadow: 0 0 0 3px rgba(0,255,136,0.06); }
  .ana-btn {
    background: linear-gradient(135deg, var(--green), var(--cyan));
    border: none; border-radius: 10px; padding: 10px 16px;
    font-size: 12px; font-weight: 700; color: var(--bg);
    font-family: 'Syne', sans-serif; cursor: pointer;
    transition: all 0.2s; white-space: nowrap; letter-spacing: 0.04em;
  }
  .ana-btn:active { transform: scale(0.96); }
  .ana-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .pop-c { display: flex; gap: 5px; flex-wrap: wrap; }
  .c-chip {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 5px; padding: 4px 10px; font-size: 10px; color: #5a7080;
    cursor: pointer; transition: all 0.15s; font-family: 'Syne', sans-serif; font-weight: 600;
  }
  .c-chip:active { background: rgba(0,255,136,0.1); }
  .c-chip.active { background: rgba(0,255,136,0.12); border-color: rgba(0,255,136,0.5); color: var(--green); }
  .fetch-s { display: flex; align-items: center; gap: 7px; font-size: 10px; color: #4a6080; padding: 6px 0; }
  .spin { width: 13px; height: 13px; border: 2px solid rgba(0,255,136,0.2); border-top-color: var(--green); border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* LIVE DATA CARD */
  .live-card { margin: 10px 14px 0; background: rgba(0,0,0,0.35); border: 1px solid rgba(0,255,136,0.1); border-radius: 12px; overflow: hidden; }
  .lc-hdr { display: flex; align-items: center; justify-content: space-between; padding: 9px 13px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .lc-pair { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 800; color: #fff; }
  .lc-price { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800; color: var(--green); }
  .lc-src { font-size: 8px; color: #3a5060; margin-top: 2px; }
  .lc-tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .lc-tab { flex: 1; padding: 8px 4px; font-size: 9px; font-family: 'Syne', sans-serif; font-weight: 600; letter-spacing: 0.05em; text-align: center; cursor: pointer; color: #3a5060; border: none; background: none; transition: all 0.2s; }
  .lc-tab.active { color: var(--green); border-bottom: 2px solid var(--green); background: rgba(0,255,136,0.04); }
  .lc-body { padding: 10px 13px; }
  .dg { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 8px; }
  .dc { background: rgba(255,255,255,0.025); border-radius: 6px; padding: 6px 8px; }
  .dc-l { font-size: 8px; color: #3a5060; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 3px; }
  .dc-v { font-size: 10px; font-weight: 700; color: #c8d8e8; }
  .dc-v.g { color: var(--green); } .dc-v.r { color: var(--red); } .dc-v.o { color: var(--gold); } .dc-v.b { color: var(--cyan); }
  .sp { border-radius: 5px; padding: 3px 9px; font-size: 10px; font-weight: 700; font-family: 'Syne', sans-serif; display: inline-flex; align-items: center; gap: 4px; }
  .sp-g { background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); color: var(--green); }
  .sp-r { background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.3); color: var(--red); }
  .sp-b { background: rgba(0,196,255,0.1); border: 1px solid rgba(0,196,255,0.25); color: var(--cyan); }
  .sp-n { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #5a7080; }
  .sr-row { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 5px; }
  .sr-r { background: rgba(255,80,80,0.08); border: 1px solid rgba(255,80,80,0.2); border-radius: 4px; padding: 2px 8px; font-size: 9px; font-weight: 700; color: #ff7070; }
  .sr-s { background: rgba(0,255,136,0.07); border: 1px solid rgba(0,255,136,0.2); border-radius: 4px; padding: 2px 8px; font-size: 9px; font-weight: 700; color: #00cc70; }
  .ez { border-radius: 8px; padding: 9px 11px; border: 1px solid; margin-bottom: 7px; }
  .ez-l { background: rgba(0,255,136,0.04); border-color: rgba(0,255,136,0.2); }
  .ez-s { background: rgba(255,80,80,0.04); border-color: rgba(255,80,80,0.2); }
  .ez-w { background: rgba(255,180,0,0.04); border-color: rgba(255,180,0,0.15); }
  .ez-title { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 7px; font-family: 'Syne', sans-serif; font-weight: 700; }
  .ez-title.l { color: var(--green); } .ez-title.s { color: var(--red); } .ez-title.w { color: var(--gold); }
  .ez-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .ef { font-size: 9px; } .ef-l { color: #3a5060; margin-bottom: 1px; } .ef-v { font-weight: 700; font-family: 'Syne', sans-serif; }
  .ef-v.g { color: var(--green); } .ef-v.r { color: var(--red); } .ef-v.o { color: var(--gold); } .ef-v.b { color: var(--cyan); }

  /* MESSAGES */
  .msgs { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 11px; -webkit-overflow-scrolling: touch; }
  .msg { display: flex; gap: 8px; animation: fadeUp 0.3s ease; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .msg.user { flex-direction: row-reverse; }
  .av { width: 27px; height: 27px; border-radius: 7px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; margin-top: 2px; }
  .av-a { background: linear-gradient(135deg, var(--green), var(--cyan)); color: var(--bg); font-family: 'Syne', sans-serif; }
  .av-u { background: rgba(255,255,255,0.08); color: #8899aa; }
  .mc { max-width: 87%; }
  .bbl { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 13px; font-size: 12px; line-height: 1.7; color: #c8d8e8; }
  .msg.user .bbl { background: rgba(0,255,136,0.07); border-color: rgba(0,255,136,0.15); color: #e2e8f0; }

  /* SIGNAL CARD */
  .sc { border-radius: 12px; padding: 13px; border: 1px solid; }
  .sc-LONG { background: rgba(0,255,136,0.06); border-color: rgba(0,255,136,0.3); }
  .sc-SHORT { background: rgba(255,80,80,0.06); border-color: rgba(255,80,80,0.3); }
  .sc-WAIT { background: rgba(255,180,0,0.06); border-color: rgba(255,180,0,0.25); }
  .sh { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; }
  .sb_ { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 800; letter-spacing: 0.08em; }
  .b-LONG{color:var(--green)} .b-SHORT{color:var(--red)} .b-WAIT{color:var(--gold)}
  .cb_ { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
  .cf_ { height: 100%; border-radius: 2px; transition: width 1s ease; }
  .f-LONG{background:linear-gradient(90deg,var(--green),var(--cyan))}
  .f-SHORT{background:linear-gradient(90deg,var(--red),#ff8080)}
  .f-WAIT{background:linear-gradient(90deg,var(--gold),#ffcc44)}
  .cv_ { font-size: 9px; color: #4a6080; white-space: nowrap; }
  .lb { border-radius: 8px; padding: 9px 11px; margin-bottom: 7px; }
  .lb-t { background: rgba(0,196,255,0.04); border: 1px solid rgba(0,196,255,0.15); }
  .lb-s { background: rgba(120,80,255,0.04); border: 1px solid rgba(120,80,255,0.2); }
  .lb-r { background: linear-gradient(135deg,rgba(255,180,0,0.07),rgba(0,255,136,0.04)); border: 1px solid rgba(255,180,0,0.25); }
  .lb-lbl { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 5px; font-family: 'Syne', sans-serif; font-weight: 700; }
  .lb-t .lb-lbl{color:var(--cyan)} .lb-s .lb-lbl{color:var(--purple)} .lb-r .lb-lbl{color:var(--gold)}
  .lb-txt { font-size: 11px; color: #8899aa; line-height: 1.6; }
  .rr-row { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; }
  .rr-l { font-size: 8px; color: var(--gold); letter-spacing: 0.1em; text-transform: uppercase; }
  .rr-v { font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 800; color: var(--gold); }
  .rr-c { font-size: 9px; color: #6a8099; margin-left: auto; text-align: right; line-height: 1.5; }
  .pg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 7px; }
  .pf { background: rgba(0,0,0,0.22); border-radius: 6px; padding: 7px 9px; }
  .pf-l { font-size: 8px; color: #3a5060; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 3px; }
  .pf-v { font-size: 11px; font-weight: 700; color: #c8d8e8; }
  .zs { border-radius: 7px; padding: 8px 11px; margin-bottom: 7px; font-size: 11px; line-height: 1.6; }
  .zs-i { background: rgba(0,255,136,0.06); border: 1px solid rgba(0,255,136,0.2); color: #8899aa; }
  .zs-w { background: rgba(255,180,0,0.06); border: 1px solid rgba(255,180,0,0.2); color: #8899aa; }
  .zs-t { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; font-family: 'Syne', sans-serif; font-weight: 700; }
  .zs-i .zs-t{color:var(--green)} .zs-w .zs-t{color:var(--gold)}
  .tfg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 7px; }
  .tfb { border-radius: 7px; padding: 8px 10px; font-size: 10px; color: #7a8fa0; line-height: 1.5; }
  .tfb.h4 { background: rgba(0,196,255,0.04); border: 1px solid rgba(0,196,255,0.15); }
  .tfb.h1 { background: rgba(120,80,255,0.04); border: 1px solid rgba(120,80,255,0.2); }
  .tfb-t { font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; font-family: 'Syne', sans-serif; }
  .tfb.h4 .tfb-t{color:var(--cyan)} .tfb.h1 .tfb-t{color:var(--purple)}
  .cnf { background: linear-gradient(135deg,rgba(0,255,136,0.05),rgba(120,80,255,0.05)); border: 1px solid rgba(0,255,136,0.2); border-radius: 7px; padding: 8px 11px; margin-top: 7px; }
  .cnf-t { font-size: 8px; color: var(--green); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
  .cnf-x { font-size: 11px; color: #8899aa; line-height: 1.6; }
  .sw_ { background: rgba(255,180,0,0.08); border: 1px solid rgba(255,180,0,0.2); border-radius: 6px; padding: 7px 10px; font-size: 10px; color: var(--gold); margin-top: 7px; line-height: 1.5; }

  /* LOADING */
  .ldm { display: flex; gap: 8px; align-items: flex-start; }
  .ldd { display: flex; gap: 4px; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
  .ld { width: 5px; height: 5px; background: var(--green); border-radius: 50%; animation: bounce 1.2s infinite; }
  .ld:nth-child(2){animation-delay:0.2s} .ld:nth-child(3){animation-delay:0.4s}
  @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:0.4} 40%{transform:translateY(-6px);opacity:1} }

  /* INPUT AREA */
  .inp-a { padding: 9px 14px 16px; border-top: 1px solid rgba(0,255,136,0.08); background: rgba(0,0,0,0.3); }
  .inp-r { display: flex; gap: 7px; align-items: flex-end; }
  .iw { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(0,255,136,0.12); border-radius: 10px; overflow: hidden; transition: border-color 0.2s; }
  .iw:focus-within { border-color: rgba(0,255,136,0.35); }
  .ti { width: 100%; background: none; border: none; outline: none; padding: 10px 12px; font-size: 13px; color: #e2e8f0; font-family: 'Space Mono', monospace; resize: none; max-height: 80px; line-height: 1.5; }
  .ti::placeholder { color: #1e3040; }
  .sb2 { width: 42px; height: 42px; background: linear-gradient(135deg,var(--green),var(--cyan)); border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.15s; }
  .sb2:active { transform: scale(0.92); }
  .sb2:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
  .hint { font-size: 9px; color: #1a2f40; margin-top: 7px; }

  /* CONFIG WARNING */
  .cfg-warn { background: rgba(255,180,0,0.08); border: 1px solid rgba(255,180,0,0.25); border-radius: 10px; padding: 12px 14px; margin: 10px 14px 0; font-size: 11px; color: var(--gold); line-height: 1.7; }
  .cfg-warn strong { display: block; margin-bottom: 4px; font-family: 'Syne', sans-serif; }
  .cfg-warn code { background: rgba(0,0,0,0.3); padding: 1px 6px; border-radius: 4px; color: var(--green); font-size: 10px; }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,255,136,0.15); border-radius: 2px; }
`;

function MaPill({d}) {
  if (!d) return null;
  if (d.goldenCross) return <span className="sp sp-g">⚡ GOLDEN CROSS</span>;
  if (d.deathCross) return <span className="sp sp-r">⚡ DEATH CROSS</span>;
  if (d.trendBullish) return <span className="sp sp-b">▲ BULLISH</span>;
  return <span className="sp sp-r">▼ BEARISH</span>;
}

function VmcPill({vmc}) {
  if (!vmc) return <span className="sp sp-n">–</span>;
  if (vmc.circle === "GREEN_CIRCLE") return <span className="sp sp-g">🟢 GREEN CIRCLE</span>;
  if (vmc.circle === "RED_CIRCLE") return <span className="sp sp-r">🔴 RED CIRCLE</span>;
  if (vmc.dot === "GREEN") return <span className="sp sp-g">● DOT HIJAU</span>;
  if (vmc.dot === "RED") return <span className="sp sp-r">● DOT MERAH</span>;
  return <span className="sp sp-n">◌ NONE</span>;
}

function LiveCard({d4, d1}) {
  const [tab, setTab] = useState("ma");
  if (!d4) return null;
  const ez = d4.entryZone;
  return (
    <div className="live-card">
      <div className="lc-hdr">
        <div>
          <div className="lc-pair">{d4.pair}</div>
          <div className="lc-src">BingX Live · {new Date(d4.timestamp).toLocaleTimeString("id-ID")}</div>
        </div>
        <div className="lc-price">${fmt(d4.currentPrice, 4)}</div>
      </div>
      <div className="lc-tabs">
        {[["ma","MA + VMC"],["sr","S&R"],["zone","Entry Zone"]].map(([k,v])=>(
          <button key={k} className={`lc-tab${tab===k?" active":""}`} onClick={()=>setTab(k)}>{v}</button>
        ))}
      </div>
      <div className="lc-body">
        {tab==="ma" && <>
          <div style={{fontSize:"8px",color:"#3a5060",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:"6px"}}>4H ▸ Trend Utama</div>
          <div className="dg">
            <div className="dc"><div className="dc-l">MA 13</div><div className="dc-v">{d4.ma13}</div></div>
            <div className="dc"><div className="dc-l">MA 21</div><div className="dc-v">{d4.ma21}</div></div>
            <div className="dc" style={{gridColumn:"1/-1"}}><div className="dc-l">Status 4H</div><MaPill d={d4}/></div>
            <div className="dc"><div className="dc-l">VMC 4H</div><VmcPill vmc={d4.vmc}/></div>
            <div className="dc"><div className="dc-l">Money Flow</div><div className={`dc-v ${d4.vmc?.moneyFlow>0?"g":"r"}`}>{d4.vmc?.moneyFlow>0?"+":""}{d4.vmc?.moneyFlow}</div></div>
          </div>
          {d1 && <>
            <div style={{fontSize:"8px",color:"#3a5060",letterSpacing:"0.08em",textTransform:"uppercase",margin:"8px 0 6px"}}>1H ▸ Entry Timing</div>
            <div className="dg">
              <div className="dc"><div className="dc-l">MA 13</div><div className="dc-v">{d1.ma13}</div></div>
              <div className="dc"><div className="dc-l">MA 21</div><div className="dc-v">{d1.ma21}</div></div>
              <div className="dc" style={{gridColumn:"1/-1"}}><div className="dc-l">Status 1H</div><MaPill d={d1}/></div>
              <div className="dc"><div className="dc-l">VMC 1H</div><VmcPill vmc={d1.vmc}/></div>
              <div className="dc"><div className="dc-l">Money Flow</div><div className={`dc-v ${d1.vmc?.moneyFlow>0?"g":"r"}`}>{d1.vmc?.moneyFlow>0?"+":""}{d1.vmc?.moneyFlow}</div></div>
            </div>
          </>}
        </>}
        {tab==="sr" && <div>
          <div style={{fontSize:"8px",color:"#ff7070",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:"5px"}}>🔴 Resistance</div>
          <div className="sr-row">{d4.sr?.resistanceLevels?.length ? d4.sr.resistanceLevels.map((r,i)=><span key={i} className="sr-r">R{i+1}: ${r}</span>) : <span style={{fontSize:"10px",color:"#3a5060"}}>—</span>}</div>
          <div style={{fontSize:"8px",color:"#00cc70",letterSpacing:"0.08em",textTransform:"uppercase",margin:"8px 0 5px"}}>🟢 Support</div>
          <div className="sr-row">{d4.sr?.supportLevels?.length ? d4.sr.supportLevels.map((s,i)=><span key={i} className="sr-s">S{i+1}: ${s}</span>) : <span style={{fontSize:"10px",color:"#3a5060"}}>—</span>}</div>
          <div className="dg" style={{marginTop:"10px"}}>
            <div className="dc"><div className="dc-l">Nearest Res.</div><div className="dc-v r">{d4.sr?.nearestResistance?"$"+d4.sr.nearestResistance:"—"}</div></div>
            <div className="dc"><div className="dc-l">Nearest Sup.</div><div className="dc-v g">{d4.sr?.nearestSupport?"$"+d4.sr.nearestSupport:"—"}</div></div>
          </div>
        </div>}
        {tab==="zone" && <>
          {ez?.long && <div className={`ez ${ez.long.inZone?"ez-l":"ez-w"}`}>
            <div className={`ez-title ${ez.long.inZone?"l":"w"}`}>{ez.long.inZone?"✅ DALAM ZONA LONG":"⏳ ZONA LONG (belum)"}</div>
            <div className="ez-grid">
              <div className="ef"><div className="ef-l">Support</div><div className="ef-v g">${ez.long.supportLevel}</div></div>
              <div className="ef"><div className="ef-l">Zona</div><div className="ef-v b">${ez.long.entryZoneMin}–${ez.long.entryZoneMax}</div></div>
              <div className="ef"><div className="ef-l">SL (2% bawah)</div><div className="ef-v r">${ez.long.sl}</div></div>
              <div className="ef"><div className="ef-l">Jarak</div><div className="ef-v o">{ez.long.distancePct}</div></div>
              {ez.long.tp && <div className="ef"><div className="ef-l">TP 1:3</div><div className="ef-v g">${ez.long.tp}</div></div>}
              {ez.long.rrCalc && <div className="ef" style={{gridColumn:"1/-1"}}><div className="ef-l">RR</div><div className="ef-v o">{ez.long.rrCalc}</div></div>}
            </div>
          </div>}
          {ez?.short && <div className={`ez ${ez.short.inZone?"ez-s":"ez-w"}`}>
            <div className={`ez-title ${ez.short.inZone?"s":"w"}`}>{ez.short.inZone?"✅ DALAM ZONA SHORT":"⏳ ZONA SHORT (belum)"}</div>
            <div className="ez-grid">
              <div className="ef"><div className="ef-l">Resistance</div><div className="ef-v r">${ez.short.resistanceLevel}</div></div>
              <div className="ef"><div className="ef-l">Zona</div><div className="ef-v b">${ez.short.entryZoneMin}–${ez.short.entryZoneMax}</div></div>
              <div className="ef"><div className="ef-l">SL (2% atas)</div><div className="ef-v r">${ez.short.sl}</div></div>
              <div className="ef"><div className="ef-l">Jarak</div><div className="ef-v o">{ez.short.distancePct}</div></div>
              {ez.short.tp && <div className="ef"><div className="ef-l">TP 1:3</div><div className="ef-v g">${ez.short.tp}</div></div>}
              {ez.short.rrCalc && <div className="ef" style={{gridColumn:"1/-1"}}><div className="ef-l">RR</div><div className="ef-v o">{ez.short.rrCalc}</div></div>}
            </div>
          </div>}
        </>}
      </div>
    </div>
  );
}

function SignalCard({signal}) {
  const [fw, setFw] = useState(0);
  useEffect(()=>{setTimeout(()=>setFw(signal.confidence||0),100)},[signal.confidence]);
  return (
    <div className={`sc sc-${signal.signal}`}>
      <div className="sh">
        <span className={`sb_ b-${signal.signal}`}>
          {signal.signal==="LONG"&&"▲ LONG"}{signal.signal==="SHORT"&&"▼ SHORT"}{signal.signal==="WAIT"&&"◆ WAIT"}
        </span>
        <div className="cb_"><div className={`cf_ f-${signal.signal}`} style={{width:`${fw}%`}}/></div>
        <span className="cv_">{signal.confidence}% conf.</span>
      </div>
      {signal.trendAnalysis && <div className="lb lb-t"><div className="lb-lbl">Layer 1 — Trend MA + VMC</div><div className="lb-txt">{signal.trendAnalysis}</div></div>}
      {signal.srAnalysis && <div className="lb lb-s"><div className="lb-lbl">Layer 2 — Support & Resistance</div><div className="lb-txt">{signal.srAnalysis}</div></div>}
      {signal.rrCalc && <div className="lb lb-r">
        <div className="lb-lbl">Layer 3 — Risk Management</div>
        <div className="rr-row"><div><div className="rr-l">Risk/Reward</div><div className="rr-v">1 : 3</div></div><div className="rr-c">{signal.rrCalc}</div></div>
        <div className="pg" style={{margin:"7px 0 0"}}>
          {signal.entry && <div className="pf"><div className="pf-l">Entry</div><div className="pf-v">{signal.entry}</div></div>}
          {signal.stopLoss && <div className="pf"><div className="pf-l">Stop Loss</div><div className="pf-v" style={{color:"var(--red)"}}>{signal.stopLoss}</div></div>}
          {signal.takeProfit && <div className="pf" style={{gridColumn:"1/-1"}}><div className="pf-l">Take Profit (1:3)</div><div className="pf-v" style={{color:"var(--green)",fontSize:"13px"}}>{signal.takeProfit}</div></div>}
        </div>
      </div>}
      {signal.entryZoneStatus && <div className={`zs ${signal.signal!=="WAIT"?"zs-i":"zs-w"}`}><div className="zs-t">{signal.signal!=="WAIT"?"✅ Entry Zone":"⏳ Entry Zone"}</div>{signal.entryZoneStatus}</div>}
      {signal.nextActionIfWait && signal.signal==="WAIT" && <div className="zs zs-w" style={{marginTop:0}}><div className="zs-t">🎯 Tunggu Kondisi Ini</div>{signal.nextActionIfWait}</div>}
      {(signal.tf4hSummary||signal.tf1hSummary) && <div className="tfg">
        {signal.tf4hSummary && <div className="tfb h4"><div className="tfb-t">📊 4H Trend</div>{signal.tf4hSummary}</div>}
        {signal.tf1hSummary && <div className="tfb h1"><div className="tfb-t">📊 1H Entry</div>{signal.tf1hSummary}</div>}
      </div>}
      {signal.confluence && <div className="cnf"><div className="cnf-t">⚡ Konfluensi</div><div className="cnf-x">{signal.confluence}</div></div>}
      {signal.warning && <div className="sw_">⚠ {signal.warning}</div>}
    </div>
  );
}

export default function App() {
  const [coinInput, setCoinInput] = useState("");
  const [activeCoin, setActiveCoin] = useState(null);
  const [d4, setD4] = useState(null);
  const [d1, setD1] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [manual, setManual] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, aiLoad, fetching]);

  const backendReady = !BACKEND_URL.includes("ISI");
  const keyReady = !ANTHROPIC_KEY.includes("MASUKKAN");

  async function fetchData(coin) {
    const sym = coin.toUpperCase().replace(/USDT$/,"");
    setFetching(true); setD4(null); setD1(null);
    try {
      setFetchStatus(`Fetching ${sym}USDT dari BingX…`);
      const [r4, r1] = await Promise.all([
        fetch(`${BACKEND_URL}/api/market?symbol=${sym}&timeframe=4h`),
        fetch(`${BACKEND_URL}/api/market?symbol=${sym}&timeframe=1h`),
      ]);
      const [j4, j1] = await Promise.all([r4.json(), r1.json()]);
      if (j4.error) throw new Error(j4.error);
      if (j1.error) throw new Error(j1.error);
      setD4(j4); setD1(j1);
      setFetchStatus("");
      return { j4, j1 };
    } catch(e) {
      setFetchStatus("");
      setMessages(prev=>[...prev,{role:"assistant",content:`❌ Error fetch: ${e.message}`,signal:null}]);
      return null;
    } finally { setFetching(false); }
  }

  async function analyzeWithAI(coin, data4h, data1h) {
    setAiLoad(true);
    const ez = data4h.entryZone;
    const txt = `Analisis ${coin.toUpperCase()}USDT — DATA LIVE BINGX:

═══ DATA 4H ═══
Harga: $${data4h.currentPrice} | Candle: ${data4h.lastCandleBullish?"BULLISH":"BEARISH"}
MA13: ${data4h.ma13} | MA21: ${data4h.ma21} | Sep: ${data4h.maSeparation}
Status: ${data4h.maStatus} | Trend: ${data4h.trendBullish?"BULLISH":"BEARISH"}
VMC Dot: ${data4h.vmc.dot} | Circle: ${data4h.vmc.circle}
WT1: ${data4h.vmc.wt1} | WT2: ${data4h.vmc.wt2}
OB: ${data4h.vmc.isOverbought} | OS: ${data4h.vmc.isOversold}
Money Flow: ${data4h.vmc.moneyFlow} (${data4h.vmc.moneyFlowLabel})

═══ DATA 1H ═══
MA13: ${data1h.ma13} | MA21: ${data1h.ma21} | Sep: ${data1h.maSeparation}
Status: ${data1h.maStatus} | Trend: ${data1h.trendBullish?"BULLISH":"BEARISH"}
VMC Dot: ${data1h.vmc.dot} | Circle: ${data1h.vmc.circle}
Money Flow: ${data1h.vmc.moneyFlow} (${data1h.vmc.moneyFlowLabel})
Candle: ${data1h.lastCandleBullish?"BULLISH":"BEARISH"}

═══ SUPPORT & RESISTANCE ═══
Resistance: ${data4h.sr.resistanceLevels.join(", ")||"—"}
Support: ${data4h.sr.supportLevels.join(", ")||"—"}
Nearest Resistance: ${data4h.sr.nearestResistance||"—"}
Nearest Support: ${data4h.sr.nearestSupport||"—"}

═══ ENTRY ZONE ═══
LONG [${ez.long?.entryZoneMin}–${ez.long?.entryZoneMax}] IN: ${ez.long?.inZone?"YA ✅":"TIDAK ❌"} | SL: ${ez.long?.sl} | TP: ${ez.long?.tp||"—"} | ${ez.long?.rrCalc||""}
SHORT [${ez.short?.entryZoneMin}–${ez.short?.entryZoneMax}] IN: ${ez.short?.inZone?"YA ✅":"TIDAK ❌"} | SL: ${ez.short?.sl} | TP: ${ez.short?.tp||"—"} | ${ez.short?.rrCalc||""}
Valid Long: ${ez.validLong?"YA":"TIDAK"} | Valid Short: ${ez.validShort?"YA":"TIDAK"}

Berikan keputusan trading dengan 3-layer rules.`;

    setMessages(prev=>[...prev,{role:"user",content:`Analisis ${coin.toUpperCase()}USDT — Live BingX (4H+1H+S&R)`}]);
    const nh = [...history, {role:"user", content:txt}];
    setHistory(nh);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1400,system:SYSTEM_PROMPT,messages:nh}),
      });
      const data = await res.json();
      const at = data.content?.map(b=>b.text||"").join("")||"Error";
      setHistory([...nh,{role:"assistant",content:at}]);
      setMessages(prev=>[...prev,{role:"assistant",content:at,signal:parseSignal(at)}]);
    } catch(e) {
      setMessages(prev=>[...prev,{role:"assistant",content:`Gagal: ${e.message}`,signal:null}]);
    } finally { setAiLoad(false); }
  }

  async function handleAnalyze() {
    const coin = coinInput.trim() || activeCoin;
    if (!coin || fetching || aiLoad) return;
    setActiveCoin(coin.toUpperCase());
    const result = await fetchData(coin);
    if (result) await analyzeWithAI(coin, result.j4, result.j1);
  }

  async function handleManual() {
    const text = manual.trim();
    if (!text || aiLoad) return;
    setMessages(prev=>[...prev,{role:"user",content:text}]);
    setManual("");
    const nh = [...history,{role:"user",content:text}];
    setHistory(nh);
    setAiLoad(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1400,system:SYSTEM_PROMPT,messages:nh}),
      });
      const data = await res.json();
      const at = data.content?.map(b=>b.text||"").join("")||"Error";
      setHistory([...nh,{role:"assistant",content:at}]);
      setMessages(prev=>[...prev,{role:"assistant",content:at,signal:parseSignal(at)}]);
    } catch(e) {
      setMessages(prev=>[...prev,{role:"assistant",content:"Gagal.",signal:null}]);
    } finally { setAiLoad(false); }
  }

  const canAna = (coinInput.trim()||activeCoin) && !fetching && !aiLoad && backendReady && keyReady;

  return (
    <>
      <style>{globalCSS}</style>
      <div className="app">
        <div className="hdr">
          <div className="logo">AI</div>
          <div className="hdr-t">
            <h1>TRADING AGENT — MA × VMC × S&R</h1>
            <p>BINGX LIVE · 3-LAYER DECISION · RR 1:3 · CLAUDE AI</p>
          </div>
          <div className="hdr-r">
            <span className="bdg bdg-b">4H+1H</span>
            <span className="bdg bdg-p">S&R</span>
            <span className="bdg bdg-g">RR 1:3</span>
            <span className="live-i"><span className="dot-l"/>LIVE</span>
          </div>
        </div>

        {(!backendReady || !keyReady) && (
          <div className="cfg-warn">
            <strong>⚠️ Setup diperlukan di file src/App.jsx:</strong>
            {!backendReady && <div>1. Ganti <code>BACKEND_URL</code> dengan URL Vercel backend kamu</div>}
            {!keyReady && <div>2. Ganti <code>ANTHROPIC_KEY</code> dengan API key dari console.anthropic.com</div>}
          </div>
        )}

        <div className="coin-sec">
          <div className="sec-lbl">Masukkan nama coin — analisis otomatis 4H + 1H + S&R</div>
          <div className="coin-row">
            <input className="coin-inp" placeholder="BTC, ETH, SOL…" value={coinInput}
              onChange={e=>setCoinInput(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&handleAnalyze()}/>
            <button className="ana-btn" onClick={handleAnalyze} disabled={!canAna}>
              {fetching?"Fetching…":aiLoad?"Analyzing…":"🔍 Analisis"}
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

        {(d4||d1) && <LiveCard d4={d4} d1={d1}/>}

        <div className="msgs" style={{flex:1,overflowY:"auto"}}>
          {messages.length===0 && (
            <div style={{background:"linear-gradient(135deg,rgba(0,255,136,0.05),rgba(0,196,255,0.03))",border:"1px solid rgba(0,255,136,0.15)",borderRadius:"14px",padding:"16px",marginBottom:"4px"}}>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"15px",fontWeight:"800",color:"#fff",marginBottom:"6px"}}>
                Trading Agent <span style={{color:"var(--green)"}}>Live</span>
              </h2>
              <p style={{fontSize:"11px",color:"#6a8099",lineHeight:"1.6",marginBottom:"10px"}}>
                Ketik nama coin → fetch data BingX → analisis 3-layer → sinyal dengan RR <strong style={{color:"var(--gold)"}}>1:3</strong>.
              </p>
              <div style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(0,255,136,0.08)",borderRadius:"9px",padding:"11px 13px"}}>
                <div style={{fontSize:"9px",color:"var(--green)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"8px"}}>3-LAYER LOGIC</div>
                {[
                  ["1","Trend — MA13/21 + VuManChu menentukan arah"],
                  ["2","Posisi — Entry 2.5% dari zona S&R"],
                  ["3","Risk — SL 2% di luar S&R · TP = SL × 3 (1:3)"],
                ].map(([n,t])=>(
                  <div key={n} style={{display:"flex",gap:"8px",marginBottom:"6px",fontSize:"10px",color:"#6a8099",lineHeight:"1.5"}}>
                    <div style={{width:"18px",height:"18px",borderRadius:"4px",background:"rgba(0,196,255,0.12)",color:"var(--cyan)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",flexShrink:0}}>{n}</div>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg,i)=>(
            <div key={i} className={`msg ${msg.role}`}>
              <div className={`av ${msg.role==="assistant"?"av-a":"av-u"}`}>{msg.role==="user"?"TM":"AI"}</div>
              <div className="mc">
                {msg.role==="user"?<div className="bbl">{msg.content}</div>
                  :msg.signal?<SignalCard signal={msg.signal}/>:<div className="bbl">{msg.content}</div>}
              </div>
            </div>
          ))}

          {(fetching||aiLoad)&&<div className="ldm msg"><div className="av av-a">AI</div><div className="ldd"><div className="ld"/><div className="ld"/><div className="ld"/></div></div>}
          <div ref={endRef}/>
        </div>

        <div className="inp-a">
          <div className="inp-r">
            <div className="iw">
              <textarea className="ti" placeholder="Tanya lanjutan atau update kondisi…" value={manual}
                onChange={e=>setManual(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleManual();}}} rows={1}/>
            </div>
            <button className="sb2" onClick={handleManual} disabled={!manual.trim()||aiLoad||!keyReady}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#080c14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div className="hint">Ketik coin → Enter · BingX live data · 3-layer decision · RR wajib 1:3</div>
        </div>
      </div>
    </>
  );
}
