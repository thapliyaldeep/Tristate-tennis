import { useState, useEffect, useCallback } from "react";

const FB_URL = "https://tristate-tennis-default-rtdb.firebaseio.com/state.json";

async function dbLoad() {
  try {
    const r = await fetch(FB_URL);
    const val = await r.json();
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}
async function dbSave(data) {
  try {
    await fetch(FB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify(data)),
    });
  } catch(e) { console.error("Save error", e); }
}

function genDates() {
  const dates=[], days=[], names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const start=new Date(2026,4,1), end=new Date(2026,6,5);
  for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
    dates.push(`${d.getMonth()+1}/${d.getDate()}`);
    days.push(names[d.getDay()]);
  }
  return {dates,days};
}
const {dates:ALL_DATES,days:ALL_DAYS} = genDates();

function futureDates() {
  const today=new Date(); today.setHours(0,0,0,0);
  return ALL_DATES.filter(d=>{ const [m,dy]=d.split("/").map(Number); return new Date(2026,m-1,dy)>=today; });
}

const GROUPS = {
  doubles: {
    A: ["Dhar/Vineet","Akash/Micky","Bobby/Satendra","Shailesh/Uzair"],
    B: ["Nitin/Ashish","Jai/Deep","Tarun/Sumit","Sanjay/Ravi"],
  },
  singles: {
    A: ["Bobby","Tushar","Pratyush","Sanjay","Akash"],
    B: ["Dhar","Sumit","Deep","Ashish","Viraj"],
  },
};

const DEFAULT = {
  doubles:  ["Nitin/Ashish","Jai/Deep","Tarun/Sumit","Bobby/Satendra","Akash/Micky","Dhar/Vineet","Sanjay/Ravi","Shailesh/Uzair"],
  singles:  ["Ashish","Deep","Sumit","Bobby","Akash","Dhar","Sanjay","Pratyush","Viraj","Tushar"],
  dAvail:   {
    "Nitin/Ashish":  {"5/17":"4pm w Jai-Deep","5/18":"6pm avail","5/22":"5:30pm avail"},
    "Jai/Deep":      {"5/17":"4pm w Nitin-Ashish"},
    "Tarun/Sumit":   {"5/20":"5pm avail","5/21":"5pm avail"},
    "Bobby/Satendra":{"5/18":"6pm w Akash-Micky"},
    "Akash/Micky":   {"5/18":"6pm w Bobby-Satu"},
    "Dhar/Vineet":   {"5/19":"6pm onwards"},
    "Sanjay/Ravi":   {"5/16":"5pm avail","5/17":"Anytime","5/20":"6pm avail","5/21":"6pm avail"},
  },
  sAvail:   {"Dhar":{"5/15":"5pm+","5/16":"8-10am"},"Viraj":{"5/15":"5pm+"}},
  dMatches: [], sMatches: [], did:1, sid:1,
};

// ─── Tennis scoring logic ─────────────────────────────────────────────────────
const PTS = [0,15,30,40];

function newLive() {
  return {
    sets: [],           // [{a:6,b:4}, ...]
    games: {a:0,b:0},  // current set games
    points: {a:0,b:0}, // 0-3, with deuce/ad logic
    deuce: false,
    adv: null,          // "a" or "b" or null
    serving: "a",       // who is serving
  };
}

// Returns updated live state after a point won by "a" or "b"
function addPoint(live, who) {
  let l = JSON.parse(JSON.stringify(live));
  const opp = who==="a"?"b":"a";

  // Deuce/advantage logic
  if (l.deuce) {
    if (l.adv===who) {
      // win the game
      l = winGame(l, who);
    } else if (l.adv===opp) {
      l.adv = null; // back to deuce
    } else {
      l.adv = who; // advantage
    }
    return l;
  }

  l.points[who]++;
  // Check for deuce (both at 40 = index 3)
  if (l.points.a===3 && l.points.b===3) {
    l.deuce = true;
    l.points = {a:3,b:3};
    return l;
  }
  // Check for game win
  if (l.points[who]===4) {
    l = winGame(l, who);
  }
  return l;
}

function winGame(live, who) {
  let l = JSON.parse(JSON.stringify(live));
  const opp = who==="a"?"b":"a";
  l.points = {a:0,b:0};
  l.deuce = false;
  l.adv = null;
  l.games[who]++;
  l.serving = l.serving==="a"?"b":"a"; // switch serve after each game

  // Check set win: 6 games, must lead by 2, or tiebreak at 6-6
  const gw = l.games[who], go = l.games[opp];
  const setWon = (gw>=6 && gw-go>=2) || gw===7;
  if (setWon) {
    l.sets.push({a:l.games.a, b:l.games.b});
    l.games = {a:0,b:0};
  }
  return l;
}

function setsWon(live) {
  if (!live) return {a:0,b:0};
  return live.sets.reduce((acc,s)=>{
    s.a>s.b ? acc.a++ : acc.b++;
    return acc;
  },{a:0,b:0});
}

function matchOver(live) {
  if (!live) return false;
  const sw = setsWon(live);
  return sw.a===2 || sw.b===2;
}

function liveToScore(live, nameA, nameB) {
  // Convert live state to score string format "6-4 6-3"
  const sa = live.sets.map(s=>`${s.a}-${s.b}`).join(" ");
  const sb = live.sets.map(s=>`${s.b}-${s.a}`).join(" ");
  return {sa, sb};
}

