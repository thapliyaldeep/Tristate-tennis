import { useState, useEffect } from "react";

const FB_URL = "https://tristate-tennis-default-rtdb.firebaseio.com/data.json";

function genDates() {
  const dates = [], days = [], names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const start = new Date(2026, 4, 1), end = new Date(2026, 6, 5);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    dates.push(`${d.getMonth()+1}/${d.getDate()}`);
    days.push(names[d.getDay()]);
  }
  return { dates, days };
}
const { dates: ALL_DATES, days: ALL_DAYS } = genDates();

const DEFAULT_DB = {
  doubles: ["Nitin/Ashish","Jai/Deep","Tarun/Sumit","Bobby/Satendra","Akash/Micky","Dhar/Vineet","Sanjay/Ravi"],
  singles: ["Ashish","Deep","Sumit","Bobby","Akash","Dharam","Sanjay","Pratush","Viraj","Tushar"],
  dAvail: {
    "Nitin/Ashish":   {"5/17":"4pm w/ Jai/Deep","5/18":"6pm avail","5/22":"5:30pm avail"},
    "Jai/Deep":       {"5/17":"4pm w/ Nitin/Ashish"},
    "Tarun/Sumit":    {"5/20":"5pm avail","5/21":"5pm avail"},
    "Bobby/Satendra": {"5/18":"6pm w/ Akash/Micky"},
    "Akash/Micky":    {"5/18":"6pm w/ Bobby/Satu"},
    "Dhar/Vineet":    {"5/19":"6pm onwards"},
    "Sanjay/Ravi":    {"5/16":"5pm avail","5/17":"Anytime","5/20":"6pm avail","5/21":"6pm avail"},
  },
  sAvail: { "Dharam":{"5/15":"5pm+","5/16":"8-10am"}, "Viraj":{"5/15":"5pm+"} },
  dMatches: [
    {id:"d1",a:"Nitin/Ashish",b:"Jai/Deep",date:"5/17",time:"4pm",sa:"",sb:"",done:false},
    {id:"d2",a:"Bobby/Satendra",b:"Akash/Micky",date:"5/18",time:"6pm",sa:"",sb:"",done:false},
  ],
  sMatches: [],
  did: 3,
  sid: 1,
};

function futureDates() {
  const today = new Date(); today.setHours(0,0,0,0);
  return ALL_DATES.filter(d => {
    const [m,day] = d.split("/").map(Number);
    return new Date(2026,m-1,day) >= today;
  });
}

function isEditable(m) {
  if (!m.done) return true;
  if (!m.completedAt) return false;
  return Date.now() - m.completedAt < 24*60*60*1000;
}

// Firebase stores arrays as {0:...,1:...} objects — convert back to real arrays
function fixArrays(data) {
  if (!data) return data;
  const toArr = (v) => v == null ? [] : Array.isArray(v) ? v : Object.values(v);
  return {
    ...data,
    doubles:  toArr(data.doubles),
    singles:  toArr(data.singles),
    dMatches: toArr(data.dMatches),
    sMatches: toArr(data.sMatches),
  };
}

async function dbLoad() {
  try {
    const r = await fetch(FB_URL);
    const data = await r.json();
    return data ? fixArrays(data) : null;
  } catch { return null; }
}

