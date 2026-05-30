import { useState, useEffect, useCallback } from "react";

const FB_URL = "https://tristate-tennis-default-rtdb.firebaseio.com/state.json";

// Stable device ID — set once at module load, persists in localStorage
const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem("tristate_device_id");
    if (!id) { id = Math.random().toString(36).slice(2); localStorage.setItem("tristate_device_id", id); }
    return id;
  } catch { return Math.random().toString(36).slice(2); }
})();

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
  dMatches: [], sMatches: [], did:1, sid:1, banter: [], polls: {}, tournPoll: {doubles:{}, singles:{}}, bets: {}, betPoints: {},
};

// ─── Tennis scoring logic ─────────────────────────────────────────────────────
const PTS = [0,15,30,40];

function newLive(serving="a") {
  return {
    sets: [],
    games: {a:0,b:0},
    points: {a:0,b:0},
    deuce: false,
    adv: null,
    serving,
    history: [],        // stack of previous states for undo
    startTs: Date.now(),
    setTs: [Date.now()],   // timestamp when each set started
    gameTs: [Date.now()],  // timestamp when each game started
    pointLog: [],          // [{who, ts, gameIdx, setIdx}]
    totalGames: 0,
  };
}

// Returns updated live state after a point won by "a" or "b"
function addPoint(live, who) {
  // Save snapshot to history before mutating (for undo)
  const snapshot = JSON.parse(JSON.stringify(live));
  snapshot.history = []; // don't nest history inside history
  let l = JSON.parse(JSON.stringify(live));
  l.history = [...(l.history||[]), snapshot];
  if (l.history.length > 50) l.history = l.history.slice(-50); // cap at 50
  const opp = who==="a"?"b":"a";
  const now = Date.now();

  // Log the point
  l.pointLog = [...(l.pointLog||[]), {who, ts:now, set:l.sets.length, game:l.totalGames||0}];

  // Deuce/advantage logic
  if (l.deuce) {
    if (l.adv===who) { l = winGame(l, who); }
    else if (l.adv===opp) { l.adv = null; }
    else { l.adv = who; }
    return l;
  }

  l.points[who]++;
  if (l.points.a===3 && l.points.b===3) {
    l.deuce = true;
    l.points = {a:3,b:3};
    return l;
  }
  if (l.points[who]===4) { l = winGame(l, who); }
  return l;
}

// Undo last point
function undoPoint(live) {
  if (!live.history || live.history.length===0) return live;
  const prev = live.history[live.history.length-1];
  // Restore previous state but keep full history minus last entry
  return {...prev, history: live.history.slice(0,-1)};
}

function winGame(live, who) {
  let l = JSON.parse(JSON.stringify(live));
  const opp = who==="a"?"b":"a";
  const now = Date.now();
  l.points = {a:0,b:0};
  l.deuce = false;
  l.adv = null;
  l.games[who]++;
  l.totalGames = (l.totalGames||0) + 1;
  l.serving = l.serving==="a"?"b":"a";
  l.gameTs = [...(l.gameTs||[]), now];

  const gw = l.games[who], go = l.games[opp];
  const setWon = (gw>=6 && gw-go>=2) || gw===7;
  if (setWon) {
    l.sets.push({a:l.games.a, b:l.games.b, endTs:now});
    l.games = {a:0,b:0};
    l.setTs = [...(l.setTs||[]), now];
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
function fmt(ms) {
  if (!ms || ms<0) return "0:00";
  const s=Math.floor(ms/1000), m=Math.floor(s/60), sec=s%60;
  return `${m}:${sec.toString().padStart(2,"0")}`;
}

function MatchMetrics({live, nameA, nameB}) {
  const now = Date.now();
  const elapsed = now - (live.startTs||now);
  const sets = live.sets||[];
  const gameTs = live.gameTs||[];
  const setTs  = live.setTs||[];
  const pointLog = live.pointLog||[];

  // Game durations
  const gameDurations = [];
  for (let i=1; i<gameTs.length; i++) gameDurations.push(gameTs[i]-gameTs[i-1]);
  const avgGame = gameDurations.length ? gameDurations.reduce((s,v)=>s+v,0)/gameDurations.length : 0;
  const maxGame = gameDurations.length ? Math.max(...gameDurations) : 0;

  // Set durations
  const setDurations = [];
  for (let i=1; i<setTs.length; i++) setDurations.push(setTs[i]-setTs[i-1]);

  // Points per player
  const ptsA = pointLog.filter(p=>p.who==="a").length;
  const ptsB = pointLog.filter(p=>p.who==="b").length;

  const row = (label, val) => (
    <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1e293b"}}>
      <span style={{color:"#64748b",fontSize:13}}>{label}</span>
      <span style={{color:"#e2e8f0",fontWeight:600,fontSize:13}}>{val}</span>
    </div>
  );

  return (
    <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:"16px",marginTop:16}}>
      <div style={{fontWeight:700,color:"#fff",marginBottom:12,fontSize:14}}>📊 Match Stats</div>
      {row("Match Duration", fmt(elapsed))}
      {row(`Total Points (${nameA})`, ptsA)}
      {row(`Total Points (${nameB})`, ptsB)}
      {row("Total Games", live.totalGames||0)}
      {avgGame>0&&row("Avg Game Duration", fmt(avgGame))}
      {maxGame>0&&row("Longest Game", fmt(maxGame))}
      {setDurations.map((d,i)=>row(`Set ${i+1} Duration`, fmt(d)))}
      {sets.map((s,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1e293b"}}>
          <span style={{color:"#64748b",fontSize:13}}>Set {i+1}</span>
          <span style={{color:s.a>s.b?"#34d399":"#f87171",fontWeight:600,fontSize:13}}>{s.a}-{s.b} {s.a>s.b?nameA:nameB}</span>
        </div>
      ))}
    </div>
  );
}

