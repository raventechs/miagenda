import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp,
} from "firebase/firestore";

// ── Paleta ───────────────────────────────────────────────────
const B = {
  red:"#E8001D", green:"#00A651", blue:"#0057A8", yellow:"#FFD100",
  orange:"#FF6600", pink:"#E8006F", teal:"#00A99D",
  white:"#FFFFFF", black:"#111111", bg:"#F4F4F0",
};

const TIPOS = [
  { id:"examen",     label:"📝 Examen",          color:B.red,    bg:"#FFE8EB" },
  { id:"trabajo",    label:"📚 Trabajo Práctico", color:B.blue,   bg:"#E0EEFF" },
  { id:"entrega",    label:"📦 Entrega",          color:B.green,  bg:"#E0F7ED" },
  { id:"exposicion", label:"🎤 Exposición",       color:B.orange, bg:"#FFF0E0" },
];

const MATERIAS = [
  "Matemática","Lengua","Historia","Geografía","Biología","Física",
  "Química","Inglés","Ed. Física","Arte","Música","Informática","Filosofía","Economía","Otra"
];

const DAYS_ES   = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
                   "Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MONTH_COLORS = [B.blue,B.teal,B.green,B.green,B.yellow,B.orange,
                      B.red,B.orange,B.pink,B.blue,B.teal,B.red];

const DEFAULT_NOTIF = { enabled:false, diasAntes:[1,3], hora:"08:00", vecesAlDia:1, permiso:"default" };

function getDaysLeft(dateStr) {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((new Date(dateStr+"T00:00:00") - t) / 86400000);
}
function getUrgency(days) {
  if (days < 0)  return { bg:"#CCCCCC", text:"#555555", label:"Vencido",   dot:"#AAAAAA" };
  if (days === 0)return { bg:B.red,     text:B.white,   label:"¡HOY!",     dot:B.red     };
  if (days <= 2) return { bg:B.orange,  text:B.white,   label:days===1?"Mañana":`${days} días`, dot:B.orange };
  if (days <= 5) return { bg:B.yellow,  text:B.black,   label:`${days} días`, dot:B.yellow };
  if (days <= 10)return { bg:B.green,   text:B.white,   label:`${days} días`, dot:B.green  };
  return           { bg:B.blue,    text:B.white,   label:`${days} días`, dot:B.blue   };
}
function getTipo(id) { return TIPOS.find(t=>t.id===id)||TIPOS[0]; }
function buildNotifMessage(task, dl) {
  const lbl = getTipo(task.tipo).label.split(" ").slice(1).join(" ");
  if (dl===0) return `🔴 ¡HOY! ${lbl} de ${task.materia}: "${task.titulo}"`;
  if (dl===1) return `🟠 Mañana: ${lbl} de ${task.materia}: "${task.titulo}"`;
  return `⏳ En ${dl} días: ${lbl} de ${task.materia}: "${task.titulo}"`;
}

