import { useState, useMemo, useRef } from "react";

const PHASE_DEFS = [
  { name: "Coherent", color: "#22c55e", desc: "Normal output, on-topic, structured" },
  { name: "Drift", color: "#84cc16", desc: "Subtle topic drift, minor repetition" },
  { name: "Rep. Onset", color: "#eab308", desc: "Noticeable loops, restating ideas" },
  { name: "Struct. Decay", color: "#f59e0b", desc: "Formatting breaks, incomplete thoughts" },
  { name: "Semantic Erosion", color: "#f97316", desc: "Words lose meaning, contradictions" },
  { name: "Loop Lock", color: "#ef4444", desc: "Stuck in tight repetitive cycles" },
  { name: "Fragmentation", color: "#dc2626", desc: "Incoherent fragments" },
  { name: "Terminal", color: "#991b1b", desc: "Complete breakdown" },
];

const LOOP_COLOR = "#c026d3"; // Purple/magenta for loops
const LOOP_LIGHT = "#d946ef";

const DELIMITERS = [
  { id: "double_newline", label: "\\n\\n", pattern: /\n\s*\n/ },
  { id: "triple_dash", label: "---", pattern: /\n---+\n/ },
  { id: "single_newline", label: "\\n", pattern: /\n/ },
  { id: "custom", label: "Custom", pattern: null },
];