function displayPoints(live, side) {
  if (live.deuce) return live.adv===side ? "Ad" : live.adv ? "" : "40";
  return PTS[live.points[side]].toString();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcWins(score) {
  if (!score) return null;
  let w=0,l=0;
  for (const s of score.trim().split(/\s+/)) {
    const m=s.match(/^(\d+)-(\d+)$/); if(!m) return null;
    +m[1]>+m[2]?w++:l++;
  }
  return {w,l};
}

function calcGroupStandings(matches, groupMembers) {
  const st={};
  groupMembers.forEach(p=>{ st[p]={mp:0,w:0,l:0,sw:0,sl:0,pts:0}; });
  for (const m of matches) {
    if (!m.done) continue;
    if (!groupMembers.includes(m.a) || !groupMembers.includes(m.b)) continue;
    const wa=calcWins(m.sa), wb=calcWins(m.sb); if(!wa||!wb) continue;
    st[m.a].mp++; st[m.b].mp++;
    st[m.a].sw+=wa.w; st[m.a].sl+=wa.l;
    st[m.b].sw+=wb.w; st[m.b].sl+=wb.l;
    if (wa.w>wb.w) { st[m.a].w++; st[m.a].pts+=2; st[m.b].l++; }
    else           { st[m.b].w++; st[m.b].pts+=2; st[m.a].l++; }
  }
  return Object.entries(st).map(([n,v])=>({n,...v})).sort((a,b)=>b.pts-a.pts||b.w-a.w||(b.sw-b.sl)-(a.sw-a.sl));
}

function isEditable(m) {
  if (!m.done) return true;
  if (!m.completedAt) return false;
  return Date.now()-m.completedAt < 24*60*60*1000;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const inp    = {width:"100%",padding:"9px 11px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"};
const pbtn   = {padding:"8px 16px",background:"#3b82f6",border:"none",borderRadius:7,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"};
const sbtn   = {padding:"8px 16px",background:"#1e293b",border:"none",borderRadius:7,color:"#64748b",fontSize:13,cursor:"pointer"};
const lbl    = {display:"block",fontSize:11,color:"#64748b",marginBottom:5,marginTop:12,textTransform:"uppercase",letterSpacing:.5};
const redbtn = {padding:"5px 10px",background:"#2d1515",border:"none",borderRadius:6,color:"#f87171",fontSize:12,cursor:"pointer"};

function Modal({title,onClose,children}) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,padding:16}}>
      <div style={{background:"#1e293b",borderRadius:12,padding:"22px 24px",width:"100%",maxWidth:420,border:"1px solid #334155"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontWeight:700,fontSize:15,color:"#e2e8f0"}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Live Score View ─────────────────────────────────────────────────────────
function LiveScoreView({m, isKeeper, onPoint, onUndo, onEndMatch, onClose}) {
  const live = m.live || newLive();
  const sw = setsWon(live);
  const over = matchOver(live);
  const nameA = m.a, nameB = m.b;

  const bigNum = {fontSize:56,fontWeight:900,lineHeight:1,color:"#fff"};
  const smallNum = {fontSize:22,fontWeight:700,color:"#64748b"};
  const setBox = (s,i) => (
    <div key={i} style={{textAlign:"center",background:"#0f172a",borderRadius:6,padding:"4px 10px",minWidth:48}}>
      <div style={{fontSize:13,fontWeight:700,color:s.a>s.b?"#34d399":"#94a3b8"}}>{s.a}</div>
      <div style={{fontSize:10,color:"#334155",margin:"1px 0"}}>—</div>
      <div style={{fontSize:13,fontWeight:700,color:s.b>s.a?"#34d399":"#94a3b8"}}>{s.b}</div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"#07090f",zIndex:1000,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      {/* Header */}
      <div style={{background:"#0a1020",borderBottom:"1px solid #1e293b",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",animation:"pulse 1s infinite"}}/>
          <span style={{color:"#ef4444",fontWeight:700,fontSize:13,letterSpacing:1}}>LIVE</span>
          <span style={{color:"#64748b",fontSize:12,marginLeft:4}}>{m.date}{m.time?` · ${m.time}`:""}</span>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>×</button>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 16px",gap:24,maxWidth:500,margin:"0 auto",width:"100%"}}>

        {/* Sets history */}
        {live.sets.length>0&&(
          <div style={{display:"flex",gap:8}}>
            {live.sets.map((s,i)=>setBox(s,i))}
          </div>
        )}

        {/* Main scoreboard */}
        <div style={{width:"100%",background:"#0e1320",borderRadius:16,border:"1px solid #1e293b",overflow:"hidden"}}>
          {/* Player A */}
          <div style={{padding:"20px 24px",borderBottom:"1px solid #1e293b",display:"flex",justifyContent:"space-between",alignItems:"center",background:sw.a>sw.b&&over?"#064e3b22":"transparent"}}>
            <div>
              <div style={{fontWeight:800,fontSize:18,color:sw.a>sw.b&&over?"#34d399":"#e2e8f0"}}>{nameA}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{live.serving==="a"?"🎾 Serving":""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <div style={smallNum}>{sw.a}</div>
              <div style={{width:1,height:40,background:"#1e293b"}}/>
              {!over
                ? <div style={{...bigNum,color:live.adv==="a"?"#34d399":live.adv==="b"?"#475569":"#fff"}}>{live.deuce&&live.adv==="a"?"Ad":live.deuce&&!live.adv?"40":live.deuce?"":displayPoints(live,"a")}</div>
                : <div style={{fontSize:28,fontWeight:900,color:sw.a>sw.b?"#34d399":"#64748b"}}>{sw.a>sw.b?"🏆":""}</div>
              }
            </div>
          </div>

          {/* Games */}
          {!over&&(
            <div style={{padding:"10px 24px",background:"#0a1020",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:1}}>Games</div>
              <div style={{display:"flex",gap:4}}>
                <span style={{fontWeight:800,fontSize:20,color:"#93c5fd"}}>{live.games.a}</span>
                <span style={{color:"#334155",fontSize:20}}>—</span>
                <span style={{fontWeight:800,fontSize:20,color:"#93c5fd"}}>{live.games.b}</span>
              </div>
            </div>
          )}

          {/* Player B */}
          <div style={{padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",background:sw.b>sw.a&&over?"#064e3b22":"transparent"}}>
            <div>
              <div style={{fontWeight:800,fontSize:18,color:sw.b>sw.a&&over?"#34d399":"#e2e8f0"}}>{nameB}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{live.serving==="b"?"🎾 Serving":""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <div style={smallNum}>{sw.b}</div>
              <div style={{width:1,height:40,background:"#1e293b"}}/>
              {!over
                ? <div style={{...bigNum,color:live.adv==="b"?"#34d399":live.adv==="a"?"#475569":"#fff"}}>{live.deuce&&live.adv==="b"?"Ad":live.deuce&&!live.adv?"40":live.deuce?"":displayPoints(live,"b")}</div>
                : <div style={{fontSize:28,fontWeight:900,color:sw.b>sw.a?"#34d399":"#64748b"}}>{sw.b>sw.a?"🏆":""}</div>
              }
            </div>
          </div>
        </div>

        {/* Deuce label */}
        {live.deuce&&!live.adv&&!over&&(
          <div style={{background:"#1e3a5f",color:"#93c5fd",fontWeight:700,fontSize:14,padding:"6px 20px",borderRadius:20,letterSpacing:2}}>DEUCE</div>
        )}

        {/* Score keeper controls */}
        {isKeeper && !over && (
          <div style={{width:"100%"}}>
            <div style={{fontSize:11,color:"#64748b",textAlign:"center",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Award Point To</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <button onClick={()=>onPoint("a")} style={{padding:"18px",background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>
                {nameA}
              </button>
              <button onClick={()=>onPoint("b")} style={{padding:"18px",background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>
                {nameB}
              </button>
            </div>
            <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"center"}}>
              <button onClick={onUndo} style={{...sbtn,fontSize:12}}>↩ Undo</button>
            </div>
          </div>
        )}

        {/* Match over — keeper ends it */}
        {isKeeper && over && (
          <div style={{textAlign:"center"}}>
            <div style={{color:"#34d399",fontWeight:700,fontSize:18,marginBottom:16}}>
              🏆 {sw.a>sw.b?nameA:nameB} wins!
            </div>
            <button onClick={onEndMatch} style={{...pbtn,fontSize:15,padding:"12px 32px",background:"linear-gradient(135deg,#059669,#10b981)"}}>
              ✓ Save & End Match
            </button>
          </div>
        )}

        {/* Viewer — just watching */}
        {!isKeeper && over && (
          <div style={{textAlign:"center",color:"#34d399",fontWeight:700,fontSize:18}}>
            🏆 {sw.a>sw.b?nameA:nameB} wins!
          </div>
        )}

        {!isKeeper && (
          <div style={{fontSize:11,color:"#64748b",textAlign:"center"}}>👁 Viewing live — score updates every 5 seconds</div>
        )}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({m, onScore, onDel, onGoLive}) {
  const wa=m.done?calcWins(m.sa):null, wb=m.done?calcWins(m.sb):null;
  const winner=wa&&wb?(wa.w>wb.w?m.a:m.b):null;
  const locked=m.done&&!isEditable(m);
  const isLive=!!m.live&&!m.done;
  const sw=m.live?setsWon(m.live):{a:0,b:0};

  return (
    <div style={{background:"#111827",border:`1px solid ${isLive?"#ef444466":locked?"#2d1f00":m.done?"#14532d55":"#334155"}`,borderRadius:10,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      {isLive&&(
        <div style={{width:"100%",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",animation:"pulse 1s infinite"}}/>
          <span style={{color:"#ef4444",fontSize:11,fontWeight:700,letterSpacing:1}}>LIVE</span>
          <span style={{color:"#64748b",fontSize:11,marginLeft:4}}>{sw.a} — {sw.b} sets</span>
        </div>
      )}
      <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:winner===m.a?"#34d399":"#cbd5e1"}}>{m.a}</div>
          {m.done&&<div style={{fontSize:17,fontWeight:800,color:winner===m.a?"#34d399":"#475569",letterSpacing:1}}>{m.sa}</div>}
        </div>
        <div style={{color:"#475569",fontSize:11,fontWeight:700}}>VS</div>
        <div style={{flex:1,textAlign:"right"}}>
          <div style={{fontWeight:700,fontSize:14,color:winner===m.b?"#34d399":"#cbd5e1"}}>{m.b}</div>
          {m.done&&<div style={{fontSize:17,fontWeight:800,color:winner===m.b?"#34d399":"#475569",letterSpacing:1,textAlign:"right"}}>{m.sb}</div>}
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:12,color:"#64748b"}}>{m.date}{m.time?` · ${m.time}`:""}</div>
        {m.done&&winner&&<div style={{fontSize:12,color:"#10b981",marginTop:3}}>🏆 {winner}</div>}
        {locked&&<div style={{fontSize:11,color:"#f59e0b",marginTop:3}}>🔒 Locked after 24h</div>}
        <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
          {!m.done&&<button onClick={onGoLive} style={{padding:"6px 12px",background:isLive?"#2d1515":"#1a2744",border:`1px solid ${isLive?"#ef444466":"#334155"}`,borderRadius:6,color:isLive?"#ef4444":"#93c5fd",fontSize:12,cursor:"pointer"}}>{isLive?"📡 Watch Live":"📡 Go Live"}</button>}
          {!locked&&!isLive&&<button onClick={onScore} style={{padding:"6px 12px",background:"#1e3a5f",border:"none",borderRadius:6,color:"#93c5fd",fontSize:12,cursor:"pointer"}}>{m.done?"✏️ Edit":"📝 Score"}</button>}
          <button onClick={onDel} style={{padding:"6px 10px",background:"#2d1515",border:"none",borderRadius:6,color:"#f87171",fontSize:12,cursor:"pointer"}}>🗑</button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Table ─────────────────────────────────────────────────────────────
function GroupTable({label,standings}) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{background:"#1e3a5f",color:"#93c5fd",fontWeight:800,fontSize:13,padding:"4px 12px",borderRadius:6}}>GROUP {label}</div>
        <div style={{fontSize:11,color:"#64748b"}}>Top 2 advance to semi-finals</div>
      </div>
      <div style={{border:"1px solid #1e293b",borderRadius:8,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#0a1020"}}>
              {["Team/Player","MP","W","L","Pts"].map((h,i)=>(
                <th key={h} style={{padding:"9px 12px",fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,textAlign:i===0?"left":"center",borderBottom:"1px solid #1e293b"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s,i)=>{
              const q=i<2;
              return (
                <tr key={s.n} style={{background:i%2===0?"#111827":"#0f172a",borderLeft:q?"3px solid #10b981":"3px solid transparent"}}>
                  <td style={{padding:"11px 12px",borderBottom:"1px solid #1e293b"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {q&&<span style={{fontSize:10,background:"#064e3b",color:"#10b981",padding:"2px 6px",borderRadius:4,fontWeight:700}}>Q</span>}
                      <span style={{fontWeight:700,color:q?"#34d399":"#cbd5e1"}}>{s.n}</span>
                    </div>
                  </td>
                  <td style={{padding:"11px 12px",textAlign:"center",color:"#64748b",borderBottom:"1px solid #1e293b"}}>{s.mp}</td>
                  <td style={{padding:"11px 12px",textAlign:"center",color:"#10b981",fontWeight:700,borderBottom:"1px solid #1e293b"}}>{s.w}</td>
                  <td style={{padding:"11px 12px",textAlign:"center",color:"#ef4444",borderBottom:"1px solid #1e293b"}}>{s.l}</td>
                  <td style={{padding:"11px 12px",textAlign:"center",color:"#3b82f6",fontWeight:800,fontSize:15,borderBottom:"1px solid #1e293b"}}>{s.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KnockoutBracket({standA,standB}) {
  const sf1a=standA[0]?.n||"1st Group A", sf1b=standB[1]?.n||"2nd Group B";
  const sf2a=standB[0]?.n||"1st Group B", sf2b=standA[1]?.n||"2nd Group A";
  const box=(filled,label)=>(<div style={{background:filled?"#0a1e3a":"#111827",border:`1px solid ${filled?"#3b82f6":"#334155"}`,borderRadius:8,padding:"10px 14px",color:filled?"#93c5fd":"#475569",fontWeight:700,fontSize:13,minWidth:140,textAlign:"center"}}>{label}</div>);
  const vs=<div style={{color:"#475569",fontSize:11,fontWeight:700,textAlign:"center",margin:"4px 0"}}>vs</div>;
  return (
    <div style={{marginTop:8}}>
      <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:16}}>Knockout Stage</div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,overflowX:"auto"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:160}}>
          <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginBottom:6,letterSpacing:1}}>SEMI FINAL 1</div>
          {box(!!standA[0],sf1a)}{vs}{box(!!standB[1],sf1b)}
        </div>
        <div style={{width:60,height:1,background:"#334155",marginTop:28}}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:160}}>
          <div style={{fontSize:11,color:"#FFD700",fontWeight:800,marginBottom:6,letterSpacing:1}}>🏆 FINAL</div>
          {box(false,"Winner SF1")}{vs}{box(false,"Winner SF2")}
        </div>
        <div style={{width:60,height:1,background:"#334155",marginTop:28}}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:160}}>
          <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginBottom:6,letterSpacing:1}}>SEMI FINAL 2</div>
          {box(!!standB[0],sf2a)}{vs}{box(!!standA[1],sf2b)}
        </div>
      </div>
      <div style={{marginTop:12,fontSize:11,color:"#64748b",textAlign:"center"}}>1st Group A vs 2nd Group B · 1st Group B vs 2nd Group A</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data,      setData]      = useState(null);
  const [status,    setStatus]    = useState("loading");
  const [tab,       setTab]       = useState("schedule");
  const [lg,        setLg]        = useState("doubles");
  const [modal,     setModal]     = useState(null);
  const [mf,        setMf]        = useState({});
  const [liveMatch, setLiveMatch] = useState(null); // {matchId, type, isKeeper}

  const FUTURE      = futureDates();
  const defaultDate = FUTURE[0]||ALL_DATES[0];

  const load = useCallback(async (init=false) => {
    const r = await dbLoad();
    if (r) { setData(r); if(init) setStatus("ok"); }
    else if (init) { await dbSave(DEFAULT); setData(DEFAULT); setStatus("ok"); }
  },[]);

  useEffect(()=>{ load(true); },[load]);

  // Poll every 5s when watching live
  useEffect(()=>{
    if (!liveMatch) return;
    const t = setInterval(()=>load(false), 5000);
    return ()=>clearInterval(t);
  },[liveMatch,load]);

  async function upd(fn) {
    const nd=fn(data); setData(nd); setStatus("saving");
    await dbSave(nd); setStatus("ok");
  }

  if(status==="loading") return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#64748b",fontSize:15}}>🎾 Loading…</div>;
  if(status==="error")   return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#ef4444",fontSize:15,padding:24,textAlign:"center"}}>❌ Could not load data. Check connection and refresh.</div>;

  const isD     = lg==="doubles";
  const teams   = isD?data.doubles :data.singles;
  const avail   = isD?data.dAvail  :data.sAvail;
  const matches = isD?data.dMatches:data.sMatches;
  const groups  = isD?GROUPS.doubles:GROUPS.singles;
  const standA  = calcGroupStandings(matches,groups.A);
  const standB  = calcGroupStandings(matches,groups.B);
  const pending = matches.filter(m=>!m.done);
  const complete= matches.filter(m=> m.done);

  // ── Live score handlers ──
  function openLive(m, type, keeper) {
    setLiveMatch({matchId:m.id, type, isKeeper:keeper});
  }

  function getCurrentLiveMatch() {
    if (!liveMatch) return null;
    const arr = liveMatch.type==="doubles"?data.dMatches:data.sMatches;
    return arr.find(m=>m.id===liveMatch.matchId)||null;
  }

  async function handlePoint(side) {
    const m = getCurrentLiveMatch(); if(!m) return;
    const live = addPoint(m.live||newLive(), side);
    const type = liveMatch.type;
    await upd(d=>{
      const key=type==="doubles"?"dMatches":"sMatches";
      return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,live}:x)};
    });
  }

  async function handleUndo() {
    // Simple undo: reset live score (restart current game)
    const m = getCurrentLiveMatch(); if(!m) return;
    const live = m.live||newLive();
    // Just reset current game points
    const newL = {...live, points:{a:0,b:0}, deuce:false, adv:null};
    const type = liveMatch.type;
    await upd(d=>{
      const key=type==="doubles"?"dMatches":"sMatches";
      return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,live:newL}:x)};
    });
  }

  async function handleEndMatch() {
    const m = getCurrentLiveMatch(); if(!m) return;
    const live = m.live||newLive();
    const {sa,sb} = liveToScore(live, m.a, m.b);
    const type = liveMatch.type;
    const stamp = Date.now();
    await upd(d=>{
      const key=type==="doubles"?"dMatches":"sMatches";
      return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,sa,sb,done:true,completedAt:stamp,live:null}:x)};
    });
    setLiveMatch(null);
  }

  // ── Match handlers ──
  async function addMatch() {
    await upd(d=>{
      const m={id:isD?`d${d.did}`:`s${d.sid}`,a:mf.a,b:mf.b,date:mf.date||defaultDate,time:mf.time||"",sa:"",sb:"",done:false};
      return isD?{...d,dMatches:[...d.dMatches,m],did:d.did+1}:{...d,sMatches:[...d.sMatches,m],sid:d.sid+1};
    }); setModal(null);
  }
  async function delMatch(id) {
    await upd(d=>isD?{...d,dMatches:d.dMatches.filter(m=>m.id!==id)}:{...d,sMatches:d.sMatches.filter(m=>m.id!==id)});
  }
  async function saveScore() {
    await upd(d=>{
      const stamp=Date.now();
      return isD
        ?{...d,dMatches:d.dMatches.map(m=>m.id===mf.id?{...m,sa:mf.sa,sb:mf.sb,done:true,completedAt:m.completedAt||stamp}:m)}
        :{...d,sMatches:d.sMatches.map(m=>m.id===mf.id?{...m,sa:mf.sa,sb:mf.sb,done:true,completedAt:m.completedAt||stamp}:m)};
    }); setModal(null);
  }
  async function addAvail() {
    await upd(d=>{const k=isD?"dAvail":"sAvail";return{...d,[k]:{...d[k],[mf.name]:{...(d[k][mf.name]||{}),[mf.date]:mf.note}}};});
    setModal(null);
  }
  function removeAvail(name,date) {
    upd(d=>{const k=isD?"dAvail":"sAvail";const row={...(d[k][name]||{})};delete row[date];return{...d,[k]:{...d[k],[name]:row}};});
  }
  async function addTeam() {
    const name=mf.teamName?.trim(); if(!name) return;
    await upd(d=>isD?{...d,doubles:[...d.doubles,name]}:{...d,singles:[...d.singles,name]});
    setModal(null);
  }
  function removeTeam(name) {
    if(!window.confirm(`Remove "${name}"? Their matches will be kept.`)) return;
    upd(d=>isD?{...d,doubles:d.doubles.filter(t=>t!==name)}:{...d,singles:d.singles.filter(t=>t!==name)});
  }

  const statusColor={ok:"#10b981",saving:"#f59e0b",error:"#ef4444"}[status]||"#64748b";
  const statusText ={ok:"✓ Saved",saving:"💾 Saving…",error:"⚠ Save failed"}[status];

  // Show live score overlay
  const liveMatchData = liveMatch ? getCurrentLiveMatch() : null;
  if (liveMatch && liveMatchData) {
    return (
      <LiveScoreView
        m={liveMatchData}
        isKeeper={liveMatch.isKeeper}
        onPoint={handlePoint}
        onUndo={handleUndo}
        onEndMatch={handleEndMatch}
        onClose={()=>setLiveMatch(null)}
      />
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"system-ui,sans-serif"}}>
      <style>{`*{box-sizing:border-box}select,input{color-scheme:dark}button:disabled{opacity:.4;cursor:not-allowed}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* Header */}
      <div style={{background:"#0a1020",borderBottom:"1px solid #1e293b",padding:"14px 16px 0"}}>
        <div style={{maxWidth:960,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:24}}>🎾</span>
              <div>
                <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>Tristate Tennis 2026</div>
                <div style={{fontSize:11,color:"#64748b"}}>May 1 – July 5, 2026 · Shared League Manager</div>
              </div>
            </div>
            <span style={{fontSize:11,color:statusColor}}>{statusText}</span>
          </div>
          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            {[["schedule","📅 Schedule"],["scores","🎯 Scores"],["leaderboard","🏆 Standings"],["manage","⚙️ Manage"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{padding:"8px 16px",border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:tab===id?"#1e293b":"transparent",color:tab===id?"#fff":"#64748b",fontWeight:tab===id?700:400,fontSize:13}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px"}}>
        {tab!=="manage"&&(
          <div style={{display:"flex",gap:8,marginBottom:20}}>
            {[["doubles","👥 Doubles"],["singles","👤 Singles"]].map(([id,label])=>(
              <button key={id} onClick={()=>setLg(id)} style={{padding:"7px 18px",border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:600,background:lg===id?"#3b82f6":"#1e293b",color:lg===id?"#fff":"#64748b"}}>{label}</button>
            ))}
          </div>
        )}

        {/* SCHEDULE */}
        {tab==="schedule"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#fff"}}>Availability Grid</div>
              <button style={pbtn} onClick={()=>{setModal("match");setMf({a:"",b:"",date:defaultDate,time:""});}}>+ Schedule Match</button>
            </div>
            {matches.length>0&&(
              <div style={{marginBottom:20}}>
                {pending.length>0&&(
                  <>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Upcoming Matches</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8,marginBottom:16}}>
                      {pending.map(m=>(
                        <div key={m.id} style={{background:m.live?"#1a0a0a":"#0a1e3a",border:`1px solid ${m.live?"#ef444466":"#1e3a6e"}`,borderRadius:8,padding:"10px 12px"}}>
                          {m.live&&<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}><div style={{width:6,height:6,borderRadius:"50%",background:"#ef4444",animation:"pulse 1s infinite"}}/><span style={{color:"#ef4444",fontSize:10,fontWeight:700}}>LIVE</span></div>}
                          <div style={{fontWeight:700,color:m.live?"#fca5a5":"#93c5fd",fontSize:13}}>{m.a}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>vs {m.b}</div>
                          <div style={{color:"#64748b",fontSize:11,marginTop:5}}>{m.date}{m.time?` · ${m.time}`:""}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {complete.length>0&&(
                  <>
                    <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Completed Matches</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>
                      {complete.map(m=>{
                        const wa=calcWins(m.sa),wb=calcWins(m.sb);
                        const winner=wa&&wb?(wa.w>wb.w?m.a:m.b):null;
                        return(
                          <div key={m.id} style={{background:"#061a0e",border:"1px solid #14532d",borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontWeight:700,color:winner===m.a?"#34d399":"#cbd5e1",fontSize:13}}>{m.a} {winner===m.a&&"🏆"}</div>
                            <div style={{fontSize:11,color:"#64748b"}}>vs</div>
                            <div style={{fontWeight:700,color:winner===m.b?"#34d399":"#cbd5e1",fontSize:13}}>{m.b} {winner===m.b&&"🏆"}</div>
                            <div style={{color:"#10b981",fontSize:11,marginTop:5,fontWeight:600}}>{m.sa} / {m.sb}</div>
                            <div style={{color:"#64748b",fontSize:10,marginTop:3}}>{m.date}{m.time?` · ${m.time}`:""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            <div style={{overflowX:"auto",border:"1px solid #1e293b",borderRadius:8}}>
              <table style={{borderCollapse:"collapse",minWidth:700,width:"100%"}}>
                <thead>
                  <tr style={{background:"#0a1020"}}>
                    <th style={{padding:"9px 12px",textAlign:"left",color:"#64748b",fontSize:11,fontWeight:600,textTransform:"uppercase",borderBottom:"1px solid #1e293b",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:2,background:"#0a1020"}}>{isD?"Team":"Player"}</th>
                    {ALL_DATES.map((d,i)=>(
                      <th key={d} style={{padding:"9px 4px",color:"#64748b",fontSize:11,fontWeight:600,borderBottom:"1px solid #1e293b",textAlign:"center",minWidth:64}}>
                        <div style={{color:"#93c5fd"}}>{d}</div>
                        <div>{ALL_DAYS[i]}</div>
                      </th>
                    ))}
                    <th style={{padding:"9px 4px",borderBottom:"1px solid #1e293b",width:36,position:"sticky",right:0,background:"#0a1020"}}></th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((name,ri)=>(
                    <tr key={name} style={{background:ri%2===0?"#111827":"#0f172a"}}>
                      <td style={{padding:"8px 12px",fontWeight:700,color:"#cbd5e1",fontSize:13,borderBottom:"1px solid #1e293b",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:1,background:ri%2===0?"#111827":"#0f172a"}}>{name}</td>
                      {ALL_DATES.map(d=>{
                        const note=avail[name]?.[d];
                        const booked=note&&/w /i.test(note);
                        return(
                          <td key={d} style={{padding:"3px 3px",borderBottom:"1px solid #1e293b",verticalAlign:"top"}}>
                            {note?<div onClick={()=>removeAvail(name,d)} title="Click to remove" style={{background:booked?"#064e3b":"#1e3a5f",border:`1px solid ${booked?"#10b98155":"#3b82f655"}`,borderRadius:5,padding:"3px 5px",color:booked?"#10b981":"#93c5fd",fontSize:10,cursor:"pointer",lineHeight:1.4}}>{note}</div>:<div style={{height:22}}/>}
                          </td>
                        );
                      })}
                      <td style={{padding:"3px 4px",borderBottom:"1px solid #1e293b",textAlign:"center",position:"sticky",right:0,background:ri%2===0?"#111827":"#0f172a"}}>
                        <button onClick={()=>{setModal("avail");setMf({name,date:defaultDate,note:""}); }} style={{background:"none",border:"1px solid #334155",borderRadius:5,color:"#64748b",cursor:"pointer",padding:"2px 7px",fontSize:14,lineHeight:1.5}}>+</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{marginTop:8,fontSize:11,color:"#64748b"}}>🟢 Green = match booked · 🔵 Blue = available · Click any cell to remove it</div>
          </div>
        )}

        {/* SCORES */}
        {tab==="scores"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#fff"}}>Match Results</div>
              <button style={pbtn} onClick={()=>{setModal("match");setMf({a:"",b:"",date:defaultDate,time:""});}}>+ Add Match</button>
            </div>
            {matches.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:"60px 0"}}>No matches yet.</div>}
            {pending.length>0&&(
              <div style={{marginBottom:24}}>
                <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Pending</div>
                {pending.map(m=>(
                  <MatchCard key={m.id} m={m}
                    onScore={()=>{setModal("score");setMf({id:m.id,a:m.a,b:m.b,date:m.date,time:m.time,sa:"",sb:""});}}
                    onDel={()=>delMatch(m.id)}
                    onGoLive={()=>{
                      setModal("livemode");
                      setMf({matchId:m.id,matchType:isD?"doubles":"singles"});
                    }}
                  />
                ))}
              </div>
            )}
            {complete.length>0&&(
              <div>
                <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Completed</div>
                {complete.map(m=>(
                  <MatchCard key={m.id} m={m} done
                    onScore={()=>{setModal("score");setMf({id:m.id,a:m.a,b:m.b,date:m.date,time:m.time,sa:m.sa,sb:m.sb});}}
                    onDel={()=>delMatch(m.id)}
                    onGoLive={()=>{}}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD */}
        {tab==="leaderboard"&&(
          <div>
            <div style={{fontWeight:700,color:"#fff",marginBottom:20,fontSize:16}}>{isD?"Doubles":"Singles"} Points Table</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:24,marginBottom:36}}>
              <GroupTable label="A" standings={standA}/>
              <GroupTable label="B" standings={standB}/>
            </div>
            <div style={{background:"#0a1020",border:"1px solid #1e293b",borderRadius:12,padding:"20px 16px"}}>
              <KnockoutBracket standA={standA} standB={standB}/>
            </div>
          </div>
        )}

        {/* MANAGE */}
        {tab==="manage"&&(
          <div>
            <div style={{fontWeight:700,color:"#fff",fontSize:16,marginBottom:20}}>Manage Teams & Players</div>
            <div style={{marginBottom:32}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontWeight:700,color:"#93c5fd",fontSize:14}}>👥 Doubles Teams ({data.doubles.length})</div>
                <button style={pbtn} onClick={()=>{setLg("doubles");setModal("addteam");setMf({teamName:""});}}>+ Add Team</button>
              </div>
              <div style={{border:"1px solid #1e293b",borderRadius:8,overflow:"hidden"}}>
                {data.doubles.map((name,i)=>(
                  <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:i%2===0?"#111827":"#0f172a",borderBottom:"1px solid #1e293b"}}>
                    <span style={{fontWeight:600,color:"#cbd5e1"}}>{name}</span>
                    <button onClick={()=>{setLg("doubles");removeTeam(name);}} style={redbtn}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontWeight:700,color:"#93c5fd",fontSize:14}}>👤 Singles Players ({data.singles.length})</div>
                <button style={pbtn} onClick={()=>{setLg("singles");setModal("addteam");setMf({teamName:""});}}>+ Add Player</button>
              </div>
              <div style={{border:"1px solid #1e293b",borderRadius:8,overflow:"hidden"}}>
                {data.singles.map((name,i)=>(
                  <div key={name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:i%2===0?"#111827":"#0f172a",borderBottom:"1px solid #1e293b"}}>
                    <span style={{fontWeight:600,color:"#cbd5e1"}}>{name}</span>
                    <button onClick={()=>{setLg("singles");removeTeam(name);}} style={redbtn}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal==="match"&&(
        <Modal title={`Schedule ${isD?"Doubles":"Singles"} Match`} onClose={()=>setModal(null)}>
          <label style={lbl}>{isD?"Team 1":"Player 1"}</label>
          <select style={inp} value={mf.a||""} onChange={e=>setMf(f=>({...f,a:e.target.value}))}>
            <option value="">Select…</option>
            {teams.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <label style={lbl}>{isD?"Team 2":"Player 2"}</label>
          <select style={inp} value={mf.b||""} onChange={e=>setMf(f=>({...f,b:e.target.value}))}>
            <option value="">Select…</option>
            {teams.filter(t=>t!==mf.a).map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <label style={lbl}>Date</label>
          <select style={inp} value={mf.date||defaultDate} onChange={e=>setMf(f=>({...f,date:e.target.value}))}>
            {ALL_DATES.map((d,i)=><option key={d} value={d}>{d} ({ALL_DAYS[i]})</option>)}
          </select>
          <label style={lbl}>Time</label>
          <input style={inp} placeholder="e.g. 5:30pm" value={mf.time||""} onChange={e=>setMf(f=>({...f,time:e.target.value}))}/>
          <div style={{display:"flex",gap:8,marginTop:18}}>
            <button style={pbtn} disabled={!mf.a||!mf.b} onClick={addMatch}>Schedule</button>
            <button style={sbtn} onClick={()=>setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
      {modal==="score"&&(
        <Modal title="Enter Score" onClose={()=>setModal(null)}>
          <div style={{background:"#0f172a",borderRadius:8,padding:12,textAlign:"center",marginBottom:4}}>
            <div style={{fontWeight:700,color:"#fff",fontSize:15}}>{mf.a} <span style={{color:"#64748b",fontWeight:400}}>vs</span> {mf.b}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{mf.date}{mf.time?` · ${mf.time}`:""}</div>
          </div>
          <div style={{fontSize:11,color:"#64748b",textAlign:"center",margin:"8px 0 2px"}}>Sets separated by spaces — e.g. <code style={{background:"#334155",padding:"1px 4px",borderRadius:3}}>6-4 3-6 7-5</code></div>
          <label style={lbl}>{mf.a}</label>
          <input style={inp} placeholder="6-4 6-2" value={mf.sa||""} onChange={e=>setMf(f=>({...f,sa:e.target.value}))}/>
          <label style={lbl}>{mf.b}</label>
          <input style={inp} placeholder="4-6 2-6" value={mf.sb||""} onChange={e=>setMf(f=>({...f,sb:e.target.value}))}/>
          <div style={{display:"flex",gap:8,marginTop:18}}>
            <button style={pbtn} disabled={!mf.sa||!mf.sb} onClick={saveScore}>Save Score</button>
            <button style={sbtn} onClick={()=>setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
      {modal==="livemode"&&(
        <Modal title="Start Live Scoring" onClose={()=>setModal(null)}>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:16}}>Are you the score keeper or a viewer?</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>{
              const m=matches.find(x=>x.id===mf.matchId);
              if(!m) return;
              // Init live state if not started
              if(!m.live){
                upd(d=>{
                  const key=mf.matchType==="doubles"?"dMatches":"sMatches";
                  return {...d,[key]:d[key].map(x=>x.id===mf.matchId?{...x,live:newLive()}:x)};
                });
              }
              setModal(null);
              openLive(m, mf.matchType, true);
            }} style={{...pbtn,justifyContent:"center",padding:"12px",fontSize:14}}>
              🎾 I am the Score Keeper
            </button>
            <button onClick={()=>{
              const m=matches.find(x=>x.id===mf.matchId);
              if(!m) return;
              setModal(null);
              openLive(m, mf.matchType, false);
            }} style={{...sbtn,justifyContent:"center",padding:"12px",fontSize:14,color:"#93c5fd"}}>
              👁 Watch Live
            </button>
          </div>
        </Modal>
      )}
      {modal==="avail"&&(
        <Modal title={`Add Availability — ${mf.name}`} onClose={()=>setModal(null)}>
          <label style={lbl}>Date</label>
          {FUTURE.length===0
            ?<div style={{color:"#64748b",fontSize:13,marginTop:8}}>No future dates available.</div>
            :<select style={inp} value={mf.date||defaultDate} onChange={e=>setMf(f=>({...f,date:e.target.value}))}>
               {FUTURE.map(d=>{const gi=ALL_DATES.indexOf(d);return <option key={d} value={d}>{d} ({ALL_DAYS[gi]})</option>;})}
             </select>
          }
          <label style={lbl}>Note</label>
          <input style={inp} placeholder="e.g. 6pm available" value={mf.note||""} onChange={e=>setMf(f=>({...f,note:e.target.value}))}/>
          <div style={{display:"flex",gap:8,marginTop:18}}>
            <button style={pbtn} disabled={!mf.note||FUTURE.length===0} onClick={addAvail}>Add</button>
            <button style={sbtn} onClick={()=>setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
      {modal==="addteam"&&(
        <Modal title={isD?"Add Doubles Team":"Add Singles Player"} onClose={()=>setModal(null)}>
          <label style={lbl}>{isD?"Team Name":"Player Name"}</label>
          <input style={inp} placeholder={isD?"e.g. Rahul/Vikram":"e.g. Rahul"} value={mf.teamName||""} onChange={e=>setMf(f=>({...f,teamName:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter"&&mf.teamName?.trim()) addTeam();}} autoFocus/>
          {isD&&<div style={{fontSize:11,color:"#64748b",marginTop:6}}>Use "Name1/Name2" format</div>}
          <div style={{display:"flex",gap:8,marginTop:18}}>
            <button style={pbtn} disabled={!mf.teamName?.trim()} onClick={addTeam}>Add</button>
            <button style={sbtn} onClick={()=>setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
