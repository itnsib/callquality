import { useState, useRef } from "react";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const categoryMeta = {
  greeting:           { label: "Greeting & Intro",      max: 10, icon: "👋" },
  needs_discovery:    { label: "Needs Discovery",       max: 20, icon: "🔍" },
  product_knowledge:  { label: "Product Knowledge",     max: 20, icon: "📋" },
  objection_handling: { label: "Objection Handling",    max: 20, icon: "🛡️" },
  compliance:         { label: "Compliance & Honesty",  max: 15, icon: "⚖️" },
  closing:            { label: "Closing Technique",     max: 15, icon: "🎯" },
};

function ScoreRing({ score, max = 100, size = 120 }) {
  const pct = score / max;
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct >= 0.9 ? "#4ade80" : pct >= 0.75 ? "#60a5fa" : pct >= 0.6 ? "#fbbf24" : "#f87171";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={10}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={28} fontWeight="700"
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>{score}</text>
      <text x={size/2} y={size/2+20} textAnchor="middle" dominantBaseline="middle"
        fill="#64748b" fontSize={11}
        style={{ transform:`rotate(90deg)`, transformOrigin:`${size/2}px ${size/2}px` }}>/ {max}</text>
    </svg>
  );
}

function Bar({ score, max }) {
  const pct = (score / max) * 100;
  const color = pct >= 90 ? "#4ade80" : pct >= 75 ? "#60a5fa" : pct >= 60 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ background:"#0f172a", borderRadius:6, height:8, width:"100%" }}>
      <div style={{ height:"100%", width:`${pct}%`, borderRadius:6, background:color, transition:"width 1.2s ease" }}/>
    </div>
  );
}

function Bdg({ color, text }) {
  return (
    <span style={{ display:"inline-block", background:color+"22", color, border:`1px solid ${color}44`,
      borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:600, marginRight:6, marginBottom:4 }}>
      {text}
    </span>
  );
}

const toBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