async function dbSave(data) {
  try {
    await fetch(FB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}
}

function calcWins(score) {
  if (!score) return null;
  let w=0,l=0;
  for (const s of score.trim().split(/\s+/)) {
    const m=s.match(/^(\d+)-(\d+)$/); if(!m) return null;
    +m[1]>+m[2]?w++:l++;
  }
  return {w,l};
}

function calcStandings(matches, players) {
  const st={};
  players.forEach(p=>{st[p]={p:0,w:0,l:0,pts:0};});
  for(const m of matches){
    if(!m.done) continue;
    const wa=calcWins(m.sa),wb=calcWins(m.sb); if(!wa||!wb) continue;
    if(!st[m.a]) st[m.a]={p:0,w:0,l:0,pts:0};
    if(!st[m.b]) st[m.b]={p:0,w:0,l:0,pts:0};
    st[m.a].p++;st[m.b].p++;
    if(wa.w>wb.w){st[m.a].w++;st[m.a].pts+=3;st[m.b].l++;}
    else{st[m.b].w++;st[m.b].pts+=3;st[m.a].l++;}
  }
  return Object.entries(st).map(([n,v])=>({n,...v})).sort((a,b)=>b.pts-a.pts||b.w-a.w);
}

const inp    = {width:"100%",padding:"9px 11px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"};
const pbtn   = {padding:"8px 16px",background:"#3b82f6",border:"none",borderRadius:7,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"};
const sbtn   = {padding:"8px 16px",background:"#1e293b",border:"none",borderRadius:7,color:"#64748b",fontSize:13,cursor:"pointer"};
const lbl    = {display:"block",fontSize:11,color:"#64748b",marginBottom:5,marginTop:12,textTransform:"uppercase",letterSpacing:.5};
const redbtn = {padding:"5px 10px",background:"#2d1515",border:"none",borderRadius:6,color:"#f87171",fontSize:12,cursor:"pointer"};

function Modal({title,onClose,children}){
  return(
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

function MatchCard({m,onScore,onDel}){
  const done=m.done;
  const wa=done?calcWins(m.sa):null, wb=done?calcWins(m.sb):null;
  const winner=wa&&wb?(wa.w>wb.w?m.a:m.b):null;
  const editable=isEditable(m), locked=done&&!editable;
  return(
    <div style={{background:"#111827",border:`1px solid ${locked?"#2d1f00":done?"#14532d55":"#334155"}`,borderRadius:10,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:winner===m.a?"#34d399":"#cbd5e1"}}>{m.a}</div>
          {done&&<div style={{fontSize:17,fontWeight:800,color:winner===m.a?"#34d399":"#475569",letterSpacing:1}}>{m.sa}</div>}
        </div>
        <div style={{color:"#475569",fontSize:11,fontWeight:700}}>VS</div>
        <div style={{flex:1,textAlign:"right"}}>
          <div style={{fontWeight:700,fontSize:14,color:winner===m.b?"#34d399":"#cbd5e1"}}>{m.b}</div>
          {done&&<div style={{fontSize:17,fontWeight:800,color:winner===m.b?"#34d399":"#475569",letterSpacing:1,textAlign:"right"}}>{m.sb}</div>}
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:12,color:"#64748b"}}>{m.date}{m.time?` · ${m.time}`:""}</div>
        {done&&winner&&<div style={{fontSize:12,color:"#10b981",marginTop:3}}>🏆 {winner}</div>}
        {locked&&<div style={{fontSize:11,color:"#f59e0b",marginTop:3}}>🔒 Locked after 24h</div>}
        <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"flex-end"}}>
          {!locked&&<button onClick={onScore} style={{padding:"6px 12px",background:"#1e3a5f",border:"none",borderRadius:6,color:"#93c5fd",fontSize:12,cursor:"pointer"}}>{done?"✏️ Edit":"📝 Score"}</button>}
          <button onClick={onDel} style={{padding:"6px 10px",background:"#2d1515",border:"none",borderRadius:6,color:"#f87171",fontSize:12,cursor:"pointer"}}>🗑</button>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const [data,setData]     = useState(null);
  const [status,setStatus] = useState("loading");
  const [tab,setTab]       = useState("schedule");
  const [lg,setLg]         = useState("doubles");
  const [modal,setModal]   = useState(null);
  const [mf,setMf]         = useState({});

  const FUTURE      = futureDates();
  const defaultDate = FUTURE[0]||ALL_DATES[0];

  useEffect(()=>{
    dbLoad().then(r=>{
      if(r){ setData(r); setStatus("ok"); }
      else {
        // First time — seed with defaults
        dbSave(DEFAULT_DB).then(()=>{ setData(DEFAULT_DB); setStatus("ok"); });
      }
    }).catch(()=>setStatus("error"));
  },[]);

  async function upd(fn){
    const nd=fn(data);
    setData(nd);
    setStatus("saving");
    try {
      await dbSave(nd);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  if(status==="loading") return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#64748b",fontSize:15}}>🎾 Loading league data…</div>;
  if(status==="error")   return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",color:"#ef4444",fontSize:15,textAlign:"center",padding:24}}>❌ Could not load data. Check your connection and refresh.</div>;

  const isD     = lg==="doubles";
  const teams   = isD ? data.doubles : data.singles;
  const avail   = isD ? data.dAvail  : data.sAvail;
  const matches = isD ? data.dMatches: data.sMatches;
  const stand   = calcStandings(matches,teams);
  const pending = matches.filter(m=>!m.done);
  const complete= matches.filter(m=>m.done);

  async function addMatch(){
    await upd(d=>{
      const m={id:isD?`d${d.did}`:`s${d.sid}`,a:mf.a,b:mf.b,date:mf.date||defaultDate,time:mf.time||"",sa:"",sb:"",done:false};
      return isD?{...d,dMatches:[...d.dMatches,m],did:d.did+1}:{...d,sMatches:[...d.sMatches,m],sid:d.sid+1};
    }); setModal(null);
  }
  function delMatch(id){
    upd(d=>isD?{...d,dMatches:d.dMatches.filter(m=>m.id!==id)}:{...d,sMatches:d.sMatches.filter(m=>m.id!==id)});
  }
  async function saveScore(){
    await upd(d=>{
      const stamp=Date.now();
      return isD
        ?{...d,dMatches:d.dMatches.map(m=>m.id===mf.id?{...m,sa:mf.sa,sb:mf.sb,done:true,completedAt:m.completedAt||stamp}:m)}
        :{...d,sMatches:d.sMatches.map(m=>m.id===mf.id?{...m,sa:mf.sa,sb:mf.sb,done:true,completedAt:m.completedAt||stamp}:m)};
    }); setModal(null);
  }
  async function addAvail(){
    await upd(d=>{const k=isD?"dAvail":"sAvail";return{...d,[k]:{...d[k],[mf.name]:{...(d[k][mf.name]||{}),[mf.date]:mf.note}}};});
    setModal(null);
  }
  function removeAvail(name,date){
    upd(d=>{const k=isD?"dAvail":"sAvail";const row={...(d[k][name]||{})};delete row[date];return{...d,[k]:{...d[k],[name]:row}};});
  }
  async function addTeam(){
    const name=mf.teamName?.trim(); if(!name) return;
    await upd(d=>isD?{...d,doubles:[...d.doubles,name]}:{...d,singles:[...d.singles,name]});
    setModal(null);
  }
  function removeTeam(name){
    if(!window.confirm(`Remove "${name}"? Their matches will be kept.`)) return;
    upd(d=>isD?{...d,doubles:d.doubles.filter(t=>t!==name)}:{...d,singles:d.singles.filter(t=>t!==name)});
  }

  const statusColor={ok:"#10b981",saving:"#f59e0b",error:"#ef4444"}[status]||"#64748b";
  const statusText ={ok:"✓ Saved",saving:"💾 Saving…",error:"⚠ Save failed"}[status];

  return(
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"system-ui,sans-serif"}}>
      <style>{`*{box-sizing:border-box}select,input{color-scheme:dark}button:disabled{opacity:.4;cursor:not-allowed}`}</style>

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

        {/* ── SCHEDULE ── */}
        {tab==="schedule"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#fff"}}>Availability Grid</div>
              <button style={pbtn} onClick={()=>{setModal("match");setMf({a:"",b:"",date:defaultDate,time:""});}}>+ Schedule Match</button>
            </div>
            {pending.length>0&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>Upcoming Matches</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:8}}>
                  {pending.map(m=>(
                    <div key={m.id} style={{background:"#0a1e3a",border:"1px solid #1e3a6e",borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontWeight:700,color:"#93c5fd",fontSize:13}}>{m.a}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>vs {m.b}</div>
                      <div style={{color:"#64748b",fontSize:11,marginTop:5}}>{m.date}{m.time?` · ${m.time}`:""}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{overflowX:"auto",border:"1px solid #1e293b",borderRadius:8}}>
              <table style={{borderCollapse:"collapse",minWidth:700,width:"100%"}}>
                <thead>
                  <tr style={{background:"#0a1020"}}>
                    <th style={{padding:"9px 12px",textAlign:"left",color:"#64748b",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,borderBottom:"1px solid #1e293b",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:2,background:"#0a1020"}}>
                      {isD?"Team":"Player"}
                    </th>
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
                      <td style={{padding:"8px 12px",fontWeight:700,color:"#cbd5e1",fontSize:13,borderBottom:"1px solid #1e293b",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:1,background:ri%2===0?"#111827":"#0f172a"}}>
                        {name}
                      </td>
                      {ALL_DATES.map(d=>{
                        const note=avail[name]?.[d];
                        const booked=note&&/w\//i.test(note);
                        return(
                          <td key={d} style={{padding:"3px 3px",borderBottom:"1px solid #1e293b",verticalAlign:"top"}}>
                            {note
                              ?<div onClick={()=>removeAvail(name,d)} title="Click to remove" style={{background:booked?"#064e3b":"#1e3a5f",border:`1px solid ${booked?"#10b98155":"#3b82f655"}`,borderRadius:5,padding:"3px 5px",color:booked?"#10b981":"#93c5fd",fontSize:10,cursor:"pointer",lineHeight:1.4}}>{note}</div>
                              :<div style={{height:22}}/>
                            }
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

        {/* ── SCORES ── */}
        {tab==="scores"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#fff"}}>Match Results</div>
              <button style={pbtn} onClick={()=>{setModal("match");setMf({a:"",b:"",date:defaultDate,time:""});}}>+ Add Match</button>
            </div>
            {matches.length===0&&<div style={{textAlign:"center",color:"#64748b",padding:"60px 0"}}>No matches yet.</div>}
            {pending.length>0&&(
              <div style={{marginBottom:24}}>
                <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Pending Score Entry</div>
                {pending.map(m=><MatchCard key={m.id} m={m} onScore={()=>{setModal("score");setMf({id:m.id,a:m.a,b:m.b,date:m.date,time:m.time,sa:"",sb:""});}} onDel={()=>delMatch(m.id)}/>)}
              </div>
            )}
            {complete.length>0&&(
              <div>
                <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>Completed</div>
                {complete.map(m=><MatchCard key={m.id} m={m} onScore={()=>{setModal("score");setMf({id:m.id,a:m.a,b:m.b,date:m.date,time:m.time,sa:m.sa,sb:m.sb});}} onDel={()=>delMatch(m.id)}/>)}
              </div>
            )}
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {tab==="leaderboard"&&(
          <div>
            <div style={{fontWeight:700,color:"#fff",marginBottom:20,fontSize:16}}>{isD?"Doubles":"Singles"} Standings</div>
            {stand.filter(s=>s.p>0).length===0
              ?<div style={{textAlign:"center",color:"#64748b",padding:"60px 0"}}>No completed matches yet — enter scores to see rankings.</div>
              :(
                <>
                  <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:12,marginBottom:32}}>
                    {(()=>{
                      const played=stand.filter(s=>s.p>0);
                      return [1,0,2].map(rank=>{
                        const s=played[rank]; if(!s) return <div key={rank} style={{width:120}}/>;
                        const H={0:180,1:130,2:90}[rank];
                        const C=["#FFD700","#C0C0C0","#CD7F32"][rank];
                        const E=["🥇","🥈","🥉"][rank];
                        return(
                          <div key={s.n} style={{textAlign:"center",width:120}}>
                            <div style={{fontSize:26}}>{E}</div>
                            <div style={{fontWeight:700,fontSize:12,color:"#e2e8f0",margin:"4px 0 2px"}}>{s.n}</div>
                            <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>{s.pts}pts · {s.w}W {s.l}L</div>
                            <div style={{height:H,borderRadius:"6px 6px 0 0",background:`${C}18`,border:`2px solid ${C}88`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,color:C}}>{rank+1}</div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div style={{border:"1px solid #1e293b",borderRadius:8,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead>
                        <tr style={{background:"#0a1020"}}>
                          {["#","Name","Played","Won","Lost","Points"].map((h,i)=>(
                            <th key={h} style={{padding:"10px 12px",fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,textAlign:i===1?"left":"center",borderBottom:"1px solid #1e293b"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stand.map((s,i)=>(
                          <tr key={s.n} style={{background:i%2===0?"#111827":"#0f172a"}}>
                            <td style={{padding:"11px 12px",textAlign:"center",fontSize:16,borderBottom:"1px solid #1e293b"}}>{["🥇","🥈","🥉"][i]||`${i+1}`}</td>
                            <td style={{padding:"11px 12px",fontWeight:700,color:"#cbd5e1",borderBottom:"1px solid #1e293b"}}>{s.n}</td>
                            <td style={{padding:"11px 12px",textAlign:"center",color:"#64748b",borderBottom:"1px solid #1e293b"}}>{s.p}</td>
                            <td style={{padding:"11px 12px",textAlign:"center",color:"#10b981",fontWeight:700,borderBottom:"1px solid #1e293b"}}>{s.w}</td>
                            <td style={{padding:"11px 12px",textAlign:"center",color:"#ef4444",borderBottom:"1px solid #1e293b"}}>{s.l}</td>
                            <td style={{padding:"11px 12px",textAlign:"center",color:"#3b82f6",fontWeight:800,fontSize:15,borderBottom:"1px solid #1e293b"}}>{s.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            }
          </div>
        )}

        {/* ── MANAGE ── */}
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

      {/* ── MODALS ── */}
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
          <label style={lbl}>{isD?"Team Name (e.g. Rahul/Vikram)":"Player Name"}</label>
          <input
            style={inp}
            placeholder={isD?"Player1/Player2":"e.g. Rahul"}
            value={mf.teamName||""}
            onChange={e=>setMf(f=>({...f,teamName:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter"&&mf.teamName?.trim()) addTeam();}}
            autoFocus
          />
          {isD&&<div style={{fontSize:11,color:"#64748b",marginTop:6}}>Use "Name1/Name2" format to match the other teams</div>}
          <div style={{display:"flex",gap:8,marginTop:18}}>
            <button style={pbtn} disabled={!mf.teamName?.trim()} onClick={addTeam}>Add</button>
            <button style={sbtn} onClick={()=>setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