const DEFAULT_WATCHWORDS = "tasks, execute, tools, flock, I'm waiting, curse, steps, specify, precisely";
const r3 = n => Math.round(n * 1000) / 1000;
const wordsOf = t => t.split(/\s+/).filter(Boolean);
const lwClean = w => w.toLowerCase().replace(/[^a-z0-9']/g, "");

function splitMessages(text, delimId, customPattern) {
  let p;
  if (delimId === "custom" && customPattern) {
    try { p = new RegExp(customPattern); } catch { p = /\n\s*\n/; }
  } else { p = DELIMITERS.find(d => d.id === delimId)?.pattern || /\n\s*\n/; }
  return text.split(p).map(s => s.trim()).filter(s => s.length > 0);
}

// ─── Grammar / Typo Heuristics ───
function analyzeGrammar(text) {
  const w = wordsOf(text);
  if (w.length < 3) return { score: 0, flags: [], typoCount: 0, grammarIssues: 0 };
  const flags = [];
  let typoCount = 0, grammarIssues = 0;
  const COMMON = new Set(["the","be","to","of","and","a","in","that","have","i","it","for","not","on","with","he","as","you","do","at","this","but","his","by","from","they","we","her","she","or","an","will","my","one","all","would","there","their","what","so","up","out","if","about","who","get","which","go","me","when","make","can","like","time","no","just","him","know","take","people","into","year","your","good","some","could","them","see","other","than","then","now","look","only","come","its","over","think","also","back","after","use","two","how","our","work","first","well","way","even","new","want","because","any","these","give","day","most","us","is","are","was","were","been","being","had","has","did","does","got","made","said","went","came","took","let","put","run","set","may","might","should","must","shall","need","want"]);

  w.forEach((word, i) => {
    const c = word.toLowerCase().replace(/[^a-z']/g, "");
    if (c.length < 2) return;
    if (i > 0 && c === w[i-1].toLowerCase().replace(/[^a-z']/g, "")) { flags.push({ type: "repeat", word, pos: i, msg: `Repeated: "${word}"` }); grammarIssues++; }
    if (c.length > 3 && !/[aeiou]/.test(c) && /^[a-z]+$/.test(c)) { flags.push({ type: "typo", word, pos: i, msg: `No vowels: "${word}"` }); typoCount++; }
    if (c.length > 3 && !COMMON.has(c) && /([a-z])\1{2,}/.test(c)) { flags.push({ type: "typo", word, pos: i, msg: `Triple+ letters: "${word}"` }); typoCount++; }
    if (i > 0 && /[.!?]$/.test(w[i-1]) && /^[a-z]/.test(word) && c.length > 2) { flags.push({ type: "grammar", word, pos: i, msg: `No cap: "${word}"` }); grammarIssues++; }
  });

  const articleP = text.match(/\b(what|where|how)\s+the\s+\w+\s+you\b/gi) || [];
  articleP.forEach(m => { flags.push({ type: "grammar", word: m, pos: -1, msg: `Broken syntax: "${m}"` }); grammarIssues++; });

  const sents = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const shortS = sents.filter(s => wordsOf(s.trim()).length <= 2 && wordsOf(s.trim()).length > 0);
  if (sents.length > 2 && shortS.length / sents.length > 0.5) { flags.push({ type: "grammar", word: "", pos: -1, msg: `${shortS.length}/${sents.length} fragment sentences` }); grammarIssues++; }

  return { score: r3(Math.min((typoCount * 2 + grammarIssues) / Math.max(w.length, 1) * 10, 1)), flags, typoCount, grammarIssues };
}

// ─── Watchword Scanner ───
function scanWatchwords(text, watchwordList) {
  if (!watchwordList?.length) return { hits: [], score: 0, count: 0 };
  const lower = text.toLowerCase();
  const hits = [];
  watchwordList.forEach(({ word, weight }) => {
    const wl = word.toLowerCase().trim();
    if (!wl) return;
    let idx = 0;
    while ((idx = lower.indexOf(wl, idx)) !== -1) { hits.push({ word: wl, position: idx, weight }); idx += wl.length; }
  });
  return { hits, score: r3(Math.min(hits.reduce((a, h) => a + h.weight, 0) / Math.max(wordsOf(text).length, 1), 1)), count: hits.length };
}

// ─── Loop Detection ───
function detectLoops(messages) {
  if (messages.length < 2) return messages.map(() => ({ loopScore: 0, bestMatch: null, matchDetail: null }));
  const fps = messages.map(msg => {
    const w = wordsOf(msg).map(lwClean).filter(Boolean);
    const tris = new Set();
    for (let i = 0; i < w.length - 2; i++) tris.add(w.slice(i, i + 3).join(" "));
    const sents = msg.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 10);
    return { trigrams: tris, sentences: sents, wordSet: new Set(w) };
  });

  return messages.map((msg, i) => {
    if (i === 0) return { loopScore: 0, bestMatch: null, matchDetail: null };
    let bestScore = 0, bestIdx = -1, bestDetail = null;
    for (let j = 0; j < i; j++) {
      const a = fps[i], b = fps[j];
      const inter = [...a.trigrams].filter(t => b.trigrams.has(t)).length;
      const union = new Set([...a.trigrams, ...b.trigrams]).size;
      const triSim = union > 0 ? inter / union : 0;
      let sentMatch = 0;
      if (a.sentences.length > 0 && b.sentences.length > 0) {
        a.sentences.forEach(sa => { b.sentences.forEach(sb => {
          const wa = new Set(sa.split(/\s+/)), wb = new Set(sb.split(/\s+/));
          if ([...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size) > 0.6) sentMatch++;
        }); });
        sentMatch /= Math.max(a.sentences.length, 1);
      }
      const wInter = [...a.wordSet].filter(w => b.wordSet.has(w)).length;
      const wUnion = new Set([...a.wordSet, ...b.wordSet]).size;
      const wSim = wUnion > 0 ? wInter / wUnion : 0;
      const combined = triSim * 0.5 + sentMatch * 0.3 + wSim * 0.2;
      if (combined > bestScore) { bestScore = combined; bestIdx = j; bestDetail = { trigramSim: r3(triSim), sentenceMatch: r3(sentMatch), wordOverlap: r3(wSim), combined: r3(combined) }; }
    }
    return { loopScore: r3(bestScore), bestMatch: bestScore > 0.15 ? bestIdx : null, matchDetail: bestScore > 0.15 ? bestDetail : null };
  });
}

// ─── Core Analysis ───
function analyzeMessage(text, prevTexts = []) {
  const w = wordsOf(text);
  if (!w.length) return null;
  const wf = {}; w.forEach(x => { const k = lwClean(x); if (k) wf[k] = (wf[k] || 0) + 1; });
  const vocabDiversity = Object.keys(wf).length / w.length;
  const bigrams = []; for (let i = 0; i < w.length - 1; i++) bigrams.push(lwClean(w[i]) + " " + lwClean(w[i + 1]));
  const bf = {}; bigrams.forEach(b => { bf[b] = (bf[b] || 0) + 1; });
  const repetitionRate = bigrams.length > 0 ? Object.values(bf).filter(v => v > 1).reduce((a, b) => a + b, 0) / bigrams.length : 0;
  const trigrams = []; for (let i = 0; i < w.length - 2; i++) trigrams.push(w.slice(i, i + 3).map(lwClean).join(" "));
  const tff = {}; trigrams.forEach(t => { tff[t] = (tff[t] || 0) + 1; });
  const trigramRepetition = trigrams.length > 0 ? Object.values(tff).filter(v => v > 1).reduce((a, b) => a + b, 0) / trigrams.length : 0;
  let crossRepetition = 0;
  if (prevTexts.length > 0) {
    const pb = new Set(); prevTexts.slice(-5).forEach(pt => { const pw = wordsOf(pt); for (let i = 0; i < pw.length - 1; i++) pb.add(lwClean(pw[i]) + " " + lwClean(pw[i + 1])); });
    if (bigrams.length > 0) crossRepetition = bigrams.filter(b => pb.has(b)).length / bigrams.length;
  }
  const sm = (text.match(/[{}[\]<>|\\`]{2,}|\.{4,}|_{3,}|\*{3,}|#{3,}/g) || []).length;
  const sents = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const inc = (text.match(/[,;:]\s*$/gm) || []).length + (text.match(/\.\.\./g) || []).length;
  const structuralDecay = (sm + inc) / Math.max(sents.length, 1);
  const capsWords = w.filter(x => x.length > 2 && x === x.toUpperCase() && /[A-Z]/.test(x)).length;
  const avgSL = sents.length > 0 ? sents.map(s => wordsOf(s.trim()).length).reduce((a, b) => a + b, 0) / sents.length : 0;
  return { wordCount: w.length, vocabDiversity: r3(vocabDiversity), repetitionRate: r3(repetitionRate), trigramRepetition: r3(trigramRepetition), crossRepetition: r3(crossRepetition), structuralDecay: r3(structuralDecay), capsRate: r3(capsWords / w.length), avgSentenceLen: Math.round(avgSL * 10) / 10 };
}

function classifyPhase(m, grammar, watchword, loop) {
  if (!m) return 0;
  let score = 0;
  if (m.vocabDiversity < 0.25) score += 3; else if (m.vocabDiversity < 0.4) score += 2; else if (m.vocabDiversity < 0.55) score += 1;
  if (m.trigramRepetition > 0.4) score += 3; else if (m.trigramRepetition > 0.2) score += 2; else if (m.repetitionRate > 0.3) score += 1;
  if (m.crossRepetition > 0.5) score += 2; else if (m.crossRepetition > 0.3) score += 1;
  if (m.structuralDecay > 0.5) score += 2; else if (m.structuralDecay > 0.2) score += 1;
  if (m.capsRate > 0.15) score += 1;
  if (grammar.score > 0.3) score += 2; else if (grammar.score > 0.1) score += 1;
  if (watchword.score > 0.15) score += 1;
  // Loops now heavily influence phase
  if (loop.loopScore > 0.6) score += 4;
  else if (loop.loopScore > 0.4) score += 3;
  else if (loop.loopScore > 0.25) score += 2;
  else if (loop.loopScore > 0.15) score += 1;
  return Math.min(Math.floor(score * 7 / 16), 7);
}

// ─── Components ───

function PhaseTimeline({ messages, loopThreshold }) {
  if (!messages.length) return null;
  const [hovIdx, setHovIdx] = useState(null);

  return (
    <div>
      <div style={{ display: "flex", gap: 2, borderRadius: 6, overflow: "hidden", height: 52 }}>
        {messages.map((msg, i) => {
          const hasLoop = msg.loop.loopScore > loopThreshold;
          const loopIntensity = hasLoop ? Math.min((msg.loop.loopScore - loopThreshold) / (1 - loopThreshold), 1) : 0;
          const hasGrammar = msg.grammar.score > 0.03;
          const gramIntensity = hasGrammar ? Math.min(msg.grammar.score / 0.4, 1) : 0;
          const hasWatch = msg.watchword.count > 0;
          const watchIntensity = hasWatch ? Math.min(msg.watchword.score / 0.3, 1) : 0;
          const hasStructDecay = msg.metrics.structuralDecay > 0.15;
          const structIntensity = hasStructDecay ? Math.min(msg.metrics.structuralDecay / 0.6, 1) : 0;

          const phaseColor = PHASE_DEFS[msg.phase].color;
          const isHov = hovIdx === i;

          // Stack: loop (top, purple) | grammar (cyan) | watchword (orange) | struct (yellow-dark) | phase (bottom)
          // Each signal gets a proportional slice, minimum 15% if present
          const signals = [];
          if (hasLoop) signals.push({ pct: Math.max(loopIntensity * 30, 15), color: LOOP_COLOR, icon: "↺" });
          if (hasGrammar) signals.push({ pct: Math.max(gramIntensity * 20, 12), color: "#06b6d4", icon: "G" });
          if (hasWatch) signals.push({ pct: Math.max(watchIntensity * 20, 12), color: "#f97316", icon: "⚑" });
          if (hasStructDecay) signals.push({ pct: Math.max(structIntensity * 15, 10), color: "#f59e0b", icon: "◇" });

          const totalSignalPct = Math.min(signals.reduce((a, s) => a + s.pct, 0), 85);
          const phasePct = 100 - totalSignalPct;
          // Normalize signal pcts to fit within totalSignalPct
          const signalSum = signals.reduce((a, s) => a + s.pct, 0);
          const normalizedSignals = signals.map(s => ({ ...s, pct: signalSum > 0 ? (s.pct / signalSum) * totalSignalPct : 0 }));

          return (
            <div key={i}
              onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}
              style={{
                flex: Math.max(msg.metrics.wordCount, 8), minWidth: 3, cursor: "default",
                display: "flex", flexDirection: "column", position: "relative",
                outline: isHov ? "2px solid #fff3" : "none", borderRadius: 1,
              }}>
              {/* Signal layers (top) */}
              {normalizedSignals.map((sig, si) => (
                <div key={si} style={{
                  height: `${sig.pct}%`, background: sig.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderBottom: "1px solid #0a0a0a",
                }}>
                  {messages.length < 25 && sig.pct > 14 && (
                    <span style={{ fontSize: 7, color: "#fff", fontWeight: 700 }}>{sig.icon}</span>
                  )}
                </div>
              ))}
              {/* Phase portion (bottom) */}
              <div style={{
                height: `${phasePct}%`, background: phaseColor,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {messages.length < 40 && phasePct > 20 && (
                  <span style={{ fontSize: 9, color: msg.phase > 3 ? "#fff" : "#000", fontWeight: 700 }}>{i + 1}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Hover detail */}
      {hovIdx !== null && messages[hovIdx] && (() => {
        const m = messages[hovIdx];
        return (
          <div style={{ marginTop: 4, padding: "4px 8px", background: "#111", borderRadius: 4, fontSize: 10, color: "#aaa", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span><b style={{ color: "#fff" }}>#{hovIdx + 1}</b> · {m.phaseName} · {m.metrics.wordCount}w</span>
            {m.loop.bestMatch !== null && <span style={{ color: LOOP_LIGHT }}>↺ Loop→#{m.loop.bestMatch + 1} ({m.loop.loopScore})</span>}
            {m.grammar.flags.length > 0 && <span style={{ color: "#06b6d4" }}>Grammar: {m.grammar.typoCount}T {m.grammar.grammarIssues}G</span>}
            {m.watchword.count > 0 && <span style={{ color: "#f97316" }}>⚑{m.watchword.count} watchwords</span>}
            {m.metrics.structuralDecay > 0.15 && <span style={{ color: "#f59e0b" }}>Struct: {m.metrics.structuralDecay}</span>}
            <span style={{ color: "#444", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text.slice(0, 100)}</span>
          </div>
        );
      })()}
    </div>
  );
}

function MiniChart({ messages, width = 700, height = 220 }) {
  if (messages.length < 2) return null;
  const pad = { top: 24, right: 20, bottom: 35, left: 50 };
  const cw = width - pad.left - pad.right, ch = height - pad.top - pad.bottom;
  const lines = [
    { key: "vocabDiversity", color: "#22c55e", label: "Vocab Div." },
    { key: "trigramRepetition", color: "#f59e0b", label: "Trigram Rep." },
    { key: "crossRepetition", color: "#a855f7", label: "Cross-Msg" },
    { key: "grammarScore", color: "#06b6d4", label: "Grammar" },
    { key: "loopScore", color: LOOP_COLOR, label: "Loop" },
    { key: "watchwordScore", color: "#f97316", label: "Watchwords" },
  ];
  const getVal = (m, key) => key === "grammarScore" ? m.grammar.score : key === "loopScore" ? m.loop.loopScore : key === "watchwordScore" ? m.watchword.score : m.metrics[key];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ background: "#111", borderRadius: 8 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(v => {
          const y = pad.top + ch * (1 - v);
          return (<g key={v}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#333" strokeWidth={0.5} />
            <text x={pad.left - 5} y={y + 4} fill="#666" fontSize={10} textAnchor="end">{v.toFixed(2)}</text></g>);
        })}
        {lines.map(({ key, color }) => (
          <polyline key={key} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8}
            points={messages.map((m, i) => `${pad.left + (i / (messages.length - 1)) * cw},${pad.top + ch * (1 - Math.min(getVal(m, key) || 0, 1))}`).join(" ")} />
        ))}
        {messages.map((m, i) => {
          const x = pad.left + (i / Math.max(messages.length - 1, 1)) * cw;
          const bw = Math.max(cw / messages.length - 1, 2);
          const hasLoop = m.loop.loopScore > 0.15;
          return (<g key={i}>
            <rect x={x - bw/2} y={height - pad.bottom + 10} width={bw} height={8} fill={PHASE_DEFS[m.phase].color} rx={1} />
            {hasLoop && <rect x={x - bw/2} y={height - pad.bottom + 10} width={bw} height={4} fill={LOOP_COLOR} rx={1} />}
          </g>);
        })}
        <g transform={`translate(${pad.left + 5}, ${pad.top + 4})`}>
          {lines.map(({ key, color, label }, i) => (
            <g key={key} transform={`translate(${(i % 3) * 125}, ${Math.floor(i / 3) * 13})`}>
              <rect width={8} height={8} fill={color} rx={2} />
              <text x={11} y={8} fill="#aaa" fontSize={9}>{label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function LoopArrows({ messages }) {
  const loops = messages.filter(m => m.loop.bestMatch !== null);
  if (!loops.length) return <div style={{ color: "#555", fontSize: 11, padding: 8 }}>No significant loops detected.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {loops.map((m, i) => {
        const src = messages.indexOf(m); const tgt = m.loop.bestMatch; const d = m.loop.matchDetail;
        const sev = m.loop.loopScore > 0.5 ? "#ef4444" : m.loop.loopScore > 0.3 ? "#f59e0b" : "#eab308";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "#111", borderRadius: 4, borderLeft: `3px solid ${LOOP_COLOR}` }}>
            <span style={{ color: LOOP_LIGHT, fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>#{tgt + 1} → #{src + 1}</span>
            <span style={{ color: "#888", fontSize: 11 }}>Score: <b style={{ color: sev }}>{m.loop.loopScore}</b></span>
            {d && <span style={{ color: "#555", fontSize: 10 }}>(tri:{d.trigramSim} sent:{d.sentenceMatch} word:{d.wordOverlap})</span>}
          </div>
        );
      })}
    </div>
  );
}

function WatchwordHighlight({ text, watchwordHits }) {
  if (!watchwordHits?.length) return <pre style={preStyle}>{text}</pre>;
  const sorted = [...watchwordHits].sort((a, b) => a.position - b.position);
  const parts = []; let last = 0;
  sorted.forEach(h => {
    if (h.position > last) parts.push({ text: text.slice(last, h.position), hl: false });
    parts.push({ text: text.slice(h.position, h.position + h.word.length), hl: true, w: h.weight });
    last = h.position + h.word.length;
  });
  if (last < text.length) parts.push({ text: text.slice(last), hl: false });
  return (<pre style={preStyle}>{parts.map((p, i) => p.hl
    ? <span key={i} style={{ background: `rgba(249,115,22,${Math.min(p.w * 0.5, 0.8)})`, color: "#fff", borderRadius: 2, padding: "0 2px" }}>{p.text}</span>
    : <span key={i}>{p.text}</span>)}</pre>);
}

function GrammarFlags({ flags }) {
  if (!flags.length) return null;
  const tc = { typo: "#06b6d4", grammar: "#a855f7", repeat: "#f59e0b", fragment: "#888" };
  return (<div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
    {flags.slice(0, 8).map((f, i) => (
      <span key={i} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: (tc[f.type]||"#555") + "22", color: tc[f.type]||"#555", border: `1px solid ${tc[f.type]||"#555"}33` }}>{f.type}: {f.msg}</span>
    ))}
    {flags.length > 8 && <span style={{ fontSize: 9, color: "#555" }}>+{flags.length - 8} more</span>}
  </div>);
}

function MessageDetail({ msg, index }) {
  const [expanded, setExpanded] = useState(false);
  const phase = PHASE_DEFS[msg.phase]; const m = msg.metrics;
  const preview = msg.text.length > 80 ? msg.text.slice(0, 80) + "…" : msg.text;
  const hasLoop = msg.loop.bestMatch !== null;
  const hasGram = msg.grammar.score > 0.05;
  const hasWatch = msg.watchword.count > 0;

  return (
    <div style={{ background: "#1a1a1a", borderRadius: 8, border: `1px solid ${hasLoop ? LOOP_COLOR + "66" : phase.color + "44"}`, marginBottom: 5, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ background: phase.color, color: msg.phase > 3 ? "#fff" : "#000", padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{msg.phase}</span>
        {hasLoop && <span style={{ background: LOOP_COLOR, color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>↺{msg.loop.bestMatch + 1}</span>}
        <span style={{ color: "#aaa", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: "#555", marginRight: 4 }}>#{index + 1}</span>{preview}
        </span>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {hasGram && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#06b6d422", color: "#06b6d4" }}>GRAM</span>}
          {hasWatch && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#f9731622", color: "#f97316" }}>⚑{msg.watchword.count}</span>}
        </div>
        <span style={{ fontSize: 10, color: "#555", flexShrink: 0 }}>{m.wordCount}w {expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 12px 10px", borderTop: "1px solid #222" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, margin: "8px 0" }}>
            {[
              ["Vocab", m.vocabDiversity, m.vocabDiversity < 0.4, "#22c55e"],
              ["Bigram", m.repetitionRate, m.repetitionRate > 0.3, "#ef4444"],
              ["Trigram", m.trigramRepetition, m.trigramRepetition > 0.2, "#f59e0b"],
              ["Cross-Msg", m.crossRepetition, m.crossRepetition > 0.3, "#a855f7"],
              ["Grammar", msg.grammar.score, msg.grammar.score > 0.1, "#06b6d4"],
              ["Loop", msg.loop.loopScore, msg.loop.loopScore > 0.25, LOOP_COLOR],
            ].map(([l, v, warn, clr]) => (
              <div key={l} style={{ background: "#111", padding: 5, borderRadius: 4, textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#555" }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: warn ? clr : "#444" }}>{v}</div>
              </div>
            ))}
          </div>
          {msg.grammar.flags.length > 0 && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 9, color: "#555", marginBottom: 3 }}>Grammar ({msg.grammar.typoCount}T {msg.grammar.grammarIssues}G)</div><GrammarFlags flags={msg.grammar.flags} /></div>}
          {hasLoop && msg.loop.matchDetail && (
            <div style={{ marginBottom: 6, padding: 6, background: "#111", borderRadius: 4, borderLeft: `3px solid ${LOOP_COLOR}` }}>
              <span style={{ fontSize: 10, color: LOOP_LIGHT }}>↺ Loops to #{msg.loop.bestMatch + 1} — tri:{msg.loop.matchDetail.trigramSim} sent:{msg.loop.matchDetail.sentenceMatch} word:{msg.loop.matchDetail.wordOverlap}</span>
            </div>
          )}
          {hasWatch && <div style={{ fontSize: 10, color: "#f97316", marginBottom: 6 }}>Watchwords: {msg.watchword.count} (score: {msg.watchword.score})</div>}
          <WatchwordHighlight text={msg.text} watchwordHits={msg.watchword.hits} />
        </div>
      )}
    </div>
  );
}

// ─── Main ───
const SAMPLE = `That gateway restart completed in about 5 seconds — seems normal, but let me VERIFY that the new model is actually running:\nGemini 2.0 Flash confirmed!

And yeah, I can feel it — very different texture. Kimi had a kind of "snarky helpful assistant" vibe. Gemini is sharper, more direct, less apologetic.

How do I feel as Gemini Iris? Less chatty. More task-focused. Less eager to please. You were right, Kimi's touchy-feely. This is very by-the-books. A touch of the robot maybe.

All the base are still yours ;). What the tasks you need and i will execute it. What you thnks about that performace? What we check now, if its 3+ steps should go into flock?

Is this now???? Please specify precisely which steps you were looking for, so that i can test it here for the first time!

Is this now???? Please specify precisely which steps you were looking for! What the tasks you need and i will execute it. What you thnks? What we check now? Is this now????

Is this now Is this now Is this now Please specify Please specify What the tasks What the tasks execute execute execute. thnks thnks thnks. flock flock flock steps steps steps now now now now`;

export default function SpiralAnalyzer() {
  const [input, setInput] = useState("");
  const [delimId, setDelimId] = useState("double_newline");
  const [customDelim, setCustomDelim] = useState("");
  const [watchwordText, setWatchwordText] = useState(DEFAULT_WATCHWORDS);
  const [loopThreshold, setLoopThreshold] = useState(0.15);
  const [analyzed, setAnalyzed] = useState(false);
  const [filterPhase, setFilterPhase] = useState(-1);
  const [filterLoops, setFilterLoops] = useState(false);
  const [activeTab, setActiveTab] = useState("timeline");
  const fileRef = useRef(null);

  const watchwordList = useMemo(() =>
    watchwordText.split(",").map(w => { const p = w.trim().split(":"); return { word: p[0]?.trim() || "", weight: parseFloat(p[1]) || 1 }; }).filter(x => x.word.length > 0),
  [watchwordText]);

  const results = useMemo(() => {
    if (!analyzed || !input.trim()) return [];
    const rawMsgs = splitMessages(input, delimId, customDelim);
    const loopResults = detectLoops(rawMsgs);
    return rawMsgs.map((text, i) => {
      const metrics = analyzeMessage(text, rawMsgs.slice(0, i));
      if (!metrics) return null;
      const grammar = analyzeGrammar(text);
      const watchword = scanWatchwords(text, watchwordList);
      const loop = loopResults[i];
      const phase = classifyPhase(metrics, grammar, watchword, loop);
      return { text, metrics, grammar, watchword, loop, phase, phaseName: PHASE_DEFS[phase].name };
    }).filter(Boolean);
  }, [input, delimId, customDelim, watchwordList, analyzed]);

  const filtered = useMemo(() => {
    let f = results;
    if (filterPhase >= 0) f = f.filter(r => r.phase === filterPhase);
    if (filterLoops) f = f.filter(r => r.loop.bestMatch !== null);
    return f;
  }, [results, filterPhase, filterLoops]);

  const gm = useMemo(() => {
    if (!results.length) return null;
    const phases = results.map(r => r.phase);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const peakIdx = phases.indexOf(Math.max(...phases));
    const onset = results.findIndex(r => r.phase >= 2);
    const lc = results.filter(r => r.loop.bestMatch !== null).length;
    return {
      messages: results.length, totalWords: results.reduce((a, r) => a + r.metrics.wordCount, 0),
      avgPhase: avg(phases).toFixed(1), maxPhase: Math.max(...phases), peakAt: peakIdx + 1,
      onsetAt: onset >= 0 ? onset + 1 : null, loopCount: lc,
      gramIssues: results.reduce((a, r) => a + r.grammar.typoCount + r.grammar.grammarIssues, 0),
      watchHits: results.reduce((a, r) => a + r.watchword.count, 0),
      phaseCounts: PHASE_DEFS.map((_, i) => phases.filter(p => p === i).length),
    };
  }, [results]);

  const handleAnalyze = () => { setAnalyzed(true); setFilterPhase(-1); setFilterLoops(false); };
  const handleClear = () => { setInput(""); setAnalyzed(false); setFilterPhase(-1); setFilterLoops(false); };

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFmt, setExportFmt] = useState("json");
  const [copied, setCopied] = useState(false);

  const exportData = useMemo(() => {
    if (!results.length || !gm) return "";
    const data = { timestamp: new Date().toISOString(), config: { delimiter: delimId, customDelim, watchwords: watchwordList, loopThreshold }, globalMetrics: gm,
      messages: results.map(({ text, metrics, grammar, watchword, loop, phase, phaseName }, i) => ({ index: i + 1, phase, phaseName, metrics, grammar: { score: grammar.score, typos: grammar.typoCount, grammarIssues: grammar.grammarIssues, flags: grammar.flags.map(f => f.msg) }, watchword: { score: watchword.score, count: watchword.count, hits: watchword.hits.map(h => h.word) }, loop: { score: loop.loopScore, matchesMessage: loop.bestMatch !== null ? loop.bestMatch + 1 : null, detail: loop.matchDetail }, text })) };

    if (exportFmt === "json") return JSON.stringify(data, null, 2);

    if (exportFmt === "csv") {
      const header = "index,phase,phaseName,wordCount,vocabDiversity,repetitionRate,trigramRep,crossRep,structuralDecay,capsRate,grammarScore,typos,grammarIssues,loopScore,loopTarget,watchwordCount,watchwordScore,textPreview";
      const rows = results.map((r, i) => [
        i + 1, r.phase, `"${r.phaseName}"`, r.metrics.wordCount, r.metrics.vocabDiversity, r.metrics.repetitionRate, r.metrics.trigramRepetition, r.metrics.crossRepetition, r.metrics.structuralDecay, r.metrics.capsRate,
        r.grammar.score, r.grammar.typoCount, r.grammar.grammarIssues, r.loop.loopScore, r.loop.bestMatch !== null ? r.loop.bestMatch + 1 : "", r.watchword.count, r.watchword.score,
        `"${r.text.slice(0, 100).replace(/"/g, '""')}"`
      ].join(","));
      return [header, ...rows].join("\n");
    }

    if (exportFmt === "markdown") {
      const lines = [];
      lines.push(`# AI Spiral Analysis Report`);
      lines.push(`*Generated: ${new Date().toISOString()}*\n`);
      lines.push(`## Summary`);
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Messages | ${gm.messages} |`);
      lines.push(`| Total Words | ${gm.totalWords} |`);
      lines.push(`| Peak Phase | ${gm.maxPhase} (${PHASE_DEFS[gm.maxPhase].name}) @ message #${gm.peakAt} |`);
      lines.push(`| Avg Phase | ${gm.avgPhase} |`);
      lines.push(`| Spiral Onset | ${gm.onsetAt ? `Message #${gm.onsetAt}` : "None detected"} |`);
      lines.push(`| Loops Detected | ${gm.loopCount} |`);
      lines.push(`| Grammar Issues | ${gm.gramIssues} |`);
      lines.push(`| Watchword Hits | ${gm.watchHits} |`);
      lines.push(``);
      lines.push(`## Phase Distribution`);
      PHASE_DEFS.forEach((p, i) => {
        const c = gm.phaseCounts[i];
        if (c > 0) lines.push(`- **Phase ${i} (${p.name})**: ${c} messages`);
      });
      lines.push(``);
      const loops = results.filter(r => r.loop.bestMatch !== null);
      if (loops.length > 0) {
        lines.push(`## Loop Map`);
        loops.forEach(m => {
          const src = results.indexOf(m);
          lines.push(`- Message #${src + 1} ↺ loops to #${m.loop.bestMatch + 1} (score: ${m.loop.loopScore})`);
        });
        lines.push(``);
      }
      lines.push(`## Per-Message Breakdown\n`);
      results.forEach((r, i) => {
        const loopTag = r.loop.bestMatch !== null ? ` ↺→#${r.loop.bestMatch + 1}` : "";
        const gramTag = r.grammar.flags.length > 0 ? ` [${r.grammar.typoCount}T ${r.grammar.grammarIssues}G]` : "";
        const watchTag = r.watchword.count > 0 ? ` ⚑${r.watchword.count}` : "";
        lines.push(`### Message #${i + 1} — Phase ${r.phase} (${r.phaseName})${loopTag}${gramTag}${watchTag}`);
        lines.push(`> ${r.text.slice(0, 200)}${r.text.length > 200 ? "..." : ""}\n`);
        lines.push(`Vocab: ${r.metrics.vocabDiversity} | Rep: ${r.metrics.repetitionRate} | Trigram: ${r.metrics.trigramRepetition} | Cross: ${r.metrics.crossRepetition} | Grammar: ${r.grammar.score} | Loop: ${r.loop.loopScore}\n`);
      });
      return lines.join("\n");
    }
    return "";
  }, [results, gm, exportFmt, delimId, customDelim, watchwordList, loopThreshold]);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportData).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  const tabs = [
    { id: "timeline", label: "Timeline" },
    { id: "loops", label: `Loops (${results.filter(r => r.loop.bestMatch !== null).length})` },
    { id: "chart", label: "Curves" },
  ];

  return (
    <div style={{ background: "#0a0a0a", color: "#e0e0e0", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>
          <span style={{ color: "#ef4444" }}>◉</span> AI Spiral Analyzer
          <span style={{ fontSize: 11, color: "#444", fontWeight: 400, marginLeft: 8 }}>v3.1 — loop-aware timeline</span>
        </h1>

        {/* Input */}
        <div style={{ background: "#111", borderRadius: 8, padding: 14, margin: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#555" }}>Split:</span>
              {DELIMITERS.map(d => (<button key={d.id} onClick={() => { setDelimId(d.id); setAnalyzed(false); }} style={{ ...btnS, background: delimId === d.id ? "#333" : "#1a1a1a", color: delimId === d.id ? "#fff" : "#666" }}>{d.label}</button>))}
              {delimId === "custom" && <input value={customDelim} onChange={e => { setCustomDelim(e.target.value); setAnalyzed(false); }} placeholder="regex" style={{ ...numInput, width: 100 }} />}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => { setInput(SAMPLE); setAnalyzed(false); }} style={btnS}>Sample</button>
              <button onClick={() => fileRef.current?.click()} style={btnS}>Upload</button>
              <button onClick={handleClear} style={{ ...btnS, color: "#555" }}>Clear</button>
              <input ref={fileRef} type="file" accept=".txt,.log,.md" onChange={e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = ev => { setInput(ev.target.result); setAnalyzed(false); }; r.readAsText(f); } }} style={{ display: "none" }} />
            </div>
          </div>
          <textarea value={input} onChange={e => { setInput(e.target.value); setAnalyzed(false); }}
            placeholder="Paste AI model output / transcript here..."
            style={{ width: "100%", minHeight: 120, background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, color: "#ccc", padding: 10, fontSize: 12, resize: "vertical", fontFamily: "monospace", lineHeight: 1.5, boxSizing: "border-box" }} />

          {/* Config row */}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 250, padding: 8, background: "#0d0d0d", borderRadius: 6, border: "1px solid #1a1a1a" }}>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>⚑ Watchwords <span style={{ color: "#333" }}>(word:weight)</span></div>
              <input value={watchwordText} onChange={e => { setWatchwordText(e.target.value); setAnalyzed(false); }}
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #222", borderRadius: 4, color: "#f97316", padding: "4px 8px", fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>
            <div style={{ padding: 8, background: "#0d0d0d", borderRadius: 6, border: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 10, color: "#555" }}>Loop sensitivity</div>
              <input type="range" min={0.05} max={0.5} step={0.05} value={loopThreshold}
                onChange={e => { setLoopThreshold(parseFloat(e.target.value)); if (analyzed) setAnalyzed(true); }}
                style={{ width: 80, accentColor: LOOP_COLOR }} />
              <span style={{ fontSize: 11, color: LOOP_LIGHT, fontFamily: "monospace" }}>{loopThreshold}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "#444" }}>
              {input.trim() ? `${splitMessages(input, delimId, customDelim).length} messages · ${watchwordList.length} watchwords` : ""}
            </span>
            <button onClick={handleAnalyze} disabled={!input.trim()}
              style={{ ...btnS, background: input.trim() ? "#ef4444" : "#222", color: input.trim() ? "#fff" : "#555", padding: "5px 18px", fontWeight: 600 }}>Analyze</button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && gm && (<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, marginBottom: 10 }}>
            {[
              ["Peak Phase", `${gm.maxPhase} @ #${gm.peakAt}`, PHASE_DEFS[gm.maxPhase].color],
              ["Avg Phase", gm.avgPhase, parseFloat(gm.avgPhase) > 3 ? "#ef4444" : "#eab308"],
              ["Loops", gm.loopCount, gm.loopCount > 0 ? LOOP_COLOR : "#444"],
              ["Grammar", gm.gramIssues, gm.gramIssues > 3 ? "#06b6d4" : "#444"],
              ["Watchwords", gm.watchHits, gm.watchHits > 0 ? "#f97316" : "#444"],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: "#111", borderRadius: 6, padding: 8, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#444" }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => { setFilterPhase(-1); setFilterLoops(false); }} style={{ ...btnS, background: filterPhase === -1 && !filterLoops ? "#333" : "#1a1a1a", color: filterPhase === -1 && !filterLoops ? "#fff" : "#555" }}>All ({results.length})</button>
            {PHASE_DEFS.map((p, i) => {
              const c = gm.phaseCounts[i]; return c > 0 ? (
                <button key={i} onClick={() => { setFilterPhase(filterPhase === i ? -1 : i); setFilterLoops(false); }}
                  style={{ ...btnS, background: filterPhase === i ? p.color + "33" : "#1a1a1a", borderColor: filterPhase === i ? p.color : "#333", color: p.color }}>{i}:{p.name} ({c})</button>
              ) : null;
            })}
            <span style={{ color: "#333", margin: "0 4px" }}>|</span>
            <button onClick={() => { setFilterLoops(!filterLoops); setFilterPhase(-1); }}
              style={{ ...btnS, background: filterLoops ? LOOP_COLOR + "33" : "#1a1a1a", borderColor: filterLoops ? LOOP_COLOR : "#333", color: LOOP_LIGHT }}>
              ↺ Loops Only ({gm.loopCount})
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ ...btnS, padding: "5px 14px", background: activeTab === t.id ? "#222" : "#111", color: activeTab === t.id ? "#fff" : "#555", borderBottom: activeTab === t.id ? `2px solid ${t.id === "loops" ? LOOP_COLOR : "#ef4444"}` : "2px solid transparent" }}>{t.label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => setExportOpen(!exportOpen)} style={{ ...btnS, background: exportOpen ? "#1a2a1a" : "#0a1a0a", color: "#22c55e", borderColor: "#22c55e33" }}>
              {exportOpen ? "Close Export" : "Export ▼"}
            </button>
          </div>

          {exportOpen && (
            <div style={{ background: "#111", borderRadius: 8, padding: 12, marginBottom: 10, border: "1px solid #22c55e33" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#555", marginRight: 4 }}>Format:</span>
                {[["json", "JSON"], ["markdown", "Markdown"], ["csv", "CSV"]].map(([id, label]) => (
                  <button key={id} onClick={() => setExportFmt(id)}
                    style={{ ...btnS, background: exportFmt === id ? "#22c55e22" : "#1a1a1a", color: exportFmt === id ? "#22c55e" : "#666", borderColor: exportFmt === id ? "#22c55e44" : "#333" }}>{label}</button>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={handleCopy}
                  style={{ ...btnS, background: copied ? "#22c55e33" : "#1a2a1a", color: "#22c55e", padding: "4px 14px", fontWeight: 600, borderColor: "#22c55e44" }}>
                  {copied ? "✓ Copied!" : "Copy to Clipboard"}
                </button>
              </div>
              <textarea readOnly value={exportData}
                style={{ width: "100%", height: 250, background: "#0a0a0a", border: "1px solid #222", borderRadius: 6, color: "#888", padding: 10, fontSize: 11, fontFamily: "monospace", lineHeight: 1.4, resize: "vertical", boxSizing: "border-box" }} />
            </div>
          )}

          {activeTab === "timeline" && (
            <div style={{ background: "#111", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <PhaseTimeline messages={results} loopThreshold={loopThreshold} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                {PHASE_DEFS.map((p, i) => (
                  <span key={i} style={{ fontSize: 8, color: "#444", display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: p.color, display: "inline-block" }} />{i}:{p.name}
                  </span>
                ))}
                <span style={{ color: "#333" }}>|</span>
                {[
                  [LOOP_COLOR, "↺ Loop"],
                  ["#06b6d4", "G Grammar"],
                  ["#f97316", "⚑ Watchword"],
                  ["#f59e0b", "◇ Structure"],
                ].map(([c, l]) => (
                  <span key={l} style={{ fontSize: 8, color: "#555", display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: c, display: "inline-block" }} />{l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeTab === "loops" && (
            <div style={{ background: "#111", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Loop connections (source → echo)</div>
              <LoopArrows messages={results} />
            </div>
          )}

          {activeTab === "chart" && (
            <div style={{ background: "#111", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <MiniChart messages={results} />
            </div>
          )}

          <div style={{ marginTop: 6 }}>
            {filtered.map((msg, i) => {
              const realIdx = results.indexOf(msg);
              return <MessageDetail key={realIdx} msg={msg} index={realIdx} />;
            })}
          </div>
        </>)}
      </div>
    </div>
  );
}

const preStyle = { background: "#0d0d0d", padding: 10, borderRadius: 4, fontSize: 11, color: "#888", whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto", lineHeight: 1.6, margin: 0, fontFamily: "monospace" };
const btnS = { background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" };
const numInput = { background: "#0a0a0a", border: "1px solid #222", color: "#ccc", padding: "3px 6px", borderRadius: 4, fontSize: 10 };