export default function App() {
  const [agentName, setAgentName] = useState("");
  const [file, setFile]           = useState(null);
  const [step, setStep]           = useState("input");
  const [statusMsg, setStatusMsg] = useState("");
  const [pct, setPct]             = useState(0);
  const [results, setResults]     = useState(null);
  const [txText, setTxText]       = useState("");
  const [showTx, setShowTx]       = useState(false);
  const [error, setError]         = useState("");
  const fileRef                   = useRef();

  const buildPrompt = (tx) => `You are a senior QA evaluator for New Shield Insurance Brokers (NSIB), a UAE insurance brokerage. Evaluate the telesales call transcript below.

Return ONLY valid raw JSON — no markdown, no backticks, no text before or after:

{
  "overall_score": <number 0-100>,
  "grade": "<A|B|C|D|F>",
  "verdict": "<one sentence>",
  "summary": "<2-3 sentence assessment>",
  "agent_name": "<name from call or '${agentName||"Unknown"}'>",
  "sentiment": "<Positive|Neutral|Negative>",
  "call_outcome": "<Interested|Follow-up Needed|Not Interested|Sale Closed|Unknown>",
  "categories": {
    "greeting":           {"score":<0-10>,"max":10,"good":"<strength>","improve":"<improvement>"},
    "needs_discovery":    {"score":<0-20>,"max":20,"good":"<strength>","improve":"<improvement>"},
    "product_knowledge":  {"score":<0-20>,"max":20,"good":"<strength>","improve":"<improvement>"},
    "objection_handling": {"score":<0-20>,"max":20,"good":"<strength>","improve":"<improvement>"},
    "compliance":         {"score":<0-15>,"max":15,"good":"<strength>","improve":"<improvement>"},
    "closing":            {"score":<0-15>,"max":15,"good":"<strength>","improve":"<improvement>"}
  },
  "coaching_tips": ["<tip1>","<tip2>","<tip3>"],
  "red_flags": [],
  "best_moments": ["<moment1>","<moment2>"]
}

Scoring:
- Greeting (10): warm professional opening, stated name/company, positive tone
- Needs Discovery (20): open-ended questions, understood situation, identified insurance need
- Product Knowledge (20): accurate coverage/benefits/pricing, matched to customer need
- Objection Handling (20): empathetic responses, no pressure or manipulation
- Compliance (15): no false promises, disclosed exclusions/terms, ethical conduct
- Closing (15): summarized benefits, asked for commitment, set next steps

TRANSCRIPT:
${tx}`;

  const run = async () => {
    if (!file) { setError("Please select a call recording."); return; }
    if (file.size > 24 * 1024 * 1024) { setError("File too large. Max 24MB. Trim or re-export from 3CX."); return; }
    setError(""); setStep("processing");

    try {
      // Step 1: Transcribe via Netlify function (Groq Whisper server-side)
      setPct(15); setStatusMsg("Uploading to transcription service...");
      const b64 = await toBase64(file);
      setPct(30); setStatusMsg("Transcribing speech to text...");

      const txRes = await fetch("/.netlify/functions/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: b64,
          fileName: file.name,
          mimeType: file.type || "audio/wav",
        }),
      });

      const txData = await txRes.json();
      if (!txRes.ok || txData.error) throw new Error(txData.error || "Transcription failed");

      const transcript = txData.transcript;
      if (!transcript?.trim()) throw new Error("Empty transcript — check the audio file.");

      setTxText(transcript);
      setPct(65); setStatusMsg("Scoring call with Claude AI...");

      // Step 2: Analyse via Netlify function (server-side Claude call)
      const cRes = await fetch("/.netlify/functions/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, agentName }),
      });

      const parsed = await cRes.json();
      if (!cRes.ok || parsed.error) throw new Error(parsed.error || "Analysis failed");
      setPct(100);
      setResults(parsed);
      setStep("results");

    } catch(e) {
      setError(e.message);
      setStep("input");
    }
  };

  const reset = () => {
    setStep("input"); setResults(null); setError(""); setFile(null);
    setShowTx(false); setTxText(""); setPct(0); setStatusMsg("");
  };

  const gc = (g) => ({ A:"#4ade80", B:"#60a5fa", C:"#fbbf24", D:"#f87171", F:"#ef4444" }[g] || "#64748b");

  const s = {
    app:  { minHeight:"100vh", background:"#020817", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#e2e8f0", padding:"24px 16px" },
    wrap: { maxWidth:760, margin:"0 auto" },
    card: { background:"#0f172a", border:"1px solid #1e293b", borderRadius:16, padding:24, marginBottom:16 },
    lbl:  { display:"block", fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:1.2, marginBottom:8 },
    inp:  { width:"100%", background:"#020817", border:"1px solid #1e293b", borderRadius:10, padding:"11px 14px", color:"#e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box" },
    btn:  { width:"100%", padding:"14px", background:"linear-gradient(135deg,#1d4ed8,#2563eb)", border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:12 },
    err:  { background:"#1c0a0a", border:"1px solid #7f1d1d", borderRadius:10, padding:"11px 14px", color:"#f87171", fontSize:13, marginTop:10 },
    sec:  { fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:1.5, marginBottom:12 },
    tip:  (c) => ({ background:c+"0d", borderLeft:`3px solid ${c}`, borderRadius:8, padding:"9px 13px", marginBottom:8, fontSize:13,
            color:c==="#22c55e"?"#86efac":c==="#ef4444"?"#fca5a5":"#cbd5e1", lineHeight:1.5 }),
    g2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },
  };

  return (
    <div style={s.app}>
      <div style={s.wrap}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:30 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#0f172a", border:"1px solid #1e3a5f", borderRadius:12, padding:"7px 16px", marginBottom:14 }}>
            <span>📞</span>
            <span style={{ fontSize:11, fontWeight:700, color:"#60a5fa", letterSpacing:2, textTransform:"uppercase" }}>NSIB · Call QA</span>
          </div>
          <h1 style={{ fontSize:24, fontWeight:700, color:"#f8fafc", margin:"0 0 6px" }}>Telesales Quality Analyser</h1>
          <p style={{ color:"#475569", fontSize:13, margin:0 }}>Upload recording → auto-transcribe → AI score report</p>
        </div>

        {step === "input" && (
          <>
            <div style={s.card}>
              <label style={s.lbl}>Agent Name <span style={{ color:"#475569",fontWeight:400,textTransform:"none",fontSize:11 }}>(optional)</span></label>
              <input style={s.inp} placeholder="e.g. Neema, Ahmed, Sara..." value={agentName} onChange={e=>setAgentName(e.target.value)}/>
            </div>

            <div style={s.card}>
              <label style={s.lbl}>Call Recording <span style={{ color:"#ef4444" }}>*</span></label>
              <div style={{ border:"2px dashed", borderColor:file?"#3b82f6":"#1e293b", borderRadius:12, padding:28,
                textAlign:"center", cursor:"pointer", background:file?"#0a1628":"transparent" }}
                onClick={()=>fileRef.current.click()}
                onDrop={e=>{ e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
                onDragOver={e=>e.preventDefault()}>
                <input ref={fileRef} type="file" accept=".mp3,.wav,.m4a,.ogg,.flac,.webm" style={{ display:"none" }}
                  onChange={e=>setFile(e.target.files[0])}/>
                {file ? (
                  <>
                    <div style={{ fontSize:30, marginBottom:8 }}>🎙️</div>
                    <div style={{ fontSize:14, color:"#60a5fa", fontWeight:600 }}>{file.name}</div>
                    <div style={{ fontSize:12, color:"#475569", marginTop:4 }}>{(file.size/1024/1024).toFixed(2)} MB · Click to change</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:30, marginBottom:8 }}>📁</div>
                    <div style={{ fontSize:14, color:"#64748b" }}>Drop recording here or <span style={{ color:"#60a5fa" }}>browse</span></div>
                    <div style={{ fontSize:12, color:"#334155", marginTop:4 }}>WAV · MP3 · M4A · OGG · up to 24MB</div>
                  </>
                )}
              </div>
            </div>

            {error && <div style={s.err}>⚠️ {error}</div>}
            <button style={s.btn} onClick={run}>🔍 Transcribe & Analyse Call</button>

            <div style={{ ...s.card, marginTop:16 }}>
              <div style={s.sec}>What gets scored (100 pts total)</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.values(categoryMeta).map(c=>(
                  <div key={c.label} style={{ background:"#020817", borderRadius:8, padding:"5px 11px", fontSize:12, color:"#94a3b8" }}>
                    {c.icon} {c.label} <span style={{ color:"#3b82f6" }}>({c.max})</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === "processing" && (
          <div style={{ ...s.card, textAlign:"center", padding:"52px 32px" }}>
            <div style={{ fontSize:44, marginBottom:16 }}>🤖</div>
            <div style={{ fontSize:17, fontWeight:600, color:"#e2e8f0", marginBottom:6 }}>Analysing call...</div>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:20 }}>{statusMsg}</div>
            <div style={{ background:"#1e293b", borderRadius:8, height:8, overflow:"hidden", maxWidth:400, margin:"0 auto" }}>
              <div style={{ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#1d4ed8,#60a5fa)", borderRadius:8, transition:"width 0.8s ease" }}/>
            </div>
            <div style={{ fontSize:12, color:"#3b82f6", marginTop:8 }}>{pct}%</div>
          </div>
        )}

        {step === "results" && results && (
          <>
            <div style={{ ...s.card, display:"flex", alignItems:"center", gap:22, flexWrap:"wrap" }}>
              <ScoreRing score={results.overall_score}/>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:10 }}>
                  <span style={{ fontSize:40, fontWeight:800, color:gc(results.grade), lineHeight:1 }}>{results.grade}</span>
                  <span style={{ background:gc(results.grade)+"22", color:gc(results.grade), border:`1px solid ${gc(results.grade)}44`, borderRadius:6, padding:"4px 12px", fontSize:12, fontWeight:600 }}>{results.verdict}</span>
                </div>
                <p style={{ fontSize:13, color:"#94a3b8", margin:"0 0 12px", lineHeight:1.6 }}>{results.summary}</p>
                <Bdg color="#60a5fa" text={"👤 " + results.agent_name}/>
                <Bdg color={results.sentiment==="Positive"?"#4ade80":results.sentiment==="Negative"?"#f87171":"#fbbf24"}
                  text={(results.sentiment==="Positive"?"😊 ":results.sentiment==="Negative"?"😟 ":"😐 ")+results.sentiment}/>
                <Bdg color="#a78bfa" text={"📞 "+(results.call_outcome||"Unknown")}/>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.sec}>Score Breakdown</div>
              {Object.entries(categoryMeta).map(([key,meta])=>{
                const cat = results.categories?.[key]; if(!cat) return null;
                const p = (cat.score/meta.max)*100;
                const col = p>=90?"#4ade80":p>=75?"#60a5fa":p>=60?"#fbbf24":"#f87171";
                return (
                  <div key={key} style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:14, fontWeight:500, color:"#cbd5e1" }}>{meta.icon} {meta.label}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:col }}>{cat.score}<span style={{ color:"#475569",fontWeight:400 }}>/{meta.max}</span></span>
                    </div>
                    <Bar score={cat.score} max={meta.max}/>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
                      <div style={{ fontSize:12, color:"#4ade80", lineHeight:1.5 }}>✓ {cat.good}</div>
                      <div style={{ fontSize:12, color:"#fb923c", lineHeight:1.5 }}>↑ {cat.improve}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}>💡 Coaching Tips</div>
                {results.coaching_tips?.map((t,i)=><div key={i} style={s.tip("#3b82f6")}>{t}</div>)}
              </div>
              <div style={s.card}>
                <div style={s.sec}>⭐ Best Moments</div>
                {results.best_moments?.map((b,i)=><div key={i} style={s.tip("#22c55e")}>{b}</div>)}
              </div>
            </div>

            {results.red_flags?.filter(f=>f).length>0 && (
              <div style={s.card}>
                <div style={s.sec}>🚨 Red Flags</div>
                {results.red_flags.filter(f=>f).map((f,i)=><div key={i} style={s.tip("#ef4444")}>{f}</div>)}
              </div>
            )}

            {txText && (
              <div style={s.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={s.sec}>📝 Transcript</div>
                  <button style={{ background:"transparent", border:"1px solid #1e293b", borderRadius:8, padding:"5px 11px", color:"#60a5fa", fontSize:12, cursor:"pointer" }}
                    onClick={()=>setShowTx(!showTx)}>{showTx?"Hide":"Show"}</button>
                </div>
                {showTx && (
                  <div style={{ background:"#020817", border:"1px solid #1e293b", borderRadius:10, padding:14, fontSize:12, color:"#94a3b8", lineHeight:1.8, maxHeight:240, overflowY:"auto", marginTop:10, whiteSpace:"pre-wrap" }}>
                    {txText}
                  </div>
                )}
              </div>
            )}

            <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:4 }}>
              <button style={{ background:"transparent", border:"1px solid #334155", borderRadius:10, padding:"10px 18px", color:"#94a3b8", fontSize:13, cursor:"pointer" }}
                onClick={reset}>← Another Call</button>
              <button style={{ background:"transparent", border:"1px solid #1e3a5f", borderRadius:10, padding:"10px 18px", color:"#60a5fa", fontSize:13, cursor:"pointer" }}
                onClick={()=>{
                  const blob=new Blob([JSON.stringify({...results,transcript:txText},null,2)],{type:"application/json"});
                  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
                  a.download=`QA_${results.agent_name}_${new Date().toISOString().slice(0,10)}.json`; a.click();
                }}>⬇ Export JSON</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