function TossScreen({nameA, nameB, onTossResult}) {
  const [flipping, setFlipping] = useState(false);
  const [winner, setWinner]     = useState(null); // "a" or "b"
  const [choice, setChoice]     = useState(null); // "serve" or "receive"

  function flipCoin() {
    setFlipping(true);
    setTimeout(()=>{
      setWinner(Math.random()<.5?"a":"b");
      setFlipping(false);
    }, 1200);
  }

  function confirm() {
    if (!winner || !choice) return;
    // If toss winner chose serve, they serve. If receive, opponent serves.
    const serving = choice==="serve" ? winner : (winner==="a"?"b":"a");
    onTossResult(serving);
  }

  const winnerName = winner==="a"?nameA:nameB;

  return (
    <div style={{position:"fixed",inset:0,background:"#07090f",zIndex:1000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,gap:24}}>
      <div style={{fontSize:22,fontWeight:800,color:"#fff"}}>🎾 Pre-Match Toss</div>
      <div style={{fontSize:14,color:"#64748b"}}>Flip a coin to decide who serves first</div>

      {/* Coin */}
      <div onClick={!flipping&&!winner?flipCoin:undefined}
        style={{width:100,height:100,borderRadius:"50%",background:flipping?"linear-gradient(135deg,#FFD700,#f59e0b)":"linear-gradient(135deg,#1d4ed8,#3b82f6)",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,cursor:!winner&&!flipping?"pointer":"default",
          boxShadow:"0 8px 32px #0008",transition:"all .3s",
          animation:flipping?"spin 0.3s linear infinite":"none"}}>
        {flipping?"🪙":winner?"✓":"🪙"}
      </div>
      <style>{`@keyframes spin{to{transform:rotateY(360deg)}}`}</style>

      {!winner&&!flipping&&<button onClick={flipCoin} style={{padding:"12px 32px",background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer"}}>Flip Coin</button>}

      {winner&&(
        <div style={{textAlign:"center",width:"100%",maxWidth:320}}>
          <div style={{fontWeight:800,fontSize:18,color:"#34d399",marginBottom:4}}>{winnerName} wins the toss!</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>Choose:</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
            <button onClick={()=>setChoice("serve")} style={{padding:"14px",background:choice==="serve"?"#1d4ed8":"#111827",border:`2px solid ${choice==="serve"?"#3b82f6":"#334155"}`,borderRadius:10,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
              🎾 Serve First
            </button>
            <button onClick={()=>setChoice("receive")} style={{padding:"14px",background:choice==="receive"?"#1d4ed8":"#111827",border:`2px solid ${choice==="receive"?"#3b82f6":"#334155"}`,borderRadius:10,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>
              🏃 Receive First
            </button>
          </div>
          {choice&&<button onClick={confirm} style={{width:"100%",padding:"12px",background:"#10b981",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer"}}>
            Start Match ▶
          </button>}
        </div>
      )}
    </div>
  );
}

function LiveScoreView({m, isKeeper, onPoint, onUndo, onEndMatch, onClose, onHandoff}) {
  const live = m.live || newLive();
  const sw = setsWon(live);
  const over = matchOver(live);
  const nameA = m.a, nameB = m.b;
  const [showStats, setShowStats] = useState(false);
  const canUndo = isKeeper && (live.history||[]).length > 0;

  const bigNum = {fontSize:56,fontWeight:900,lineHeight:1,color:"#fff"};
  const smallNum = {fontSize:22,fontWeight:700,color:"#64748b"};

  const setBox = (s,i,isCurrent) => (
    <div key={i} style={{textAlign:"center",background:isCurrent?"#1e3a5f":"#0f172a",borderRadius:8,padding:"8px 14px",minWidth:60,border:isCurrent?"1px solid #3b82f655":"1px solid transparent"}}>
      {isCurrent&&<div style={{fontSize:9,color:"#3b82f6",fontWeight:700,letterSpacing:1,marginBottom:4,textTransform:"uppercase"}}>Current</div>}
      {!isCurrent&&<div style={{fontSize:9,color:"#475569",marginBottom:4}}>Set {i+1}</div>}
      <div style={{fontSize:22,fontWeight:900,color:s.a>s.b?"#34d399":"#94a3b8",lineHeight:1}}>{s.a}</div>
      <div style={{fontSize:11,color:"#334155",margin:"3px 0"}}>—</div>
      <div style={{fontSize:22,fontWeight:900,color:s.b>s.a?"#34d399":"#94a3b8",lineHeight:1}}>{s.b}</div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"#07090f",zIndex:1000,display:"flex",flexDirection:"column",overflowY:"auto"}}>
      {/* Header */}
      <div style={{background:"#0a1020",borderBottom:"1px solid #1e293b",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",animation:"pulse 1s infinite"}}/>
          <span style={{color:"#ef4444",fontWeight:700,fontSize:13,letterSpacing:1}}>LIVE</span>
          <span style={{color:"#64748b",fontSize:12,marginLeft:4}}>{m.date}{m.time?` · ${m.time}`:""}</span>
          {live.startTs&&<span style={{color:"#64748b",fontSize:11,marginLeft:4}}>· {fmt(Date.now()-live.startTs)}</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowStats(v=>!v)} style={{background:"#1e293b",border:"none",borderRadius:6,color:"#64748b",cursor:"pointer",padding:"5px 10px",fontSize:12}}>📊</button>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>×</button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 16px",gap:20,maxWidth:500,margin:"0 auto",width:"100%"}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",justifyContent:"center",flexWrap:"wrap"}}>
          {live.sets.map((s,i)=>setBox(s,i,false))}
          {!over&&setBox({a:live.games.a,b:live.games.b},live.sets.length,true)}
        </div>

        {/* Scoreboard */}
        <div style={{width:"100%",background:"#0e1320",borderRadius:16,border:"1px solid #1e293b",overflow:"hidden"}}>
          <div style={{padding:"20px 24px",borderBottom:"1px solid #1e293b",display:"flex",justifyContent:"space-between",alignItems:"center",background:sw.a>sw.b&&over?"#064e3b22":"transparent"}}>
            <div>
              <div style={{fontWeight:800,fontSize:18,color:sw.a>sw.b&&over?"#34d399":"#e2e8f0"}}>{nameA}</div>
              <div style={{fontSize:11,color:"#3b82f6",marginTop:2}}>{live.serving==="a"?"🎾 Serving":""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <div style={smallNum}>{sw.a}</div>
              <div style={{width:1,height:40,background:"#1e293b"}}/>
              {!over
                ? <div style={{...bigNum,color:live.adv==="a"?"#34d399":live.adv==="b"?"#475569":"#fff"}}>{displayPoints(live,"a")}</div>
                : <div style={{fontSize:28,fontWeight:900,color:sw.a>sw.b?"#34d399":"#64748b"}}>{sw.a>sw.b?"🏆":""}</div>
              }
            </div>
          </div>



          <div style={{padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",background:sw.b>sw.a&&over?"#064e3b22":"transparent"}}>
            <div>
              <div style={{fontWeight:800,fontSize:18,color:sw.b>sw.a&&over?"#34d399":"#e2e8f0"}}>{nameB}</div>
              <div style={{fontSize:11,color:"#3b82f6",marginTop:2}}>{live.serving==="b"?"🎾 Serving":""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              <div style={smallNum}>{sw.b}</div>
              <div style={{width:1,height:40,background:"#1e293b"}}/>
              {!over
                ? <div style={{...bigNum,color:live.adv==="b"?"#34d399":live.adv==="a"?"#475569":"#fff"}}>{displayPoints(live,"b")}</div>
                : <div style={{fontSize:28,fontWeight:900,color:sw.b>sw.a?"#34d399":"#64748b"}}>{sw.b>sw.a?"🏆":""}</div>
              }
            </div>
          </div>
        </div>

        {live.deuce&&!live.adv&&!over&&(
          <div style={{background:"#1e3a5f",color:"#93c5fd",fontWeight:700,fontSize:14,padding:"6px 20px",borderRadius:20,letterSpacing:2}}>DEUCE</div>
        )}

        {/* Keeper controls */}
        {isKeeper&&!over&&(
          <div style={{width:"100%"}}>
            <div style={{fontSize:11,color:"#64748b",textAlign:"center",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>Award Point To</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <button onClick={()=>onPoint("a")} style={{padding:"20px",background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",active:{opacity:.8}}}>
                {nameA}
              </button>
              <button onClick={()=>onPoint("b")} style={{padding:"20px",background:"linear-gradient(135deg,#1d4ed8,#2563eb)",border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>
                {nameB}
              </button>
            </div>
            <div style={{display:"flex",gap:10,marginTop:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={onUndo} disabled={!canUndo}
                style={{...sbtn,fontSize:12,opacity:canUndo?1:.4,cursor:canUndo?"pointer":"not-allowed"}}>
                ↩ Undo Last Point
              </button>
              <button onClick={onHandoff}
                style={{...sbtn,fontSize:12,color:"#f59e0b",borderColor:"#f59e0b44"}}>
                🔁 Hand Off Scoring
              </button>
            </div>
          </div>
        )}

        {isKeeper&&over&&(
          <div style={{textAlign:"center"}}>
            <div style={{color:"#34d399",fontWeight:700,fontSize:18,marginBottom:16}}>
              🏆 {sw.a>sw.b?nameA:nameB} wins!
            </div>
            <button onClick={onEndMatch} style={{...pbtn,fontSize:15,padding:"12px 32px",background:"linear-gradient(135deg,#059669,#10b981)"}}>
              ✓ Save & End Match
            </button>
          </div>
        )}

        {!isKeeper&&over&&(
          <div style={{textAlign:"center",color:"#34d399",fontWeight:700,fontSize:18}}>
            🏆 {sw.a>sw.b?nameA:nameB} wins!
          </div>
        )}

        {!isKeeper&&(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>👁 Viewing live · updates every 5s</div>
            {!over&&(()=>{
              const keeperId = live.keeperId;
              const hasKeeper = !!keeperId;
              return hasKeeper
                ? <div style={{fontSize:11,color:"#64748b",marginTop:4}}>🔒 {" "}Score is being kept by another device</div>
                : <button onClick={onHandoff}
                    style={{padding:"8px 18px",background:"#1e293b",border:"1px solid #f59e0b55",borderRadius:7,color:"#f59e0b",fontSize:12,cursor:"pointer",fontWeight:600}}>
                    🎾 Take Over as Score Keeper
                  </button>;
            })()}
          </div>
        )}

        {/* Stats panel */}
        {showStats&&<MatchMetrics live={live} nameA={nameA} nameB={nameB}/>}
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


// ─── Banter Tab ──────────────────────────────────────────────────────────────
const EMOJI_REACTIONS = ["🔥","😂","👏","🎾","💪","😮","❤️","🏆"];
const ALL_PLAYERS = [
  "Nitin","Ashish","Jai","Deep","Tarun","Sumit","Bobby","Satendra",
  "Akash","Micky","Dhar","Vineet","Sanjay","Ravi","Shailesh","Uzair",
  "Pratyush","Viraj","Tushar"
];

function BanterTab({data, upd}) {
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji]       = useState(null); // message id
  const [showMsgEmoji, setShowMsgEmoji] = useState(false); // emoji picker for input
  
  const banter = data.banter || [];

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US",{month:"short",day:"numeric"}) + " · " + d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
  }

  function highlightAt(txt) {
    // Highlight @mentions
    const parts = txt.split(/(@\w+)/g);
    return parts.map((p,i) =>
      p.startsWith("@")
        ? <span key={i} style={{color:"#3b82f6",fontWeight:700}}>{p}</span>
        : p
    );
  }

  async function postMessage() {
    if (!author.trim() || !text.trim()) return;
    const msg = {
      id: Date.now().toString(),
      author: author.trim(),
      text: text.trim(),
      ts: Date.now(),
      reactions: {},
    };
    await upd(d => ({...d, banter: [...(d.banter||[]), msg]}));
    setText("");
  }

  async function addReaction(msgId, emoji) {
    if (!!!author || !author) {
      alert("Please select your name first to react!");
      setShowEmoji(null);
      return;
    }
    await upd(d => ({
      ...d,
      banter: (d.banter||[]).map(m => {
        if (m.id !== msgId) return m;
        const reactions = JSON.parse(JSON.stringify(m.reactions||{}));
        if (!reactions[emoji]) reactions[emoji] = {};
        if (reactions[emoji][author]) {
          // Toggle off — remove reaction
          delete reactions[emoji][author];
          if (Object.keys(reactions[emoji]).length===0) delete reactions[emoji];
        } else {
          reactions[emoji][author] = true;
        }
        return {...m, reactions};
      })
    }));
    setShowEmoji(null);
  }

  return (
    <div style={{maxWidth:640,margin:"0 auto"}}>
      {/* Name selector */}
      <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <select value={author} onChange={e=>setAuthor(e.target.value)}
          style={{flex:1,minWidth:160,padding:"8px 10px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:author?"#e2e8f0":"#64748b",fontSize:13,outline:"none"}}>
          <option value="">Select your name to post…</option>
          {ALL_PLAYERS.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        {author&&<div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"#1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:13}}>{author[0]}</div>
          <span style={{fontWeight:700,color:"#93c5fd",fontSize:13}}>{author}</span>
        </div>}
      </div>

      {/* Message input */}
      {!!author&&(
        <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:"14px 16px",marginBottom:20}}>
          <div style={{position:"relative"}}>
            <textarea
              value={text}
              onChange={e=>setText(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();postMessage();}}}
              placeholder={"Talk trash, celebrate, @mention someone…"}
              style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:8,padding:"10px 12px",paddingBottom:40,color:"#e2e8f0",fontSize:13,outline:"none",resize:"none",boxSizing:"border-box",minHeight:80,fontFamily:"system-ui,sans-serif"}}
            />
            <button onClick={()=>{setShowEmoji(null);setShowMsgEmoji(v=>!v);}}
              style={{position:"absolute",bottom:10,left:10,background:"none",border:"none",fontSize:20,cursor:"pointer",opacity:.7}}>
              😄
            </button>
            {showMsgEmoji&&(
              <div style={{position:"absolute",bottom:44,left:0,background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"10px",display:"flex",gap:6,flexWrap:"wrap",zIndex:20,maxWidth:280,boxShadow:"0 8px 24px #000a"}}>
                {["😂","🔥","💪","🎾","🏆","👏","😎","🤣","😤","🥳","🤩","😏","👀","💀","🫡","🤦","🙌","❤️","⚡","🎯"].map(e=>(
                  <button key={e} onClick={()=>{setText(t=>t+e);setShowMsgEmoji(false);}}
                    style={{background:"none",border:"none",fontSize:22,cursor:"pointer",padding:"3px",borderRadius:6}}
                    onMouseOver={ev=>ev.target.style.background="#334155"}
                    onMouseOut={ev=>ev.target.style.background="none"}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
            <button disabled={!text.trim()} onClick={postMessage}
              style={{padding:"8px 20px",background:"#3b82f6",border:"none",borderRadius:7,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",opacity:text.trim()?1:.4}}>
              Post 🎾
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      {banter.length===0&&(
        <div style={{textAlign:"center",color:"#64748b",padding:"60px 0",fontSize:14}}>
          No banter yet — be the first to start! 🎾
        </div>
      )}
      {[...banter].reverse().map(msg=>(
        <div key={msg.id} style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:"14px 16px",marginBottom:12,position:"relative"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:"#1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:13,flexShrink:0}}>
              {msg.author[0]}
            </div>
            <span style={{fontWeight:700,color:"#93c5fd",fontSize:14}}>{msg.author}</span>
            <span style={{fontSize:11,color:"#475569",marginLeft:"auto"}}>{formatTime(msg.ts)}</span>
          </div>
          <div style={{fontSize:14,color:"#e2e8f0",lineHeight:1.6,marginBottom:10}}>
            {highlightAt(msg.text)}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
            {Object.entries(msg.reactions||{}).filter(([,users])=>Object.keys(users).length>0).map(([emoji,users])=>{
              const count=Object.keys(users).length;
              const iReacted=author&&users[author];
              return(
                <button key={emoji} onClick={()=>addReaction(msg.id,emoji)}
                  title={Object.keys(users).join(", ")}
                  style={{background:iReacted?"#1e3a5f":"#1e293b",border:`1px solid ${iReacted?"#3b82f655":"#334155"}`,borderRadius:20,padding:"3px 10px",cursor:"pointer",fontSize:13,color:"#e2e8f0",display:"flex",alignItems:"center",gap:4}}>
                  {emoji}<span style={{fontSize:11,color:iReacted?"#93c5fd":"#64748b"}}>{count}</span>
                </button>
              );
            })}
            <button onClick={()=>{setShowMsgEmoji(false);setShowEmoji(showEmoji===msg.id?null:msg.id);}}
              style={{background:"none",border:"1px solid #334155",borderRadius:20,padding:"3px 10px",cursor:"pointer",fontSize:13,color:"#64748b"}}>
              + 😄
            </button>
          </div>
          {showEmoji===msg.id&&(
            <div style={{position:"absolute",bottom:50,left:16,background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"10px",display:"flex",gap:8,flexWrap:"wrap",zIndex:10,maxWidth:260,boxShadow:"0 8px 24px #000a"}}>
              {EMOJI_REACTIONS.map(e=>(
                <button key={e} onClick={()=>addReaction(msg.id,e)}
                  style={{background:"none",border:"none",fontSize:22,cursor:"pointer",padding:"4px",borderRadius:6}}
                  onMouseOver={ev=>ev.target.style.background="#334155"}
                  onMouseOut={ev=>ev.target.style.background="none"}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ─── Polls & Betting Tab ─────────────────────────────────────────────────────
const START_POINTS = 20;

function PollsTab({data, upd, allPlayers}) {
  const [user, setUser]       = useState("");
  const [betAmt, setBetAmt]   = useState({});   // matchId -> amount string

  // Device-level vote/bet tracking via localStorage
  const DEVICE_KEY = "tristate_device_votes";
  function getDeviceVotes() {
    try { return JSON.parse(localStorage.getItem(DEVICE_KEY)||"{}"); } catch { return {}; }
  }
  function markDeviceVote(key) {
    const v = getDeviceVotes();
    v[key] = true;
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(v)); } catch {}
  }
  function hasDeviceVoted(key) {
    return !!getDeviceVotes()[key];
  }
  const [section, setSection] = useState("polls"); // polls | bets | tourn | leaderboard

  const polls     = data.polls     || {};
  const tournPoll = data.tournPoll || {doubles:{}, singles:{}};
  const bets      = data.bets      || {};
  const betPoints = data.betPoints || {};

  const allMatches = [...(data.dMatches||[]), ...(data.sMatches||[])];
  const pending    = allMatches.filter(m=>!m.done);
  const complete   = allMatches.filter(m=>m.done);

  const myPoints = betPoints[user] !== undefined ? betPoints[user] : START_POINTS;

  // ── Poll helpers ──
  function getPollPct(matchId, side) {
    const p = polls[matchId] || {};
    const total = Object.keys(p).length;
    if (!total) return 0;
    const count = Object.values(p).filter(v=>v===side).length;
    return Math.round(count/total*100);
  }

  function getTournPct(type, name) {
    const p = tournPoll[type] || {};
    const total = Object.keys(p).length;
    if (!total) return 0;
    const count = Object.values(p).filter(v=>v===name).length;
    return Math.round(count/total*100);
  }

  async function votePoll(matchId, side) {
    if (!user) { alert("Please select your name first!"); return; }
    const key = "poll_" + matchId;
    if (hasDeviceVoted(key)) { alert("You have already voted on this match from this device!"); return; }
    await upd(d=>({...d, polls:{...d.polls, [matchId]:{...(d.polls[matchId]||{}), [user]:side}}}));
    markDeviceVote(key);
  }

  async function voteTournament(type, name) {
    if (!user) { alert("Please select your name first!"); return; }
    const key = "tourn_" + type;
    if (hasDeviceVoted(key)) { alert("You have already voted on this tournament from this device!"); return; }
    await upd(d=>({...d, tournPoll:{...d.tournPoll, [type]:{...(d.tournPoll[type]||{}), [user]:name}}}));
    markDeviceVote(key);
  }

  // ── Bet helpers ──
  function getMatchType(m) {
    return (data.dMatches||[]).find(x=>x.id===m.id) ? "doubles" : "singles";
  }

  function myBet(matchId) {
    return (bets[matchId]||{})[user];
  }

  function isMyMatch(m) {
    const type = getMatchType(m);
    const teams = type==="doubles" ? data.doubles : data.singles;
    // Check if user name appears in either team
    return [m.a, m.b].some(t=>t.split("/").some(n=>n===user));
  }

  async function placeBet(m, side, amount) {
    if (!user || !amount || amount<1) return;
    if (amount > myPoints) return;
    const key = "bet_" + m.id;
    if (hasDeviceVoted(key)) { alert("You have already placed a bet on this match from this device!"); return; }
    await upd(d=>{
      const newBets = {...d.bets, [m.id]:{...(d.bets[m.id]||{}), [user]:{side, amount}}};
      const newPts  = {...d.betPoints, [user]:(d.betPoints[user]!==undefined?d.betPoints[user]:START_POINTS) - amount};
      return {...d, bets:newBets, betPoints:newPts};
    });
    markDeviceVote(key);
  }

  // Compute bet leaderboard (settle completed matches)
  function betLeaderboard() {
    const pts = {...betPoints};
    // Add winnings for completed matches
    for (const m of complete) {
      const wa = calcWins(m.sa), wb = calcWins(m.sb); if(!wa||!wb) continue;
      const winner = wa.w>wb.w ? m.a : m.b;
      const matchBets = bets[m.id] || {};
      const totalPool = Object.values(matchBets).reduce((s,b)=>s+b.amount,0);
      const winners   = Object.entries(matchBets).filter(([,b])=>b.side===winner);
      const totalWin  = winners.reduce((s,[,b])=>s+b.amount,0);
      for (const [player, b] of winners) {
        if (!totalWin) continue;
        const share = (b.amount/totalWin) * totalPool;
        pts[player] = (pts[player]!==undefined?pts[player]:START_POINTS) + share;
      }
    }
    // Include all known players with default points
    const everyone = [...new Set([...allPlayers, ...Object.keys(pts)])];
    return everyone
      .map(n=>({n, pts: Math.round(pts[n]!==undefined?pts[n]:START_POINTS)}))
      .sort((a,b)=>b.pts-a.pts);
  }

  const lb = betLeaderboard();

  const pct_bar = (pct, color) => (
    <div style={{height:6,borderRadius:3,background:"#1e293b",overflow:"hidden",flex:1}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width .5s"}}/>
    </div>
  );

  const secBtn = (id,label) => (
    <button key={id} onClick={()=>setSection(id)} style={{padding:"7px 16px",border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:600,background:section===id?"#3b82f6":"#1e293b",color:section===id?"#fff":"#64748b"}}>{label}</button>
  );

  return (
    <div style={{maxWidth:640,margin:"0 auto"}}>
      {/* Name picker — always visible at top */}
      <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:10,padding:"12px 16px",marginBottom:20}}>
        <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Who are you?</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={allPlayers.includes(user)?user:""} onChange={e=>setUser(e.target.value)}
            style={{flex:1,minWidth:140,padding:"8px 10px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#e2e8f0",fontSize:13,outline:"none"}}>
            <option value="">Pick from player list…</option>
            {allPlayers.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <input value={allPlayers.includes(user)?"":user} onChange={e=>setUser(e.target.value)}
            placeholder="Or type guest name…"
            style={{flex:1,minWidth:130,padding:"8px 10px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#e2e8f0",fontSize:13,outline:"none"}}/>
        </div>
        {user&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"#1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",fontSize:12}}>{user[0].toUpperCase()}</div>
          <span style={{fontWeight:700,color:"#93c5fd",fontSize:13}}>{user}</span>
          <span style={{fontSize:12,color:"#f59e0b",marginLeft:4}}>🪙 {myPoints} pts</span>
          <button onClick={()=>setUser("")} style={{background:"none",border:"none",color:"#64748b",fontSize:11,cursor:"pointer",marginLeft:"auto"}}>Change</button>
        </div>}
      </div>

      {/* Section tabs */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {secBtn("polls","🗳️ Match Polls")}
        {secBtn("tourn","🏆 Tournament Poll")}
        {secBtn("bets","🪙 Betting")}
        {secBtn("leaderboard","📊 Bet Leaderboard")}
      </div>

      {/* MATCH POLLS */}
      {section==="polls"&&(
        <div>
          <div style={{fontWeight:700,color:"#fff",marginBottom:16}}>Who will win?</div>
          {pending.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:"40px 0"}}>No upcoming matches to vote on.</div>}
          {pending.map(m=>{
            const myVote = polls[m.id]?.[user];
            const pA = getPollPct(m.id, m.a);
            const pB = getPollPct(m.id, m.b);
            const total = Object.keys(polls[m.id]||{}).length;
            return (
              <div key={m.id} style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:"16px",marginBottom:12}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>{m.date}{m.time?` · ${m.time}`:""}</div>
                {(()=>{
                  const voted = hasDeviceVoted("poll_"+m.id);
                  return(
                    <div>
                      {voted&&<div style={{fontSize:11,color:"#10b981",marginBottom:8,textAlign:"center"}}>✓ You voted on this device</div>}
                      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:12,marginBottom:14}}>
                        <button onClick={()=>votePoll(m.id,m.a)} disabled={voted} style={{padding:"10px",background:myVote===m.a?"#1d4ed8":"#111827",border:`2px solid ${myVote===m.a?"#3b82f6":"#334155"}`,borderRadius:8,color:myVote===m.a?"#fff":"#cbd5e1",fontWeight:700,fontSize:13,cursor:voted?"not-allowed":"pointer",textAlign:"center",opacity:voted&&myVote!==m.a?.5:1}}>
                          {m.a}{myVote===m.a?" ✓":""}
                        </button>
                        <div style={{color:"#475569",fontWeight:700,fontSize:12}}>VS</div>
                        <button onClick={()=>votePoll(m.id,m.b)} disabled={voted} style={{padding:"10px",background:myVote===m.b?"#1d4ed8":"#111827",border:`2px solid ${myVote===m.b?"#3b82f6":"#334155"}`,borderRadius:8,color:myVote===m.b?"#fff":"#cbd5e1",fontWeight:700,fontSize:13,cursor:voted?"not-allowed":"pointer",textAlign:"center",opacity:voted&&myVote!==m.b?.5:1}}>
                          {m.b}{myVote===m.b?" ✓":""}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {total>0&&(
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:11,color:"#93c5fd",width:32,textAlign:"right"}}>{pA}%</span>
                      {pct_bar(pA,"#3b82f6")}
                      {pct_bar(pB,"#10b981")}
                      <span style={{fontSize:11,color:"#10b981",width:32}}>{pB}%</span>
                    </div>
                    <div style={{fontSize:10,color:"#475569",textAlign:"center"}}>{total} vote{total!==1?"s":""}</div>
                  </div>
                )}
                {!!!user&&<div style={{fontSize:11,color:"#64748b",textAlign:"center",marginTop:8}}>Select your name above to vote</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* TOURNAMENT POLL */}
      {section==="tourn"&&(
        <div>
          <div style={{fontWeight:700,color:"#fff",marginBottom:20}}>Who will win the tournament?</div>
          {["doubles","singles"].map(type=>{
            const players = type==="doubles"?data.doubles:data.singles;
            const myVote  = tournPoll[type]?.[user];
            const total   = Object.keys(tournPoll[type]||{}).length;
            return (
              <div key={type} style={{marginBottom:28}}>
                <div style={{fontSize:13,color:"#93c5fd",fontWeight:700,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>{type}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
                  {players.map(p=>{
                    const pct = getTournPct(type,p);
                    const voted = myVote===p;
                    return (
                      <button key={p} onClick={()=>voteTournament(type,p)} style={{padding:"12px 10px",background:voted?"#1d4ed8":"#111827",border:`2px solid ${voted?"#3b82f6":"#334155"}`,borderRadius:10,color:voted?"#fff":"#cbd5e1",fontWeight:700,fontSize:13,cursor:"pointer",textAlign:"center"}}>
                        <div style={{marginBottom:6}}>{p}</div>
                        {total>0&&(
                          <div>
                            <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden",margin:"0 auto 4px"}}>
                              <div style={{height:"100%",width:`${pct}%`,background:voted?"#93c5fd":"#3b82f6",borderRadius:2}}/>
                            </div>
                            <div style={{fontSize:11,color:voted?"#93c5fd":"#64748b"}}>{pct}%</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {total>0&&<div style={{fontSize:11,color:"#475569",marginTop:8}}>{total} vote{total!==1?"s":""}</div>}
              </div>
            );
          })}
          {!!!user&&<div style={{fontSize:11,color:"#64748b",textAlign:"center"}}>Select your name above to vote</div>}
        </div>
      )}

      {/* BETTING */}
      {section==="bets"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontWeight:700,color:"#fff"}}>Place Your Bets</div>
            {!!user&&<div style={{fontSize:13,color:"#f59e0b",fontWeight:700}}>🪙 {myPoints} pts left</div>}
          </div>
          {!!!user&&<div style={{textAlign:"center",color:"#64748b",padding:"40px 0"}}>Select your name above to place bets.</div>}
          {pending.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:"40px 0"}}>No upcoming matches to bet on.</div>}
          {!!user&&pending.map(m=>{
            const bet = myBet(m.id);
            const ownMatch = isMyMatch(m);
            const totalPool = Object.values(bets[m.id]||{}).reduce((s,b)=>s+b.amount,0);
            const amt = betAmt[m.id]||"";
            return (
              <div key={m.id} style={{background:"#0e1320",border:`1px solid ${bet?"#f59e0b44":"#1e293b"}`,borderRadius:12,padding:"16px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#cbd5e1"}}>{m.a} vs {m.b}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{m.date}</div>
                </div>
                {ownMatch&&<div style={{fontSize:12,color:"#f59e0b",marginBottom:8}}>⚠️ Can't bet on your own match</div>}
                {myPoints<=0&&!bet&&<div style={{fontSize:12,color:"#ef4444",marginBottom:8}}>❌ No points remaining</div>}
                {bet ? (
                  <div style={{background:"#1a2a0a",border:"1px solid #f59e0b44",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{fontSize:12,color:"#f59e0b",fontWeight:700}}>Your bet: {bet.amount} pts on {bet.side}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Total pool: {totalPool} pts</div>
                  </div>
                ) : !ownMatch && myPoints>0 && (
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      {[m.a,m.b].map(side=>(
                        <button key={side} onClick={()=>{
                          const a=parseInt(amt);
                          if(!a||a<1||a>myPoints) return;
                          placeBet(m,side,a);
                        }} style={{padding:"10px",background:"#111827",border:"2px solid #334155",borderRadius:8,color:"#cbd5e1",fontWeight:700,fontSize:12,cursor:"pointer",textAlign:"center"}}>
                          Bet on {side}
                        </button>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input type="number" min="1" max={myPoints} placeholder="Points to bet"
                        value={amt} onChange={e=>setBetAmt(b=>({...b,[m.id]:e.target.value}))}
                        style={{flex:1,padding:"8px 10px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#e2e8f0",fontSize:13,outline:"none"}}/>
                      <span style={{fontSize:11,color:"#64748b"}}>max {myPoints}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BET LEADERBOARD */}
      {section==="leaderboard"&&(
        <div>
          <div style={{fontWeight:700,color:"#fff",marginBottom:16}}>🪙 Betting Leaderboard</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>Everyone starts with {START_POINTS} pts. Win bets to earn more!</div>
          <div style={{border:"1px solid #1e293b",borderRadius:8,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#0a1020"}}>
                  {["#","Player","Points"].map((h,i)=>(
                    <th key={h} style={{padding:"10px 12px",fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,textAlign:i===1?"left":"center",borderBottom:"1px solid #1e293b"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lb.map((p,i)=>(
                  <tr key={p.n} style={{background:i%2===0?"#111827":"#0f172a"}}>
                    <td style={{padding:"11px 12px",textAlign:"center",fontSize:16,borderBottom:"1px solid #1e293b"}}>{["🥇","🥈","🥉"][i]||`${i+1}`}</td>
                    <td style={{padding:"11px 12px",fontWeight:700,color:p.n===user?"#93c5fd":"#cbd5e1",borderBottom:"1px solid #1e293b"}}>{p.n}{p.n===user?" (you)":""}</td>
                    <td style={{padding:"11px 12px",textAlign:"center",color:"#f59e0b",fontWeight:800,fontSize:15,borderBottom:"1px solid #1e293b"}}>🪙 {p.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  const [showToss,  setShowToss]  = useState(false);
  const [tossData,  setTossData]  = useState(null); // {matchId, type, m}

  const FUTURE      = futureDates();
  const defaultDate = FUTURE[0]||ALL_DATES[0];

  const load = useCallback(async (init=false) => {
    try {
      const r = await dbLoad();
      if (r) {
        // Sanitize — Firebase can return objects instead of arrays
        const toArr = v => !v ? [] : Array.isArray(v) ? v : Object.values(v);
        const safe = {
          ...DEFAULT,
          ...r,
          doubles:  toArr(r.doubles),
          singles:  toArr(r.singles),
          dMatches: toArr(r.dMatches),
          sMatches: toArr(r.sMatches),
          banter:   toArr(r.banter),
          polls:    r.polls    || {},
          tournPoll:r.tournPoll|| {doubles:{},singles:{}},
          bets:     r.bets     || {},
          betPoints:r.betPoints|| {},
        };
        setData(safe);
        if(init) setStatus("ok");
      } else if (init) {
        await dbSave(DEFAULT);
        setData(DEFAULT);
        setStatus("ok");
      }
    } catch(e) {
      console.error("Load error:", e);
      if(init) setStatus("error");
    }
  },[]);

  useEffect(()=>{ load(true); },[load]);

  // Poll every 5s when watching live
  useEffect(()=>{
    if (!liveMatch) return;
    const t = setInterval(()=>load(false), 5000);
    return ()=>clearInterval(t);
  },[liveMatch,load]);

  function upd(fn) {
    const nd=fn(data);
    setData(nd);
    setStatus("saving");
    dbSave(nd).then(()=>setStatus("ok")).catch(()=>setStatus("error"));
    return nd;
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



  function handlePoint(side) {
    const m = getCurrentLiveMatch(); if(!m) return;
    const live = addPoint(m.live||newLive(), side);
    const type = liveMatch.type;
    upd(d=>{
      const key=type==="doubles"?"dMatches":"sMatches";
      return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,live}:x)};
    });
  }

  function handleUndo() {
    const m = getCurrentLiveMatch(); if(!m) return;
    const live = m.live;
    if (!live || !live.history || live.history.length===0) return;
    const prev = undoPoint(live);
    const type = liveMatch.type;
    upd(d=>{
      const key=type==="doubles"?"dMatches":"sMatches";
      return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,live:prev}:x)};
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

  // Show toss screen
  if (showToss && tossData) {
    const tm = (data.dMatches||[]).concat(data.sMatches||[]).find(x=>x.id===tossData.matchId);
    if (tm) return (
      <TossScreen
        nameA={tm.a} nameB={tm.b}
        onTossResult={(serving)=>{
          upd(d=>{
            const key=tossData.type==="doubles"?"dMatches":"sMatches";
            const lv = {...newLive(serving), keeperId: DEVICE_ID};
            return {...d,[key]:d[key].map(x=>x.id===tossData.matchId?{...x,live:lv}:x)};
          });
          setShowToss(false);
          setLiveMatch({matchId:tossData.matchId, type:tossData.type, isKeeper:true});
        }}
      />
    );
  }

  // Show live score overlay
  const liveMatchData = liveMatch ? getCurrentLiveMatch() : null;
  // Always derive isKeeper from Firebase data (keeperId), not local state
  const amActualKeeper = liveMatchData?.live?.keeperId === DEVICE_ID;
  if (liveMatch && liveMatchData) {
    return (
      <LiveScoreView
        m={liveMatchData}
        isKeeper={amActualKeeper}
        onPoint={handlePoint}
        onUndo={handleUndo}
        onEndMatch={handleEndMatch}
        onClose={()=>setLiveMatch(null)}
        onHandoff={()=>{
          const m = getCurrentLiveMatch();
          if (!m || !m.live) return;
          const type = liveMatch.type;
          const myKeeperId = m.live?.keeperId;
          const iAmKeeper = myKeeperId === DEVICE_ID;
          if (iAmKeeper) {
            // Current keeper hands off — clear keeperId
            upd(d=>{
              const key=type==="doubles"?"dMatches":"sMatches";
              return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,live:{...x.live,keeperId:null}}:x)};
            });
          } else if (!myKeeperId) {
            // No keeper — this device claims it
            upd(d=>{
              const key=type==="doubles"?"dMatches":"sMatches";
              return {...d,[key]:d[key].map(x=>x.id===m.id?{...x,live:{...x.live,keeperId:DEVICE_ID}}:x)};
            });
          }
        }}
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
            {[["schedule","📅 Schedule"],["scores","🎯 Scores"],["leaderboard","🏆 Standings"],["polls","🗳️ Polls"],["banter","💬 Banter"],["manage","⚙️ Manage"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{padding:"8px 16px",border:"none",cursor:"pointer",borderRadius:"6px 6px 0 0",background:tab===id?"#1e293b":"transparent",color:tab===id?"#fff":"#64748b",fontWeight:tab===id?700:400,fontSize:13}}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px"}}>
        {tab!=="manage"&&tab!=="banter"&&tab!=="polls"&&(
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

        {/* POLLS */}
        {tab==="polls"&&(
          <PollsTab data={data} upd={upd} allPlayers={[
            "Nitin","Ashish","Jai","Deep","Tarun","Sumit","Bobby","Satendra",
            "Akash","Micky","Dhar","Vineet","Sanjay","Ravi","Shailesh","Uzair",
            "Pratyush","Viraj","Tushar"
          ]}/>
        )}

        {/* BANTER */}
        {tab==="banter"&&(
          <BanterTab data={data} upd={upd}/>
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
          <input style={inp} placeholder="e.g. 6-4 6-2" value={mf.sa||""} onChange={e=>setMf(f=>({...f,sa:e.target.value}))}/>
          <label style={lbl}>{mf.b}</label>
          <input style={inp} placeholder="e.g. 4-6 2-6" value={mf.sb||""} onChange={e=>setMf(f=>({...f,sb:e.target.value}))}/>
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
              setModal(null);
              setTossData({matchId:mf.matchId, type:mf.matchType, m});
              setShowToss(true);
            }} style={{...pbtn,justifyContent:"center",padding:"12px",fontSize:14}}>
              🎾 I am the Score Keeper
            </button>
            <button onClick={()=>{
              const m=matches.find(x=>x.id===mf.matchId);
              if(!m) return;
              setModal(null);
              // isKeeper determined by whether this device holds the keeperId
              const amKeeper = m.live && m.live.keeperId === DEVICE_ID;
              openLive(m, mf.matchType, amKeeper);
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