// ════════════════════════════════════════════════════════════
//  PANTALLA DE LOGIN / REGISTRO
// ════════════════════════════════════════════════════════════
function AuthScreen({ onAuth }) {
  const [modo,     setModo]     = useState("login"); // login | registro
  const [nombre,   setNombre]   = useState("");
  const [email,    setEmail]    = useState("");
  const [pass,     setPass]     = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      if (modo === "registro") {
        if (!nombre.trim()) { setError("Escribí tu nombre"); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: nombre.trim() });
        // Guardar registro en Firestore para el listado de admin
        await setDoc(doc(db, "usuarios", cred.user.uid), {
          nombre: nombre.trim(),
          email:  email.toLowerCase(),
          fechaRegistro: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
    } catch(e) {
      const msgs = {
        "auth/email-already-in-use":   "Ese email ya está registrado",
        "auth/invalid-email":           "El email no es válido",
        "auth/weak-password":           "La contraseña debe tener al menos 6 caracteres",
        "auth/user-not-found":          "No existe una cuenta con ese email",
        "auth/wrong-password":          "Contraseña incorrecta",
        "auth/invalid-credential":      "Email o contraseña incorrectos",
      };
      setError(msgs[e.code] || "Algo salió mal, intentá de nuevo");
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:B.bg,display:"flex",alignItems:"center",
      justifyContent:"center",padding:20,fontFamily:"'Fredoka One',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800;900&display=swap');
        *{box-sizing:border-box;}
        @keyframes sand{0%{transform:rotate(0deg)}48%{transform:rotate(0deg)}50%{transform:rotate(180deg)}98%{transform:rotate(180deg)}100%{transform:rotate(360deg)}}
        @keyframes up{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .hourglass{display:inline-block;animation:sand 3s ease-in-out infinite;}
        .up{animation:up 0.3s ease forwards;}
        .press:active{transform:scale(0.96);}
        input{outline:none;border:none;font-family:'Nunito',sans-serif;}
      `}</style>

      <div className="up" style={{background:B.white,borderRadius:24,padding:"32px 28px",
        width:"100%",maxWidth:380,boxShadow:"0 8px 40px rgba(0,0,0,0.12)"}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:52}}><span className="hourglass">⏳</span></div>
          <div style={{fontSize:30,color:B.blue,letterSpacing:1,marginTop:4}}>MiAgenda</div>
          <div style={{fontSize:14,color:"#888",fontFamily:"'Nunito',sans-serif",fontWeight:800,marginTop:4}}>
            {modo==="login" ? "Iniciá sesión para continuar" : "Creá tu cuenta gratis"}
          </div>
        </div>

        {/* Toggle login/registro */}
        <div style={{display:"flex",background:B.bg,borderRadius:14,padding:4,marginBottom:22}}>
          {[["login","Ingresar"],["registro","Registrarme"]].map(([m,lbl])=>(
            <button key={m} className="press" onClick={()=>{setModo(m);setError("");}}
              style={{flex:1,padding:"10px 0",borderRadius:11,border:"none",cursor:"pointer",
                fontFamily:"'Fredoka One',sans-serif",fontSize:15,transition:"all 0.18s",
                background:modo===m?B.blue:"transparent",
                color:modo===m?B.white:"#888"}}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Nombre (solo registro) */}
        {modo==="registro" && (
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:900,
              color:B.black,marginBottom:6}}>TU NOMBRE</div>
            <input value={nombre} onChange={e=>setNombre(e.target.value)}
              placeholder="Ej: Lucía Martínez"
              style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.bg,
                border:`3px solid ${nombre?B.green:"#E0E0E0"}`,color:B.black,
                fontSize:15,fontWeight:700,transition:"border 0.2s"}}/>
          </div>
        )}

        {/* Email */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:900,
            color:B.black,marginBottom:6}}>EMAIL</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="tucorreo@gmail.com"
            style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.bg,
              border:`3px solid ${email?B.blue:"#E0E0E0"}`,color:B.black,
              fontSize:15,fontWeight:700,transition:"border 0.2s"}}/>
        </div>

        {/* Contraseña */}
        <div style={{marginBottom:22}}>
          <div style={{fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:900,
            color:B.black,marginBottom:6}}>CONTRASEÑA</div>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
            placeholder={modo==="registro"?"Mínimo 6 caracteres":"Tu contraseña"}
            style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.bg,
              border:`3px solid ${pass?B.orange:"#E0E0E0"}`,color:B.black,
              fontSize:15,fontWeight:700,transition:"border 0.2s"}}/>
        </div>

        {/* Error */}
        {error && (
          <div style={{background:"#FFE8EB",border:`2px solid ${B.red}`,borderRadius:10,
            padding:"10px 14px",marginBottom:16,color:B.red,
            fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14}}>
            ⚠️ {error}
          </div>
        )}

        {/* Botón */}
        <button className="press" onClick={handleSubmit} disabled={loading||!email||!pass}
          style={{width:"100%",padding:"16px",borderRadius:16,border:"none",cursor:"pointer",
            background: loading||!email||!pass ? "#CCC" : B.blue,
            color:B.white,fontFamily:"'Fredoka One',sans-serif",fontSize:20,letterSpacing:0.5,
            boxShadow: email&&pass ? `0 5px 20px ${B.blue}55`:"none",transition:"all 0.2s"}}>
          {loading ? "Cargando..." : modo==="login" ? "Ingresar 🚀" : "Crear mi cuenta ✨"}
        </button>

        {modo==="registro" && (
          <div style={{fontSize:12,color:"#AAA",textAlign:"center",marginTop:12,
            fontFamily:"'Nunito',sans-serif",fontWeight:700}}>
            Al registrarte aceptás usar la app de forma responsable
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  APP PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function App() {
  const [user,     setUser]     = useState(undefined); // undefined=cargando
  const [screen,   setScreen]   = useState("resumen");
  const [tasks,    setTasks]    = useState([]);
  const [calYear,  setCalYear]  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selDay,   setSelDay]   = useState(null);
  const [form,     setForm]     = useState({titulo:"",materia:"Matemática",tipo:"examen",fecha:"",descripcion:""});
  const [saved,    setSaved]    = useState(false);
  const [delId,    setDelId]    = useState(null);
  const [showCfg,  setShowCfg]  = useState(false);
  const [notif,    setNotif]    = useState(DEFAULT_NOTIF);
  const [cfgSaved, setCfgSaved] = useState(false);
  const [toasts,   setToasts]   = useState([]);
  const notifTimer = useRef(null);

  // ── Auth listener ────────────────────────────────────────
  useEffect(()=>{
    return onAuthStateChanged(auth, u => setUser(u || null));
  },[]);

  // ── Firestore: tasks en tiempo real ──────────────────────
  useEffect(()=>{
    if (!user) { setTasks([]); return; }
    const q = query(
      collection(db, "usuarios", user.uid, "tareas"),
      orderBy("fecha","asc")
    );
    const unsub = onSnapshot(q, snap=>{
      setTasks(snap.docs.map(d=>({id:d.id,...d.data()})));
    });
    return unsub;
  },[user]);

  // ── Notif config desde localStorage (por usuario) ────────
  useEffect(()=>{
    if (!user) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`notif_${user.uid}`)||"{}");
      setNotif({...DEFAULT_NOTIF,...saved});
    } catch{}
  },[user]);

  useEffect(()=>{
    if (!user) return;
    localStorage.setItem(`notif_${user.uid}`, JSON.stringify(notif));
  },[notif, user]);

  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split("T")[0];
  const firstDay    = new Date(calYear,calMonth,1).getDay();
  const daysInMonth = new Date(calYear,calMonth+1,0).getDate();
  const headerColor = MONTH_COLORS[calMonth];

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg, color=B.blue) {
    const id = Date.now();
    setToasts(p=>[...p,{id,msg,color}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4000);
  }

  // ── Notificaciones ────────────────────────────────────────
  useEffect(()=>{
    if (notifTimer.current) clearInterval(notifTimer.current);
    if (!notif.enabled) return;
    function check() {
      const now  = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      const times = [notif.hora];
      if (notif.vecesAlDia===2) {
        const [h,m]=notif.hora.split(":").map(Number);
        times.push(`${String((h+8)%24).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
      }
      if (!times.includes(hhmm)) return;
      const key = hhmm+"-"+todayStr;
      if (localStorage.getItem("last_notif")===key) return;
      localStorage.setItem("last_notif",key);
      tasks.map(t=>({...t,dl:getDaysLeft(t.fecha)}))
           .filter(t=>t.dl>=0&&notif.diasAntes.includes(t.dl))
           .forEach(t=>{
             const msg=buildNotifMessage(t,t.dl);
             if (notif.permiso==="granted"&&"Notification" in window)
               new Notification("⏳ MiAgenda",{body:msg});
             showToast(msg,getUrgency(t.dl).dot);
           });
    }
    notifTimer.current=setInterval(check,60000);
    return()=>clearInterval(notifTimer.current);
  },[notif,tasks]);

  async function requestPermission() {
    if (!("Notification" in window)){showToast("Tu navegador no soporta notificaciones",B.orange);return;}
    const r=await Notification.requestPermission();
    setNotif(n=>({...n,permiso:r,enabled:r==="granted"?true:n.enabled}));
    if(r==="granted") showToast("✅ Notificaciones activadas!",B.green);
    else showToast("❌ Permiso denegado",B.red);
  }

  function testNotif(){
    const msg="⏳ En 3 días: Examen de Historia: \"Revolución Francesa\"";
    if(notif.permiso==="granted"&&"Notification" in window) new Notification("⏳ MiAgenda",{body:msg});
    showToast(msg,B.orange);
  }

  // ── CRUD Firestore ────────────────────────────────────────
  async function handleSave() {
    if(!form.titulo||!form.fecha||!user) return;
    const id = Date.now().toString();
    await setDoc(doc(db,"usuarios",user.uid,"tareas",id),{
      ...form, creadoEn: serverTimestamp()
    });
    setForm({titulo:"",materia:"Matemática",tipo:"examen",fecha:"",descripcion:""});
    setSaved(true);
    setTimeout(()=>{setSaved(false);setScreen("resumen");},1300);
  }

  async function handleDelete(id){
    await deleteDoc(doc(db,"usuarios",user.uid,"tareas",id));
    setDelId(null);
  }

  function tasksOn(day){
    const ds=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return tasks.filter(t=>t.fecha===ds);
  }

  function toggleDiaAntes(d){
    setNotif(n=>({...n,diasAntes:n.diasAntes.includes(d)?n.diasAntes.filter(x=>x!==d):[...n.diasAntes,d].sort((a,b)=>a-b)}));
  }

  function saveConfig(){setCfgSaved(true);setTimeout(()=>{setCfgSaved(false);setShowCfg(false);},1200);}

  const upcoming=tasks.map(t=>({...t,dl:getDaysLeft(t.fecha)})).filter(t=>t.dl>=0).sort((a,b)=>a.dl-b.dl);
  const past=tasks.map(t=>({...t,dl:getDaysLeft(t.fecha)})).filter(t=>t.dl<0).sort((a,b)=>b.dl-a.dl);
  const permColor=notif.permiso==="granted"?B.green:notif.permiso==="denied"?B.red:B.orange;
  const permLabel=notif.permiso==="granted"?"Activadas ✅":notif.permiso==="denied"?"Bloqueadas ❌":"Sin permiso ⚠️";

  // ── Pantalla de carga ────────────────────────────────────
  if (user===undefined) return (
    <div style={{minHeight:"100vh",background:B.bg,display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'Fredoka One',sans-serif",fontSize:20,color:B.blue}}>
      <span style={{display:"inline-block",animation:"sand 3s ease-in-out infinite"}}>⏳</span>
      &nbsp;Cargando...
    </div>
  );

  // ── Si no hay usuario → Login ────────────────────────────
  if (!user) return <AuthScreen />;

  // ── App principal ────────────────────────────────────────
  const nombre = user.displayName || user.email.split("@")[0];

  return (
    <div style={{minHeight:"100vh",background:B.bg,fontFamily:"'Fredoka One',sans-serif",
      color:B.black,maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:80}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@700;800;900&display=swap');
        *{box-sizing:border-box;}
        body{background:${B.bg};}
        .press:active{transform:scale(0.94);}
        .card{transition:box-shadow 0.15s,transform 0.15s;}
        .card:active{transform:scale(0.985);}
        @keyframes pop{0%{transform:scale(0.75);opacity:0}65%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
        @keyframes up{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.35}}
        @keyframes sand{0%{transform:rotate(0deg)}48%{transform:rotate(0deg)}50%{transform:rotate(180deg)}98%{transform:rotate(180deg)}100%{transform:rotate(360deg)}}
        @keyframes toastIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
        .pop{animation:pop 0.32s ease forwards;}
        .up{animation:up 0.28s ease forwards;}
        .blink{animation:blink 1.1s ease-in-out infinite;}
        .hourglass{display:inline-block;animation:sand 3s ease-in-out infinite;}
        .toast{animation:toastIn 0.35s ease forwards;}
        input,select,textarea{outline:none;border:none;font-family:inherit;}
        select option{font-family:Arial,sans-serif;}
        .cal-cell:hover{opacity:0.8;}
        .toggle-track{position:relative;width:52px;height:28px;border-radius:14px;cursor:pointer;transition:background 0.25s;border:none;}
        .toggle-thumb{position:absolute;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);transition:left 0.25s;}
        .chip{display:inline-flex;align-items:center;justify-content:center;border-radius:20px;padding:7px 14px;cursor:pointer;font-family:'Fredoka One',sans-serif;font-size:15px;transition:all 0.18s;border:3px solid transparent;}
        .chip:active{transform:scale(0.93);}
      `}</style>

      {/* TOASTS */}
      <div style={{position:"fixed",top:12,right:12,zIndex:999,display:"flex",flexDirection:"column",gap:8,maxWidth:300}}>
        {toasts.map(t=>(
          <div key={t.id} className="toast" style={{background:B.white,borderRadius:12,padding:"11px 14px",
            borderLeft:`5px solid ${t.color}`,boxShadow:"0 4px 20px rgba(0,0,0,0.18)",
            fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,color:B.black,lineHeight:1.4}}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* HEADER */}
      <div style={{background:headerColor,padding:"18px 18px 14px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-30,top:-30,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.15)"}}/>
        <div style={{position:"absolute",right:30,bottom:-40,width:90,height:90,borderRadius:"50%",background:"rgba(0,0,0,0.08)"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative"}}>
          <div>
            <div style={{fontSize:28,color:B.white,letterSpacing:1,textShadow:"2px 2px 0 rgba(0,0,0,0.15)"}}>
              <span className="hourglass">⏳</span> MiAgenda
            </div>
            <div style={{fontSize:13,color:B.white,marginTop:2,fontFamily:"'Nunito',sans-serif",fontWeight:900}}>
              Hola, {nombre} 👋
            </div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>
              {today.toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button className="press" onClick={()=>setShowCfg(true)} style={{
              background:"rgba(255,255,255,0.25)",border:"2px solid rgba(255,255,255,0.5)",
              borderRadius:12,width:40,height:40,fontSize:20,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              ⚙️
              {notif.enabled&&<div style={{position:"absolute",top:4,right:4,width:9,height:9,
                borderRadius:"50%",background:B.green,border:"2px solid "+headerColor}}/>}
            </button>
            <button className="press" onClick={()=>signOut(auth)} style={{
              background:"rgba(255,255,255,0.25)",border:"2px solid rgba(255,255,255,0.5)",
              borderRadius:12,width:40,height:40,fontSize:18,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              🚪
            </button>
            <div style={{background:"rgba(255,255,255,0.25)",borderRadius:14,padding:"6px 14px",border:"2px solid rgba(255,255,255,0.5)"}}>
              <span style={{color:B.white,fontFamily:"'Fredoka One',sans-serif",fontSize:24,display:"block",textAlign:"center",lineHeight:1}}>{upcoming.length}</span>
              <span style={{color:"rgba(255,255,255,0.9)",fontSize:11,fontFamily:"'Nunito',sans-serif",fontWeight:800}}>próximas</span>
            </div>
          </div>
        </div>
      </div>

      {/* NAV */}
      <div style={{display:"flex",background:B.white,borderBottom:`3px solid ${B.bg}`,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
        {[["resumen","📋","Resumen"],["home","🗓️","Agenda"],["nueva","➕","Nueva"]].map(([id,icon,lbl])=>(
          <button key={id} className="press" onClick={()=>setScreen(id)} style={{
            flex:1,padding:"11px 0",background:screen===id?B.bg:"transparent",
            color:screen===id?headerColor:B.black,fontFamily:"'Fredoka One',sans-serif",
            fontSize:13,cursor:"pointer",
            borderBottom:screen===id?`4px solid ${headerColor}`:"4px solid transparent",
            borderTop:"none",borderLeft:"none",borderRight:"none",
            transition:"all 0.18s",letterSpacing:0.5
          }}>{icon} {lbl}</button>
        ))}
      </div>

      {/* ════════ RESUMEN ════════ */}
      {screen==="resumen"&&(
        <div style={{padding:"14px 12px"}} className="up">
          <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:24,marginBottom:16,color:B.black}}>
            Próximas actividades
          </div>
          {upcoming.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",background:B.white,borderRadius:20,border:"3px dashed #CCC"}}>
              <div style={{fontSize:52}}>🎉</div>
              <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:20,marginTop:8,color:B.green}}>¡Todo al día!</div>
              <div style={{fontSize:14,marginTop:4,color:"#888",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>No tenés actividades pendientes</div>
            </div>
          )}
          {upcoming.map((t,idx)=>{
            const tipo=getTipo(t.tipo); const urg=getUrgency(t.dl); const hot=t.dl<=1;
            return(
              <div key={t.id} className="card up" style={{background:B.white,borderRadius:16,marginBottom:12,
                overflow:"hidden",border:`3px solid ${urg.dot}`,
                boxShadow:hot?`0 4px 20px ${urg.dot}55`:"0 2px 10px rgba(0,0,0,0.07)",
                animationDelay:`${idx*0.05}s`}}>
                <div style={{height:6,background:urg.bg}}/>
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:12,background:tipo.bg,color:tipo.color,padding:"3px 10px",
                          borderRadius:20,fontFamily:"'Fredoka One',sans-serif",border:`1.5px solid ${tipo.color}`}}>
                          {tipo.label}
                        </span>
                        <span style={{fontSize:12,color:"#666",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>{t.materia}</span>
                      </div>
                      <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:18,color:B.black,lineHeight:1.2}}>{t.titulo}</div>
                      {t.descripcion&&<div style={{fontSize:13,color:"#555",marginTop:5,lineHeight:1.5,fontFamily:"'Nunito',sans-serif",fontWeight:700}}>{t.descripcion}</div>}
                      <div style={{fontSize:12,color:"#888",marginTop:6,fontFamily:"'Nunito',sans-serif",fontWeight:800}}>
                        📅 {new Date(t.fecha+"T00:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div className={hot?"blink":""} style={{background:urg.bg,color:urg.text,borderRadius:14,
                        padding:"8px 12px",fontFamily:"'Fredoka One',sans-serif",
                        fontSize:t.dl===0?13:22,minWidth:58,textAlign:"center",
                        boxShadow:hot?`0 0 16px ${urg.dot}88`:"none",border:`2px solid ${urg.dot}`}}>
                        {t.dl===0?"¡HOY!":t.dl===1?"1":t.dl}
                      </div>
                      {t.dl>1&&<div style={{fontSize:10,color:"#888",fontFamily:"'Nunito',sans-serif",fontWeight:900}}>DÍAS</div>}
                      <button onClick={()=>setDelId(t.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,marginTop:2}}>🗑️</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{background:B.white,borderRadius:16,padding:16,border:"2px solid #E8E8E8",marginTop:8}}>
            <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:16,marginBottom:10,color:B.black}}>¿Qué significa cada color?</div>
            {[[B.red,B.white,"🔴 Hoy — ¡Es hoy!"],[B.orange,B.white,"🟠 1-2 días — ¡Urgente!"],[B.yellow,B.black,"🟡 3-5 días — ¡Atención!"],[B.green,B.white,"🟢 6-10 días — Con tiempo"],[B.blue,B.white,"🔵 +10 días — Tranquilo"]].map(([bg,col,lbl],i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
                <div style={{width:36,height:20,borderRadius:8,background:bg,flexShrink:0}}/>
                <span style={{fontSize:14,fontFamily:"'Nunito',sans-serif",fontWeight:800,color:B.black}}>{lbl}</span>
              </div>
            ))}
          </div>
          {past.length>0&&(
            <>
              <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:18,margin:"20px 0 10px",color:"#AAA"}}>Actividades pasadas</div>
              {past.map(t=>{
                const tipo=getTipo(t.tipo);
                return(
                  <div key={t.id} style={{background:"#F4F4F4",borderRadius:12,padding:"10px 14px",
                    marginBottom:8,border:"2px solid #E0E0E0",opacity:0.65,display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:15,textDecoration:"line-through",color:"#AAA"}}>{t.titulo}</div>
                      <div style={{fontSize:12,color:"#BBB",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>{t.materia} · {tipo.label}</div>
                    </div>
                    <button onClick={()=>setDelId(t.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#CCC"}}>🗑️</button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ════════ AGENDA / CALENDARIO ════════ */}
      {screen==="home"&&(
        <div style={{padding:"14px 12px"}} className="up">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <button className="press" onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1)}}
              style={{background:headerColor,border:"none",color:B.white,borderRadius:10,width:38,height:38,fontSize:20,cursor:"pointer",boxShadow:"2px 2px 0 rgba(0,0,0,0.15)"}}>‹</button>
            <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:22,color:headerColor}}>{MONTHS_ES[calMonth]} {calYear}</div>
            <button className="press" onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1)}}
              style={{background:headerColor,border:"none",color:B.white,borderRadius:10,width:38,height:38,fontSize:20,cursor:"pointer",boxShadow:"2px 2px 0 rgba(0,0,0,0.15)"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
            {DAYS_ES.map((d,i)=>(
              <div key={d} style={{textAlign:"center",fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:900,
                color:i===0||i===6?B.red:B.black,padding:"4px 0"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i}/>)}
            {Array(daysInMonth).fill(null).map((_,i)=>{
              const day=i+1;
              const ds=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dt=tasksOn(day); const isToday=ds===todayStr; const isSel=selDay===day;
              const isWE=new Date(calYear,calMonth,day).getDay()===0||new Date(calYear,calMonth,day).getDay()===6;
              return(
                <div key={day} className="cal-cell press" onClick={()=>setSelDay(isSel?null:day)}
                  style={{borderRadius:10,padding:"5px 2px",textAlign:"center",cursor:"pointer",minHeight:52,
                    background:isSel?headerColor:isToday?B.yellow:B.white,
                    border:`2px solid ${isSel?headerColor:isToday?B.yellow:"#E0E0E0"}`,
                    transition:"all 0.15s"}}>
                  <div style={{fontSize:15,fontFamily:"'Fredoka One',sans-serif",
                    color:isSel?B.white:isToday?B.black:isWE?B.red:B.black}}>{day}</div>
                  {dt.length>0&&(
                    <div style={{display:"flex",justifyContent:"center",gap:2,flexWrap:"wrap",marginTop:2}}>
                      {dt.slice(0,3).map(t=>(
                        <div key={t.id} style={{width:8,height:8,borderRadius:"50%",background:getTipo(t.tipo).color,border:`1.5px solid ${B.white}`}}/>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {selDay&&(
            <div style={{marginTop:14,background:B.white,borderRadius:16,padding:14,
              border:`3px solid ${headerColor}`,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}} className="pop">
              <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:18,marginBottom:10,color:headerColor}}>
                {selDay} de {MONTHS_ES[calMonth]}
              </div>
              {tasksOn(selDay).length===0
                ?<div style={{color:"#AAA",fontSize:14,textAlign:"center",padding:"10px 0",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>Sin actividades este día ✨</div>
                :tasksOn(selDay).map(t=>{
                  const tipo=getTipo(t.tipo); const urg=getUrgency(getDaysLeft(t.fecha));
                  return(
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:tipo.bg,borderRadius:12,marginBottom:8,borderLeft:`5px solid ${tipo.color}`}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:15,color:B.black}}>{t.titulo}</div>
                        <div style={{fontSize:12,color:"#555",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>{t.materia} · {tipo.label}</div>
                      </div>
                      <div style={{background:urg.bg,color:urg.text,borderRadius:8,padding:"4px 10px",
                        fontFamily:"'Fredoka One',sans-serif",fontSize:13}}>{urg.label}</div>
                    </div>
                  );
                })
              }
            </div>
          )}
          <div style={{marginTop:14,background:B.white,borderRadius:14,padding:"10px 14px",border:"2px solid #E8E8E8",display:"flex",gap:10,flexWrap:"wrap"}}>
            {TIPOS.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:t.color}}/>
                <span style={{fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:800,color:B.black}}>{t.label.split(" ").slice(1).join(" ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════ NUEVA ════════ */}
      {screen==="nueva"&&(
        <div style={{padding:"14px 12px"}} className="up">
          <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:26,marginBottom:18,color:B.black}}>Nueva Actividad ✏️</div>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:13,fontFamily:"'Nunito',sans-serif",fontWeight:900,color:B.black,marginBottom:8}}>TIPO DE ACTIVIDAD</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {TIPOS.map(t=>(
                <button key={t.id} className="press" onClick={()=>setForm(f=>({...f,tipo:t.id}))}
                  style={{padding:"13px 8px",borderRadius:14,cursor:"pointer",fontFamily:"'Fredoka One',sans-serif",fontSize:14,
                    background:form.tipo===t.id?t.bg:B.white,border:`3px solid ${form.tipo===t.id?t.color:"#E0E0E0"}`,
                    color:form.tipo===t.id?t.color:"#888",boxShadow:form.tipo===t.id?`0 3px 12px ${t.color}44`:"none",
                    transition:"all 0.18s"}}>{t.label}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:13,fontFamily:"'Nunito',sans-serif",fontWeight:900,color:B.black,marginBottom:8}}>MATERIA</div>
            <select value={form.materia} onChange={e=>setForm(f=>({...f,materia:e.target.value}))}
              style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.white,
                border:"3px solid #E0E0E0",color:B.black,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
              {MATERIAS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:13,fontFamily:"'Nunito',sans-serif",fontWeight:900,color:B.black,marginBottom:8}}>TÍTULO / TEMA</div>
            <input value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))}
              placeholder="Ej: Parcial de álgebra, TP Revolución Francesa..."
              style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.white,
                border:`3px solid ${form.titulo?B.green:"#E0E0E0"}`,color:B.black,
                fontSize:15,fontFamily:"'Nunito',sans-serif",fontWeight:700,transition:"border 0.2s"}}/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:13,fontFamily:"'Nunito',sans-serif",fontWeight:900,color:B.black,marginBottom:8}}>FECHA 📅</div>
            <input type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}
              min={todayStr}
              style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.white,
                border:`3px solid ${form.fecha?B.blue:"#E0E0E0"}`,color:B.black,
                fontSize:15,fontFamily:"'Nunito',sans-serif",fontWeight:700,transition:"border 0.2s"}}/>
            {form.fecha&&(()=>{const d=getDaysLeft(form.fecha);const urg=getUrgency(d);
              return<div style={{marginTop:7,display:"inline-block",background:urg.bg,color:urg.text,
                padding:"4px 14px",borderRadius:20,fontFamily:"'Fredoka One',sans-serif",fontSize:14,
                boxShadow:`0 2px 8px ${urg.dot}55`}}>⏱ {urg.label}</div>;})()}
          </div>
          <div style={{marginBottom:22}}>
            <div style={{fontSize:13,fontFamily:"'Nunito',sans-serif",fontWeight:900,color:B.black,marginBottom:8}}>
              NOTAS <span style={{fontWeight:700,color:"#AAA"}}>(opcional)</span>
            </div>
            <textarea value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}
              placeholder="Temas, capítulos, materiales que necesitás..."
              rows={3}
              style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.white,
                border:"3px solid #E0E0E0",color:B.black,fontSize:14,
                fontFamily:"'Nunito',sans-serif",fontWeight:700,resize:"none",lineHeight:1.6}}/>
          </div>
          <button className="press" onClick={handleSave} disabled={!form.titulo||!form.fecha}
            style={{width:"100%",padding:"16px",borderRadius:16,cursor:form.titulo&&form.fecha?"pointer":"not-allowed",
              background:saved?B.green:(form.titulo&&form.fecha?B.blue:"#CCC"),color:B.white,
              fontFamily:"'Fredoka One',sans-serif",fontSize:20,border:"none",
              boxShadow:form.titulo&&form.fecha?`0 5px 20px ${B.blue}55`:"none",transition:"all 0.2s"}}>
            {saved?"✅ ¡Guardado!":"Guardar actividad 🚀"}
          </button>
          <div style={{fontSize:12,color:"#AAA",textAlign:"center",marginTop:10,fontFamily:"'Nunito',sans-serif",fontWeight:700}}>
            Tus datos se guardan en la nube ☁️
          </div>
        </div>
      )}

      {/* ════════ CONFIG NOTIFICACIONES ════════ */}
      {showCfg&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",
          alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
          <div style={{background:B.white,borderRadius:"24px 24px 0 0",padding:"22px 20px 32px",
            width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",
            boxShadow:"0 -8px 40px rgba(0,0,0,0.25)"}} className="pop">
            <div style={{width:40,height:4,borderRadius:2,background:"#DDD",margin:"0 auto 18px"}}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:22,color:B.black}}>🔔 Notificaciones</div>
              <button className="press" onClick={()=>setShowCfg(false)}
                style={{background:"#F0F0F0",border:"none",borderRadius:10,width:34,height:34,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{background:"#F8F8F8",borderRadius:14,padding:"12px 14px",marginBottom:18,
              border:`2px solid ${permColor}22`,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:permColor,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:15,color:B.black}}>Estado del navegador</div>
                <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,color:permColor}}>{permLabel}</div>
              </div>
              {notif.permiso!=="granted"&&(
                <button className="press" onClick={requestPermission}
                  style={{background:B.blue,border:"none",borderRadius:10,padding:"8px 14px",
                    color:B.white,fontFamily:"'Fredoka One',sans-serif",fontSize:13,cursor:"pointer"}}>Activar</button>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              background:"#F8F8F8",borderRadius:14,padding:"14px 16px",marginBottom:18,border:"2px solid #E8E8E8"}}>
              <div>
                <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:17,color:B.black}}>Avisos activados</div>
                <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:"#888",marginTop:2}}>
                  {notif.enabled?"Vas a recibir recordatorios":"Los avisos están apagados"}
                </div>
              </div>
              <button className="toggle-track press" onClick={()=>setNotif(n=>({...n,enabled:!n.enabled}))}
                style={{background:notif.enabled?B.green:"#CCC"}}>
                <div className="toggle-thumb" style={{left:notif.enabled?27:3}}/>
              </button>
            </div>
            {notif.enabled&&(
              <>
                <div style={{marginBottom:18}}>
                  <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:16,color:B.black,marginBottom:4}}>¿Cuántos días antes?</div>
                  <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:"#888",marginBottom:10}}>Podés elegir más de uno</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[0,1,2,3,5,7].map(d=>{
                      const sel=notif.diasAntes.includes(d);
                      const labels={0:"El día",1:"1 día",2:"2 días",3:"3 días",5:"5 días",7:"1 semana"};
                      return(
                        <button key={d} className="chip press" onClick={()=>toggleDiaAntes(d)}
                          style={{background:sel?B.blue:B.white,color:sel?B.white:B.black,
                            border:`3px solid ${sel?B.blue:"#DDD"}`,boxShadow:sel?`0 3px 10px ${B.blue}44`:"none"}}>
                          {labels[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{marginBottom:18}}>
                  <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:16,color:B.black,marginBottom:10}}>🕐 Horario del aviso</div>
                  <input type="time" value={notif.hora} onChange={e=>setNotif(n=>({...n,hora:e.target.value}))}
                    style={{width:"100%",padding:"13px 14px",borderRadius:12,background:B.white,
                      border:`3px solid ${B.blue}`,color:B.black,fontSize:18,fontFamily:"'Fredoka One',sans-serif"}}/>
                </div>
                <div style={{marginBottom:22}}>
                  <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:16,color:B.black,marginBottom:4}}>¿Cuántas veces por día?</div>
                  {notif.vecesAlDia===2&&(
                    <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:12,color:"#888",marginBottom:10}}>
                      2do aviso: {(()=>{const[h,m]=notif.hora.split(":").map(Number);return`${String((h+8)%24).padStart(2,"0")}:${String(m).padStart(2,"0")}`})()} (8hs después)
                    </div>
                  )}
                  <div style={{display:"flex",gap:10}}>
                    {[1,2].map(v=>(
                      <button key={v} className="chip press" onClick={()=>setNotif(n=>({...n,vecesAlDia:v}))}
                        style={{flex:1,background:notif.vecesAlDia===v?B.orange:B.white,
                          color:notif.vecesAlDia===v?B.white:B.black,
                          border:`3px solid ${notif.vecesAlDia===v?B.orange:"#DDD"}`,
                          boxShadow:notif.vecesAlDia===v?`0 3px 10px ${B.orange}44`:"none",padding:"10px 0",fontSize:15}}>
                        {v===1?"1 vez por día":"2 veces por día"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div style={{display:"flex",gap:10}}>
              <button className="press" onClick={testNotif}
                style={{flex:1,padding:"13px",borderRadius:14,background:"#F0F0F0",border:"3px solid #DDD",
                  color:B.black,fontFamily:"'Fredoka One',sans-serif",fontSize:15,cursor:"pointer"}}>🧪 Probar aviso</button>
              <button className="press" onClick={saveConfig}
                style={{flex:1,padding:"13px",borderRadius:14,background:cfgSaved?B.green:B.blue,border:"none",
                  color:B.white,fontFamily:"'Fredoka One',sans-serif",fontSize:15,cursor:"pointer",
                  boxShadow:`0 4px 14px ${B.blue}55`,transition:"background 0.2s"}}>
                {cfgSaved?"✅ ¡Guardado!":"Guardar ✓"}
              </button>
            </div>
            <div style={{fontSize:12,color:"#AAA",textAlign:"center",marginTop:12,fontFamily:"'Nunito',sans-serif",fontWeight:700,lineHeight:1.5}}>
              Los avisos funcionan cuando la app está abierta.
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {delId&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",
          alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}>
          <div style={{background:B.white,borderRadius:22,padding:26,width:"100%",maxWidth:300,
            border:`4px solid ${B.red}`,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} className="pop">
            <div style={{fontSize:42,textAlign:"center",marginBottom:10}}>🗑️</div>
            <div style={{fontFamily:"'Fredoka One',sans-serif",fontSize:20,textAlign:"center",marginBottom:6,color:B.black}}>¿Eliminar actividad?</div>
            <div style={{fontSize:14,color:"#888",textAlign:"center",marginBottom:20,fontFamily:"'Nunito',sans-serif",fontWeight:800}}>Esta acción no se puede deshacer</div>
            <div style={{display:"flex",gap:10}}>
              <button className="press" onClick={()=>setDelId(null)}
                style={{flex:1,padding:13,borderRadius:12,background:"#F0F0F0",border:"3px solid #DDD",
                  color:B.black,fontFamily:"'Fredoka One',sans-serif",fontSize:16,cursor:"pointer"}}>Cancelar</button>
              <button className="press" onClick={()=>handleDelete(delId)}
                style={{flex:1,padding:13,borderRadius:12,background:B.red,border:`3px solid ${B.red}`,
                  color:B.white,fontFamily:"'Fredoka One',sans-serif",fontSize:16,cursor:"pointer",
                  boxShadow:`0 4px 14px ${B.red}66`}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

