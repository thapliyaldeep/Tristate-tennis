import { useState, useEffect } from "react";
import {
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification,
  signOut, onAuthStateChanged, sendPasswordResetEmail,
} from "firebase/auth";
import { ref, get, set, onValue } from "firebase/database";
import { auth, db, googleProvider, facebookProvider, appleProvider, ADMIN_EMAIL } from "./firebase";

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getApprovedEmails() {
  try {
    const snap = await get(ref(db, "approvedEmails"));
    return snap.exists() ? snap.val() : {};
  } catch { return {}; }
}

async function addApprovedEmail(email) {
  const key = email.toLowerCase().replace(/\./g, "_").replace(/@/g, "__at__");
  await set(ref(db, `approvedEmails/${key}`), { email: email.toLowerCase(), addedAt: Date.now() });
}

async function removeApprovedEmail(email) {
  const key = email.toLowerCase().replace(/\./g, "_").replace(/@/g, "__at__");
  await set(ref(db, `approvedEmails/${key}`), null);
}

async function isEmailApproved(email) {
  if (!email) return false;
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return true;
  const approved = await getApprovedEmails();
  return Object.values(approved).some(v => v.email === email.toLowerCase());
}

async function logUserAccess(user) {
  const key = user.uid;
  await set(ref(db, `users/${key}`), {
    email: user.email,
    name: user.displayName || "",
    photo: user.photoURL || "",
    lastLogin: Date.now(),
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  wrap: { minHeight:"100vh", background:"#050a12", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans','Georgia',sans-serif" },
  card: { background:"rgba(255,255,255,.03)", backdropFilter:"blur(24px)", border:"1px solid rgba(255,255,255,.08)", borderRadius:20, padding:"36px 32px", width:"100%", maxWidth:400, boxShadow:"0 32px 80px rgba(0,0,0,.5)" },
  input: { width:"100%", padding:"12px 14px", fontSize:14, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.1)", borderRadius:10, color:"#fff", boxSizing:"border-box", outline:"none", fontFamily:"inherit", marginBottom:12 },
  btn: { width:"100%", padding:"12px", fontSize:14, fontWeight:600, border:"none", borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:10, transition:"all .2s" },
  label: { display:"block", fontSize:10, color:"rgba(255,255,255,.4)", letterSpacing:2, textTransform:"uppercase", marginBottom:6 },
  err: { background:"rgba(239,68,68,.08)", border:"1px solid rgba(239,68,68,.25)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#fca5a5" },
  ok:  { background:"rgba(74,222,128,.08)", border:"1px solid rgba(74,222,128,.25)", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#86efac" },
};

// ─── Social Login Button ───────────────────────────────────────────────────────
function SocialBtn({ provider, label, icon, color, bg, onLogin }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try { await onLogin(provider); }
    finally { setLoading(false); }
  }
  return (
    <button onClick={handle} disabled={loading} style={{...S.btn, background:bg, color}}>
      {loading ? <span style={{fontSize:13}}>Signing in…</span> : <>{icon} {label}</>}
    </button>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onAuth }) {
  const [mode, setMode]       = useState("landing"); // landing | login | signup | reset
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [pass2, setPass2]     = useState("");
  const [err, setErr]         = useState("");
  const [msg, setMsg]         = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function socialLogin(provider) {
    setErr("");
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const approved = await isEmailApproved(user.email);
      if (!approved) {
        await signOut(auth);
        setErr(`Access denied. Your email (${user.email}) is not on the approved list. Contact the league admin.`);
        return;
      }
      await logUserAccess(user);
      onAuth(user);
    } catch(e) {
      setErr(e.message.replace("Firebase: ","").replace(/\(auth.*\)/,""));
    }
  }

  async function emailLogin(e) {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, pass);
      const user = result.user;
      const approved = await isEmailApproved(user.email);
      if (!approved) { await signOut(auth); setErr("Your email is not approved. Contact the league admin."); return; }
      await logUserAccess(user);
      onAuth(user);
    } catch(e) {
      setErr(e.code === "auth/invalid-credential" ? "Invalid email or password." : e.message.replace("Firebase: ",""));
    } finally { setLoading(false); }
  }

  async function emailSignup(e) {
    e.preventDefault(); setErr(""); setMsg("");
    if (pass !== pass2) { setErr("Passwords don't match."); return; }
    if (pass.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      const approved = await isEmailApproved(email);
      if (!approved) { setErr(`Your email (${email}) is not on the approved list. Contact deepcolour@gmail.com to get access.`); return; }
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(result.user);
      await logUserAccess(result.user);
      setMsg("Account created! Check your email to verify, then sign in.");
      setMode("login");
    } catch(e) {
      setErr(e.code === "auth/email-already-in-use" ? "This email is already registered. Try signing in." : e.message.replace("Firebase: ",""));
    } finally { setLoading(false); }
  }

  async function resetPassword(e) {
    e.preventDefault(); setErr(""); setMsg(""); setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("Password reset email sent! Check your inbox.");
    } catch(e) {
      setErr(e.message.replace("Firebase: ",""));
    } finally { setLoading(false); }
  }

  const balls = [{top:"8%",left:"10%",s:10},{top:"20%",right:"8%",s:7},{top:"60%",left:"4%",s:14},{top:"75%",right:"5%",s:9},{top:"40%",right:"3%",s:6}];

  return (
    <div style={S.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
        @keyframes float{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-16px) rotate(180deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        .auth-input:focus{border-color:#4ade80 !important;box-shadow:0 0 0 3px rgba(74,222,128,.12) !important;}
        .social-btn:hover{filter:brightness(1.1);transform:translateY(-1px);}
        .link-btn{background:none;border:none;color:#4ade80;cursor:pointer;font-size:13px;text-decoration:underline;padding:0;}
      `}</style>

      {/* Floating balls */}
      {balls.map((b,i)=>(
        <div key={i} style={{position:"fixed",top:b.top,left:b.left,right:b.right,zIndex:0,
          width:b.s,height:b.s,borderRadius:"50%",
          background:"radial-gradient(circle at 35% 35%,#bef264,#84cc16)",
          boxShadow:`0 0 ${b.s*2}px rgba(132,204,22,.35)`,
          animation:`float ${7+i*1.5}s ${i*.8}s ease-in-out infinite`,opacity:.6}}/>
      ))}

      {/* Background glow */}
      <div style={{position:"fixed",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(74,222,128,.06),transparent 70%)",zIndex:0}}/>

      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:400,animation:"fadeUp .5s ease both"}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:40,fontWeight:900,margin:"0 0 4px",
            background:"linear-gradient(135deg,#fff 0%,#4ade80 60%,#86efac 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
            backgroundSize:"200% auto",animation:"shimmer 4s linear infinite"}}>
            Tristate<br/><span style={{fontStyle:"italic",fontSize:"80%"}}>Tennis</span>
          </h1>
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)",letterSpacing:3,textTransform:"uppercase"}}>Members Only · Season 2026</div>
        </div>

        <div style={S.card}>
          {mode==="landing" && (
            <>
              <div style={{textAlign:"center",marginBottom:24}}>
                <div style={{fontSize:22,marginBottom:8}}>🎾</div>
                <div style={{fontWeight:700,fontSize:18,color:"#fff",marginBottom:4}}>Welcome</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.4)"}}>Sign in to access the league</div>
              </div>

              {err&&<div style={S.err}>⚠️ {err}</div>}

              {/* Social buttons */}
              <SocialBtn provider={googleProvider} label="Continue with Google" icon="🔵" color="#fff" bg="rgba(66,133,244,.15)" onLogin={socialLogin}/>
              <SocialBtn provider={facebookProvider} label="Continue with Facebook" icon="🔷" color="#fff" bg="rgba(24,119,242,.15)" onLogin={socialLogin}/>
              <SocialBtn provider={appleProvider} label="Continue with Apple" icon="🍎" color="#fff" bg="rgba(255,255,255,.08)" onLogin={socialLogin}/>

              <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0"}}>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
                <span style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>OR</span>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
              </div>

              <button onClick={()=>setMode("login")} style={{...S.btn,background:"rgba(74,222,128,.12)",color:"#4ade80",border:"1px solid rgba(74,222,128,.2)"}}>
                📧 Sign in with Email
              </button>
              <div style={{textAlign:"center",marginTop:8,fontSize:13,color:"rgba(255,255,255,.4)"}}>
                New here? <button className="link-btn" onClick={()=>setMode("signup")}>Create account</button>
              </div>
            </>
          )}

          {mode==="login" && (
            <>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Sign In</div>
              </div>
              {err&&<div style={S.err}>⚠️ {err}</div>}
              {msg&&<div style={S.ok}>✓ {msg}</div>}
              <form onSubmit={emailLogin}>
                <label style={S.label}>Email</label>
                <input className="auth-input" style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
                <label style={S.label}>Password</label>
                <div style={{position:"relative",marginBottom:12}}>
                  <input className="auth-input" style={{...S.input,marginBottom:0,paddingRight:40}} type={showPass?"text":"password"} value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" required/>
                  <button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:"absolute",right:12,top:12,background:"none",border:"none",color:"rgba(255,255,255,.3)",cursor:"pointer",fontSize:15}}>{showPass?"🙈":"👁"}</button>
                </div>
                <button type="submit" disabled={loading} style={{...S.btn,background:"linear-gradient(135deg,#4ade80,#16a34a)",color:"#021a0a",fontWeight:700}}>
                  {loading?<><div style={{width:15,height:15,border:"2px solid rgba(2,26,10,.3)",borderTopColor:"#021a0a",borderRadius:"50%",animation:"spin .6s linear infinite"}}/>Signing in…</>:"Sign In →"}
                </button>
              </form>
              <div style={{textAlign:"center",fontSize:13,color:"rgba(255,255,255,.4)",marginTop:8,display:"flex",justifyContent:"space-between"}}>
                <button className="link-btn" onClick={()=>setMode("reset")}>Forgot password?</button>
                <button className="link-btn" onClick={()=>setMode("signup")}>Create account</button>
              </div>
              <div style={{textAlign:"center",marginTop:12}}>
                <button className="link-btn" onClick={()=>setMode("landing")}>← Back</button>
              </div>
            </>
          )}

          {mode==="signup" && (
            <>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Create Account</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4}}>Your email must be approved by the admin</div>
              </div>
              {err&&<div style={S.err}>⚠️ {err}</div>}
              {msg&&<div style={S.ok}>✓ {msg}</div>}
              <form onSubmit={emailSignup}>
                <label style={S.label}>Email</label>
                <input className="auth-input" style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
                <label style={S.label}>Password</label>
                <input className="auth-input" style={S.input} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="Min 6 characters" required/>
                <label style={S.label}>Confirm Password</label>
                <input className="auth-input" style={S.input} type="password" value={pass2} onChange={e=>setPass2(e.target.value)} placeholder="Repeat password" required/>
                <button type="submit" disabled={loading} style={{...S.btn,background:"linear-gradient(135deg,#4ade80,#16a34a)",color:"#021a0a",fontWeight:700}}>
                  {loading?"Creating account…":"Create Account →"}
                </button>
              </form>
              <div style={{textAlign:"center",marginTop:8,fontSize:13,color:"rgba(255,255,255,.4)"}}>
                Already have one? <button className="link-btn" onClick={()=>setMode("login")}>Sign in</button>
              </div>
              <div style={{textAlign:"center",marginTop:8}}>
                <button className="link-btn" onClick={()=>setMode("landing")}>← Back</button>
              </div>
            </>
          )}

          {mode==="reset" && (
            <>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontWeight:700,fontSize:16,color:"#fff"}}>Reset Password</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4}}>We'll send a reset link to your email</div>
              </div>
              {err&&<div style={S.err}>⚠️ {err}</div>}
              {msg&&<div style={S.ok}>✓ {msg}</div>}
              <form onSubmit={resetPassword}>
                <label style={S.label}>Email</label>
                <input className="auth-input" style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/>
                <button type="submit" disabled={loading} style={{...S.btn,background:"linear-gradient(135deg,#4ade80,#16a34a)",color:"#021a0a",fontWeight:700}}>
                  {loading?"Sending…":"Send Reset Link"}
                </button>
              </form>
              <div style={{textAlign:"center",marginTop:8}}>
                <button className="link-btn" onClick={()=>setMode("login")}>← Back to sign in</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pending Approval Screen ───────────────────────────────────────────────────
function PendingApproval({ user, onSignOut }) {
  return (
    <div style={S.wrap}>
      <div style={{...S.card,textAlign:"center",maxWidth:420}}>
        <div style={{fontSize:40,marginBottom:16}}>⏳</div>
        <div style={{fontWeight:700,fontSize:20,color:"#fff",marginBottom:8}}>Pending Approval</div>
        <div style={{fontSize:14,color:"rgba(255,255,255,.5)",lineHeight:1.6,marginBottom:20}}>
          Your account <strong style={{color:"#4ade80"}}>{user.email}</strong> is waiting for approval from the league admin.
          <br/><br/>
          Contact <strong style={{color:"#4ade80"}}>deepcolour@gmail.com</strong> to get access.
        </div>
        <button onClick={onSignOut} style={{...S.btn,background:"rgba(255,255,255,.08)",color:"rgba(255,255,255,.6)"}}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ onClose }) {
  const [emails, setEmails]   = useState({});
  const [users, setUsers]     = useState({});
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg]         = useState("");
  const [err, setErr]         = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(()=>{
    const unsub1 = onValue(ref(db,"approvedEmails"), snap=>{ setEmails(snap.exists()?snap.val():{}); });
    const unsub2 = onValue(ref(db,"users"), snap=>{ setUsers(snap.exists()?snap.val():{}); });
    return ()=>{ unsub1(); unsub2(); };
  },[]);

  async function add() {
    if (!newEmail.trim()) return;
    setLoading(true); setErr(""); setMsg("");
    try {
      await addApprovedEmail(newEmail.trim());
      setMsg(`✓ ${newEmail} approved!`);
      setNewEmail("");
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function remove(email) {
    if (!window.confirm(`Remove ${email}?`)) return;
    await removeApprovedEmail(email);
  }

  const approvedList = Object.values(emails).sort((a,b)=>a.email.localeCompare(b.email));
  const registeredUsers = Object.values(users).sort((a,b)=>b.lastLogin-a.lastLogin);

  return (
    <div style={{position:"fixed",inset:0,background:"#07090f",zIndex:2000,overflowY:"auto",fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontWeight:800,fontSize:20,color:"#fff"}}>⚙️ Admin Panel</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>×</button>
        </div>

        {/* Add email */}
        <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:20,marginBottom:20}}>
          <div style={{fontWeight:700,color:"#fff",marginBottom:12}}>Approve New Email</div>
          {err&&<div style={{...S.err,marginBottom:12}}>⚠️ {err}</div>}
          {msg&&<div style={{...S.ok,marginBottom:12}}>{msg}</div>}
          <div style={{display:"flex",gap:8}}>
            <input value={newEmail} onChange={e=>setNewEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&add()}
              placeholder="player@email.com"
              style={{flex:1,padding:"10px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",fontSize:13,outline:"none"}}/>
            <button onClick={add} disabled={loading||!newEmail.trim()}
              style={{padding:"10px 20px",background:"#3b82f6",border:"none",borderRadius:8,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",opacity:loading||!newEmail.trim()?.5:1}}>
              {loading?"Adding…":"Approve"}
            </button>
          </div>
        </div>

        {/* Approved emails */}
        <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:20,marginBottom:20}}>
          <div style={{fontWeight:700,color:"#fff",marginBottom:12}}>Approved Emails ({approvedList.length})</div>
          {approvedList.length===0
            ?<div style={{color:"#64748b",fontSize:13}}>No approved emails yet</div>
            :approvedList.map(({email})=>(
              <div key={email} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1e293b"}}>
                <span style={{color:"#e2e8f0",fontSize:13}}>{email}</span>
                {email!==ADMIN_EMAIL&&<button onClick={()=>remove(email)}
                  style={{padding:"4px 10px",background:"#2d1515",border:"none",borderRadius:6,color:"#f87171",fontSize:11,cursor:"pointer"}}>
                  Remove
                </button>}
              </div>
            ))
          }
        </div>

        {/* Registered users */}
        <div style={{background:"#0e1320",border:"1px solid #1e293b",borderRadius:12,padding:20}}>
          <div style={{fontWeight:700,color:"#fff",marginBottom:12}}>Registered Users ({registeredUsers.length})</div>
          {registeredUsers.length===0
            ?<div style={{color:"#64748b",fontSize:13}}>No users yet</div>
            :registeredUsers.map(u=>(
              <div key={u.email} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid #1e293b"}}>
                {u.photo
                  ?<img src={u.photo} alt="" style={{width:28,height:28,borderRadius:"50%"}}/>
                  :<div style={{width:28,height:28,borderRadius:"50%",background:"#1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>{(u.name||u.email)[0].toUpperCase()}</div>
                }
                <div>
                  <div style={{fontSize:13,color:"#e2e8f0",fontWeight:600}}>{u.name||"—"}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{u.email} · Last login: {new Date(u.lastLogin).toLocaleDateString()}</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── Main Auth Wrapper ─────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser]         = useState(null);
  const [approved, setApproved] = useState(null); // null=loading, true/false
  const [checking, setChecking] = useState(true);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u)=>{
      if (u) {
        setUser(u);
        const ok = await isEmailApproved(u.email);
        setApproved(ok);
      } else {
        setUser(null);
        setApproved(null);
      }
      setChecking(false);
    });
    return unsub;
  },[]);

  return { user, approved, checking };
}

export { LoginPage, PendingApproval, AdminPanel, signOut, auth };
