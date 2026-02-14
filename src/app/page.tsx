// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

const CATEGORIES = [
  { value: "FURNITURE", label: "Furniture" }, { value: "ELECTRONICS", label: "Electronics" },
  { value: "JEWELRY", label: "Jewelry" }, { value: "ART", label: "Art" },
  { value: "COLLECTIBLES", label: "Collectibles" }, { value: "ANTIQUES", label: "Antiques" },
  { value: "TOOLS", label: "Tools" }, { value: "WATCHES", label: "Watches" },
  { value: "HOME_DECOR", label: "Home Decor" }, { value: "OTHER", label: "Other" },
];

const CONDITIONS = [
  { value: "NEW", label: "New" }, { value: "LIKE_NEW", label: "Like New" },
  { value: "EXCELLENT", label: "Excellent" }, { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" }, { value: "POOR", label: "Poor" },
];

const SOURCES = [
  { value: "DIRECT", label: "Look4it", color: "#612950" },
  { value: "HIBID", label: "HiBid", color: "#A0522D" },
  { value: "AUCTION_NINJA", label: "Auction Ninja", color: "#5B3A6B" },
  { value: "ESTATESALES_NET", label: "EstateSales.net", color: "#4A7C6F" },
  { value: "EBAY", label: "eBay", color: "#8B4513" },
];


const fmt = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const srcInfo = (s) => SOURCES.find(x=>x.value===s)||SOURCES[0];

const S = {
  font: "'Libre Franklin', Georgia, serif",
  serif: "'Playfair Display', Georgia, serif",
  mono: "'DM Mono', 'Courier New', monospace",
  bg: "#1A1820",
  bgLight: "#21202A",
  cream: "#2A2832",
  accent: "#612950",
  accentLight: "#7A3568",
  accentPale: "rgba(97,41,80,0.15)",
  gold: "#EDE5D0",
  goldDim: "#C5C2C8",
  card: "rgba(42,40,50,0.8)",
  border: "rgba(197,194,200,0.12)",
  borderHover: "rgba(97,41,80,0.4)",
  text: "#EDE5D0",
  textLight: "#F5F0E3",
  muted: "#B5B3B8",
  dim: "#8A8890",
};

const Svg = ({d,size=20,fill="none",stroke="currentColor"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
const SearchIco = ({s=18})=><Svg size={s} d="M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.3-4.3"/>;
const HeartIco = ({s=16,f=false})=><svg width={s} height={s} viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const LockIco = ({s=12})=><Svg size={s} d="M7 11V7a5 5 0 0110 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"/>;
const EyeIco = ({s=12})=><Svg size={s} d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z"/>;
const FlagIco = ({s=14})=><Svg size={s} d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V15"/>;
const XIco = ({s=16})=><Svg size={s} d="M18 6L6 18M6 6l12 12"/>;
const ArrowIco = ({s=18})=><Svg size={s} d="M19 12H5M12 19l-7-7 7-7"/>;
const BellIco = ({s=18})=><Svg size={s} d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0"/>;
const UserIco = ({s=16})=><Svg size={s} d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z"/>;
const CamIco = ({s=28})=><Svg size={s} d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3zM12 10a3 3 0 100 6 3 3 0 000-6z"/>;
const SparkIco = ({s=14})=><Svg size={s} d="M12 3l-1.9 5.8a2 2 0 01-1.3 1.3L3 12l5.8 1.9a2 2 0 011.3 1.3L12 21l1.9-5.8a2 2 0 011.3-1.3L21 12l-5.8-1.9a2 2 0 01-1.3-1.3L12 3z"/>;
const MapIco = ({s=14})=><Svg size={s} d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7a3 3 0 100 6 3 3 0 000-6z"/>;
const BotIco = ({s=14})=><Svg size={s} d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7v3a2 2 0 01-2 2h-1v1a2 2 0 01-2 2H8a2 2 0 01-2-2v-1H5a2 2 0 01-2-2v-3a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM9.5 14a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>;

const Overlay = ({children, onClose}: {children: React.ReactNode, onClose: ()=>void}) => (
  <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(10px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
    <div onClick={e=>e.stopPropagation()} style={{ background:S.bgLight, border:"1px solid " + S.border, borderRadius:14, padding:30, maxWidth:440, width:"100%", position:"relative" }}>
      <button onClick={onClose} style={{ position:"absolute", top:14, right:14, background:"none", border:"none", color:S.dim, cursor:"pointer" }}><XIco/></button>
      {children}
    </div>
  </div>
);

export default function Look4it() {
  const [view, setView] = useState("home");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fil, setFil] = useState({cat:"",cond:"",src:"",min:"",max:"",sort:"newest"});
  const [showFil, setShowFil] = useState(false);
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated";
  const [favs, setFavs] = useState(new Set());
  const [favItems, setFavItems] = useState<any[]>([]);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [offerAmt, setOfferAmt] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [flagReason, setFlagReason] = useState("SCAM");
  const [flagDesc, setFlagDesc] = useState("");
  const [authTab, setAuthTab] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authZip, setAuthZip] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createImages, setCreateImages] = useState<string[]>([]);
  const [createAnalyzing, setCreateAnalyzing] = useState(false);
  const [createDragOver, setCreateDragOver] = useState(false);
  const [createData, setCreateData] = useState({title:"",desc:"",cat:"OTHER",cond:"GOOD",priceLow:"",priceHigh:"",quantity:"1",lot:"",cosigner:"",loc:"Detroit Metro, MI"});
  const createFileRef = useRef<HTMLInputElement>(null);
  const [wantList, setWantList] = useState([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsCurrentPw, setSettingsCurrentPw] = useState("");
  const [settingsNewPw, setSettingsNewPw] = useState("");
  const [settingsConfirmPw, setSettingsConfirmPw] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const userMenuRef = useRef(null);

  const [rawResults, setRawResults] = useState<any[]>([]);

  // Fetch results from API when search query changes
  useEffect(() => {
    if (!searchQ) { setRawResults([]); setResults([]); return; }
    let cancelled = false;
    const doSearch = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQ)}`);
        const data = await res.json();
        if (!cancelled && data.success) setRawResults(data.data.results);
      } catch { if (!cancelled) setRawResults([]); }
      finally { if (!cancelled) setLoading(false); }
    };
    doSearch();
    return () => { cancelled = true; };
  }, [searchQ]);

  // Apply client-side filters
  useEffect(() => {
    let r = [...rawResults];
    if(fil.cat) r=r.filter(l=>l.category===fil.cat);
    if(fil.cond) r=r.filter(l=>l.condition===fil.cond);
    if(fil.src) r=r.filter(l=>l.source===fil.src);
    if(fil.min) r=r.filter(l=>l.price>=+fil.min);
    if(fil.max) r=r.filter(l=>l.price<=+fil.max);
    if(fil.sort==="price_asc") r.sort((a,b)=>a.price-b.price);
    else if(fil.sort==="price_desc") r.sort((a,b)=>b.price-a.price);
    else r.sort((a,b)=>new Date(b.time).getTime()-new Date(a.time).getTime());
    setResults(r);
  }, [rawResults, fil]);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    };
    if (showUserMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserMenu]);

  // Sync settings name from session
  useEffect(() => {
    if (session?.user?.name) setSettingsName(session.user.name);
  }, [session?.user?.name]);

  // Load want list from DB on login
  useEffect(() => {
    if (loggedIn) {
      fetch("/api/want-list").then(r => r.json()).then(data => {
        if (data.success && data.data) {
          setWantList(data.data.map((w: any) => ({ id: w.id, query: w.query, createdAt: w.createdAt, results: 0 })));
        }
      }).catch(() => {});
    }
  }, [loggedIn]);

  // Load favorites from DB on login
  useEffect(() => {
    if (loggedIn) {
      fetch("/api/favorites").then(r => r.json()).then(data => {
        if (data.success && data.data) {
          setFavs(new Set(data.data.map((f: any) => f.itemId)));
          setFavItems(data.data.map((f: any) => f.item));
        }
      }).catch(() => {});
    } else {
      setFavs(new Set());
      setFavItems([]);
    }
  }, [loggedIn]);

  // Auto-add searches to want list / dashboard
  useEffect(() => {
    if(searchQ && searchQ.length >= 3) {
      const exists = wantList.some(w => w.query.toLowerCase() === searchQ.toLowerCase());
      if (exists) return;
      if (loggedIn) {
        fetch("/api/want-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: searchQ }) })
          .then(r => r.json())
          .then(data => {
            if (data.success && data.data) {
              setWantList(prev => {
                if (prev.some(w => w.query.toLowerCase() === searchQ.toLowerCase())) return prev;
                return [{ id: data.data.id, query: data.data.query, createdAt: data.data.createdAt, results: results.length }, ...prev].slice(0, 20);
              });
            }
          }).catch(() => {});
      } else {
        setWantList(prev => {
          if (prev.some(w => w.query.toLowerCase() === searchQ.toLowerCase())) return prev;
          return [{ id: null, query: searchQ, createdAt: new Date().toISOString(), results: results.length }, ...prev].slice(0, 20);
        });
      }
    }
  }, [searchQ]);

  const handleCameraSearch = () => { fileInputRef.current?.click(); };
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if(file) {
      notify("Analyzing image... AI is identifying the item");
      setTimeout(() => { setQ("antique brass"); setSearchQ("antique brass"); notify("Found: Antique Brass item - showing results"); }, 2000);
    }
  };

  const resetAuthForm = () => { setAuthEmail(""); setAuthPassword(""); setAuthName(""); setAuthZip(""); setAuthError(""); };

  const handleAuthSubmit = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authTab === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: authName, email: authEmail, password: authPassword, zipCode: authZip || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAuthError(data.error || "Signup failed");
          setAuthLoading(false);
          return;
        }
        // Auto-login after signup
        const signInRes = await signIn("credentials", { redirect: false, email: authEmail, password: authPassword });
        if (signInRes?.error) {
          setAuthError("Account created but auto-login failed. Please sign in.");
          setAuthLoading(false);
          return;
        }
      } else {
        const res = await signIn("credentials", { redirect: false, email: authEmail, password: authPassword });
        if (res?.error) {
          setAuthError("Invalid email or password");
          setAuthLoading(false);
          return;
        }
      }
      resetAuthForm();
      setModal(null);
      notify("Welcome to Look4it!");
    } catch {
      setAuthError("Something went wrong. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const notify = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const togFav = (item, e) => {
    e?.stopPropagation();
    const id = typeof item === "string" ? item : item.id;
    const isFav = favs.has(id);

    // Optimistic update
    setFavs(p => { const n = new Set(p); if (isFav) n.delete(id); else n.add(id); return n; });
    if (isFav) {
      setFavItems(p => p.filter(f => f.id !== id));
      notify("Removed from favorites");
    } else {
      const fullItem = typeof item === "object" ? item : (results.find(r => r.id === id) || sel);
      if (fullItem) setFavItems(p => [fullItem, ...p]);
      notify("Added to favorites");
    }

    // Persist if logged in
    if (loggedIn) {
      if (isFav) {
        fetch("/api/favorites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: id }) }).catch(() => {});
      } else {
        const fullItem = typeof item === "object" ? item : (results.find(r => r.id === id) || sel);
        if (fullItem) fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: id, item: fullItem }) }).catch(() => {});
      }
    }
  };

  const btn = (primary=false) => ({
    background: primary ? "linear-gradient(135deg, #612950, #4A1E3C)" : "rgba(197,194,200,0.08)",
    border: primary ? "1px solid rgba(155,61,75,0.3)" : "1px solid " + S.border,
    color: primary ? "#F5F0E3" : S.muted,
    padding: "10px 20px", borderRadius: 8, cursor: "pointer",
    fontFamily: S.font, fontSize: 13, fontWeight: 500, transition: "all 0.25s ease",
    display: "inline-flex", alignItems: "center", gap: 6, letterSpacing: "0.02em",
  });
  const inp = { background:"rgba(197,194,200,0.06)", border:"1px solid " + S.border, color:S.text, padding:"10px 14px", borderRadius:8, fontSize:14, fontFamily:S.font, width:"100%", boxSizing:"border-box", outline:"none", transition:"border-color 0.2s" };
  const lbl = { display:"block", color:S.goldDim, fontSize:10, fontWeight:600, marginBottom:6, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1.5px" };

  const Header = () => (
    <header style={{ position:"sticky", top:0, zIndex:50, background:"rgba(26,24,32,0.95)", backdropFilter:"blur(20px)", borderBottom:"1px solid " + S.border, padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:28 }}>
        <button onClick={()=>{setView("home");setSel(null);}} style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}>
          <span style={{ fontFamily:S.serif, fontSize:24, fontWeight:700, color:S.gold, letterSpacing:"-0.02em" }}>{"Look"}<span style={{color:S.accent}}>{"4"}</span>{"it"}</span>
        </button>
        <nav style={{ display:"flex", gap:2 }}>
          {[["home","Browse"],["create","Sell"],["dashboard","Dashboard"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{ background:view===v?S.accentPale:"transparent", border:view===v?"1px solid rgba(97,41,80,0.25)":"1px solid transparent", color:view===v?S.accentLight:S.dim, padding:"6px 16px", borderRadius:6, cursor:"pointer", fontFamily:S.font, fontSize:12, fontWeight:500, letterSpacing:"0.03em", transition:"all 0.2s" }}>{l}</button>
          ))}
        </nav>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button style={{ background:"transparent", border:"1px solid " + S.border, color:S.dim, width:36, height:36, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
          <BellIco/><div style={{ position:"absolute", top:-2, right:-2, width:7, height:7, background:S.accent, borderRadius:"50%", border:"2px solid " + S.bg }}/>
        </button>
        <div ref={userMenuRef} style={{ position:"relative" }}>
          <button onClick={()=>loggedIn?setShowUserMenu(!showUserMenu):setModal("auth")} style={{ ...btn(true), padding:"8px 16px" }}>
            <UserIco s={14}/>{loggedIn?(session?.user?.name||"Account"):"Sign In"}
          </button>
          {showUserMenu && loggedIn && (
            <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, width:240, background:S.bgLight, border:"1px solid " + S.border, borderRadius:10, boxShadow:"0 12px 40px rgba(0,0,0,0.5)", zIndex:60, overflow:"hidden" }}>
              <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid " + S.border }}>
                <div style={{ color:S.textLight, fontSize:14, fontWeight:600, fontFamily:S.font }}>{session?.user?.name || "User"}</div>
                <div style={{ color:S.dim, fontSize:11, fontFamily:S.font, marginTop:2 }}>{session?.user?.email}</div>
              </div>
              <div style={{ padding:6 }}>
                {[["Dashboard","dashboard"],["Settings","settings"]].map(([label,v])=>(
                  <button key={v} onClick={()=>{setView(v);setShowUserMenu(false);}} style={{ display:"block", width:"100%", textAlign:"left", background:"transparent", border:"none", color:S.text, padding:"10px 12px", borderRadius:6, cursor:"pointer", fontFamily:S.font, fontSize:13, transition:"background 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.background=S.accentPale} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{label}</button>
                ))}
              </div>
              <div style={{ borderTop:"1px solid " + S.border, padding:6 }}>
                <button onClick={()=>{signOut({redirect:false});setShowUserMenu(false);}} style={{ display:"block", width:"100%", textAlign:"left", background:"transparent", border:"none", color:S.accent, padding:"10px 12px", borderRadius:6, cursor:"pointer", fontFamily:S.font, fontSize:13, transition:"background 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=S.accentPale} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{"Sign Out"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  const Card = ({l}) => {
    const ext = l.source!=="DIRECT";
    const cardFee = ((l.price > 0 ? l.price : l.appraised) || 0) * 0.1;
    return (
      <div onClick={()=>{setSel(l);setView("listing");}} style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, overflow:"hidden", cursor:"pointer", transition:"all 0.3s ease" }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=S.borderHover;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(0,0,0,0.3)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=S.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
        <div style={{ position:"relative", paddingTop:"72%", background:S.bgLight }}>
          <img src={l.img} alt={l.title} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.opacity=0.3}/>
          {ext ? (
            <div style={{ position:"absolute", top:8, left:8, background:S.accent, color:"#F5F0E3", padding:"3px 10px", borderRadius:4, fontSize:9, fontWeight:600, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1px", display:"flex", alignItems:"center", gap:4 }}><LockIco s={10}/>{"Source Hidden"}</div>
          ) : (
            <div style={{ position:"absolute", top:8, left:8, background:SOURCES[0].color, color:"#F5F0E3", padding:"3px 10px", borderRadius:4, fontSize:9, fontWeight:600, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1px" }}>{"Look4it"}</div>
          )}
          <button onClick={e=>togFav(l,e)} style={{ position:"absolute", top:8, right:8, background:"rgba(26,24,32,0.6)", border:"none", width:30, height:30, borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:favs.has(l.id)?S.accent:S.text, backdropFilter:"blur(8px)" }}>
            <HeartIco s={14} f={favs.has(l.id)}/>
          </button>
          {ext && <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(26,24,32,0.8)", backdropFilter:"blur(8px)", padding:"3px 10px", borderRadius:4, display:"flex", alignItems:"center", gap:4, color:S.gold, fontSize:9, fontWeight:600, fontFamily:S.font, letterSpacing:"0.5px" }}><LockIco/>{fmt(cardFee)}{" to unlock"}</div>}
        </div>
        <div style={{ padding:16 }}>
          <h3 style={{ color:S.textLight, fontSize:13, fontWeight:600, fontFamily:S.font, margin:0, lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{l.title}</h3>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:12 }}>
            <div>
              <div style={{ color:S.gold, fontSize:18, fontWeight:700, fontFamily:S.mono }}>{l.price > 0 ? fmt(l.price) : "See listing"}</div>
              {l.appraised && <div style={{ color:S.dim, fontSize:10, fontFamily:S.font, marginTop:2 }}>{"Appraised: "}{fmt(l.appraised)}</div>}
            </div>
            <div style={{ textAlign:"right" }}>
              {l.loc && <div style={{ color:S.dim, fontSize:10, fontFamily:S.font }}>{l.loc}</div>}
              {l.views > 0 && <div style={{ color:S.dim, fontSize:9, display:"flex", alignItems:"center", gap:3, justifyContent:"flex-end", marginTop:3 }}><EyeIco/>{l.views}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const Sel = ({label,value,onChange,options,all="All"}) => (
    <div>
      <label style={lbl}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{...inp, padding:"8px 12px", fontSize:12}}>
        <option value="">{all}</option>
        {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );

  const Home = () => (
    <div>
      <div style={{ padding:"52px 20px 32px", textAlign:"center", background:"radial-gradient(ellipse at 50% 0%, rgba(97,41,80,0.08) 0%, transparent 70%)" }}>
        <h1 style={{ fontFamily:S.serif, fontSize:42, fontWeight:700, color:S.textLight, margin:"0 0 8px", lineHeight:1.1, letterSpacing:"-0.02em" }}>
          {"Look"}<span style={{color:S.accent}}>{"4"}</span>{"it. Find it."}
        </h1>
        <p style={{ fontFamily:S.font, fontSize:15, color:S.muted, margin:"0 0 32px", letterSpacing:"0.01em" }}>
          {"The search engine for estate sales, auctions, and secondhand treasures across Metro Detroit."}
        </p>
        <div style={{ maxWidth:700, margin:"0 auto" }}>
          <div style={{ display:"flex", gap:6, background:S.cream, border:"1px solid " + S.border, borderRadius:10, padding:5, alignItems:"center" }}>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"0 12px" }}>
              <SearchIco/>
              <input placeholder="Look4it..." value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")setSearchQ(q)}}
                style={{ background:"transparent", border:"none", outline:"none", color:S.textLight, fontSize:15, fontFamily:S.font, width:"100%", padding:"10px 0", letterSpacing:"0.01em" }}/>
              {q && <button onClick={()=>{setQ("");setSearchQ("")}} style={{ background:"rgba(197,194,200,0.1)", border:"none", width:24, height:24, borderRadius:5, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:S.muted, flexShrink:0 }}><XIco s={12}/></button>}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleImageUpload}/>
            <button onClick={handleCameraSearch} title="Search by image" style={{ background:S.accentPale, border:"1px solid rgba(97,41,80,0.2)", color:S.accentLight, width:40, height:40, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.2s" }}>
              <CamIco s={18}/>
            </button>
            <button onClick={()=>setShowFil(!showFil)} style={{ background:showFil?S.accent:S.accentPale, border:"1px solid rgba(97,41,80,0.25)", color:showFil?S.textLight:S.accentLight, padding:"8px 18px", borderRadius:8, cursor:"pointer", fontFamily:S.font, fontSize:12, fontWeight:600, letterSpacing:"0.05em", flexShrink:0, transition:"all 0.2s" }}>{"Filters"}</button>
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:14, flexWrap:"wrap" }}>
            {SOURCES.map(s=><div key={s.value} style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:8, height:8, borderRadius:2, background:s.color }}/><span style={{ color:S.dim, fontSize:11, fontFamily:S.font }}>{s.label}</span></div>)}
          </div>
        </div>
        {showFil && (
          <div style={{ maxWidth:700, margin:"12px auto 0" }}>
            <div style={{ background:S.cream, border:"1px solid " + S.border, borderRadius:10, padding:18, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:12, textAlign:"left" }}>
              <Sel label="Category" value={fil.cat} onChange={v=>setFil({...fil,cat:v})} options={CATEGORIES}/>
              <Sel label="Condition" value={fil.cond} onChange={v=>setFil({...fil,cond:v})} options={CONDITIONS}/>
              <Sel label="Source" value={fil.src} onChange={v=>setFil({...fil,src:v})} options={SOURCES} all="All Sources"/>
              <div><label style={lbl}>{"Min Price"}</label><input type="number" placeholder="$0" value={fil.min} onChange={e=>setFil({...fil,min:e.target.value})} style={{...inp,padding:"8px 12px",fontSize:12}}/></div>
              <div><label style={lbl}>{"Max Price"}</label><input type="number" placeholder="No max" value={fil.max} onChange={e=>setFil({...fil,max:e.target.value})} style={{...inp,padding:"8px 12px",fontSize:12}}/></div>
              <Sel label="Sort" value={fil.sort} onChange={v=>setFil({...fil,sort:v})} options={[{value:"newest",label:"Newest"},{value:"price_asc",label:"Price: Low-High"},{value:"price_desc",label:"Price: High-Low"}]} all="Newest"/>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:"24px 24px 48px", maxWidth:1120, margin:"0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ color:S.dim, fontSize:12, fontFamily:S.font, letterSpacing:"0.03em" }}>{results.length}{" results"}{q && <>{" for \""}<span style={{color:S.gold}}>{q}</span>{"\""}</>}</span>
        </div>
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:S.dim, fontFamily:S.font }}>
            <div style={{ width:40, height:40, border:"3px solid " + S.border, borderTopColor:S.accent, borderRadius:"50%", margin:"0 auto 16px", animation:"spin 0.8s linear infinite" }}/>
            <p style={{ fontSize:15, color:S.muted }}>{"Searching eBay, HiBid, Auction Ninja, EstateSales.net..."}</p>
            <p style={{ fontSize:12, color:S.dim, marginTop:6 }}>{"Fetching real-time results from multiple platforms"}</p>
          </div>
        ) : results.length===0 ? (
          <div style={{ textAlign:"center", padding:60, color:S.dim, fontFamily:S.font }}>
            <SearchIco s={40}/><p style={{marginTop:16,fontSize:16}}>{searchQ ? "No items found" : "Search to discover items"}</p><p style={{fontSize:13,color:S.dim}}>{searchQ ? "Try different search terms or adjust your filters" : "Enter a search term above to find estate sales, auctions, and secondhand treasures"}</p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:18 }}>
            {results.map(l=><Card key={l.id} l={l}/>)}
          </div>
        )}
      </div>
    </div>
  );

  const Detail = () => {
    if(!sel) return null;
    const ext = sel.source!=="DIRECT";
    const fee = ((sel.price > 0 ? sel.price : sel.appraised) || 0) * 0.1;
    return (
      <div style={{ maxWidth:920, margin:"0 auto", padding:"28px 24px 48px" }}>
        <button onClick={()=>{setView("home");setSel(null);}} style={{ ...btn(), marginBottom:24, padding:"8px 16px", fontSize:12 }}><ArrowIco/>{"Back to results"}</button>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:28 }}>
          <div style={{ borderRadius:10, overflow:"hidden", background:S.bgLight, position:"relative" }}>
            <img src={sel.img} alt={sel.title} style={{ width:"100%", aspectRatio:"4/3", objectFit:"cover" }} onError={e=>e.target.style.opacity=0.3}/>
            {ext ? (
              <div style={{ position:"absolute", top:14, left:14, background:S.accent, color:"#F5F0E3", padding:"4px 12px", borderRadius:5, fontSize:10, fontWeight:600, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1px", display:"flex", alignItems:"center", gap:5 }}><LockIco s={11}/>{"Source Hidden"}</div>
            ) : (
              <div style={{ position:"absolute", top:14, left:14, background:SOURCES[0].color, color:"#F5F0E3", padding:"4px 12px", borderRadius:5, fontSize:10, fontWeight:600, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1px" }}>{"Look4it"}</div>
            )}
          </div>
          <div>
            <h1 style={{ fontFamily:S.serif, fontSize:26, fontWeight:700, color:S.textLight, margin:"0 0 10px", lineHeight:1.3, letterSpacing:"-0.01em" }}>{sel.title}</h1>
            <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" }}>
              {CATEGORIES.find(c=>c.value===sel.category) && <span style={{ background:"rgba(197,194,200,0.08)", color:S.muted, padding:"4px 12px", borderRadius:5, fontSize:11, fontFamily:S.font }}>{CATEGORIES.find(c=>c.value===sel.category)?.label}</span>}
              {CONDITIONS.find(c=>c.value===sel.condition) && <span style={{ background:"rgba(197,194,200,0.08)", color:S.muted, padding:"4px 12px", borderRadius:5, fontSize:11, fontFamily:S.font }}>{CONDITIONS.find(c=>c.value===sel.condition)?.label}</span>}
              {sel.views > 0 && <span style={{ color:S.dim, fontSize:11, fontFamily:S.font, display:"flex", alignItems:"center", gap:4 }}><EyeIco/>{sel.views}{" views"}</span>}
            </div>
            <div style={{ background:S.accentPale, border:"1px solid rgba(97,41,80,0.2)", borderRadius:10, padding:22, marginBottom:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ color:S.muted, fontSize:10, fontFamily:S.font, marginBottom:4, textTransform:"uppercase", letterSpacing:"1px" }}>{sel.price > 0 ? "Asking Price" : "Price"}</div>
                  <div style={{ color:S.gold, fontSize:30, fontWeight:700, fontFamily:S.mono }}>{sel.price > 0 ? fmt(sel.price) : "See listing"}</div>
                </div>
                {sel.appraised && (
                  <div style={{ textAlign:"right" }}>
                    <div style={{ color:S.muted, fontSize:10, fontFamily:S.font, marginBottom:4, display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", textTransform:"uppercase", letterSpacing:"1px" }}><SparkIco/>{"AI Appraised"}</div>
                    <div style={{ color:S.textLight, fontSize:22, fontWeight:600, fontFamily:S.mono }}>{fmt(sel.appraised)}</div>
                    <div style={{ color:S.dim, fontSize:11, fontFamily:S.font, marginTop:3 }}>{"Range: "}{fmt(sel.low)}{" - "}{fmt(sel.high)}</div>
                  </div>
                )}
              </div>
            </div>
            {ext ? (
              <div style={{ background:S.cream, border:"1px solid " + S.border, borderRadius:10, padding:18, marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  <LockIco s={14}/><span style={{ color:S.gold, fontSize:13, fontWeight:600, fontFamily:S.font }}>{"Finder's Fee Required"}</span>
                </div>
                <p style={{ color:S.muted, fontSize:12, fontFamily:S.font, margin:"0 0 14px", lineHeight:1.6 }}>
                  {"We found this listing on an external platform. Pay a finder's fee of "}<strong style={{color:S.gold}}>{fmt(fee)}</strong>{" (10% of "}{sel.price > 0 ? "listed price" : "AI appraised value"}{") to reveal where it's listed and get a direct link to purchase."}
                </p>
                <button onClick={()=>loggedIn?notify("Redirecting to Stripe checkout..."):setModal("auth")} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"13px 20px", fontSize:14 }}>
                  <LockIco s={14}/>{"Unlock Source for "}{fmt(fee)}
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", gap:10, marginBottom:18 }}>
                <button onClick={()=>loggedIn?notify("Redirecting to Stripe checkout..."):setModal("auth")} style={{ ...btn(true), flex:1, justifyContent:"center", padding:"13px 20px", fontSize:14 }}>
                  {"Buy Now - "}{fmt(sel.price)}
                </button>
                <button onClick={()=>loggedIn?setModal("offer"):setModal("auth")} style={{ ...btn(), flex:1, justifyContent:"center", padding:"13px 20px", fontSize:14, color:S.gold, borderColor:"rgba(197,194,200,0.2)" }}>
                  {"Make Offer"}
                </button>
              </div>
            )}
            <div style={{ marginBottom:18 }}>
              <h3 style={{ color:S.goldDim, fontSize:10, fontWeight:600, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1.5px", margin:"0 0 8px" }}>{"Description"}</h3>
              <p style={{ color:S.muted, fontSize:13, fontFamily:S.font, lineHeight:1.8, margin:0 }}>{sel.desc}</p>
            </div>
            {sel.tags?.length > 0 && <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:18 }}>
              {sel.tags.map(t=><span key={t} style={{ background:"rgba(197,194,200,0.06)", border:"1px solid " + S.border, color:S.dim, padding:"4px 12px", borderRadius:5, fontSize:11, fontFamily:S.font }}>{"#"}{t}</span>)}
            </div>}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:18, borderTop:"1px solid " + S.border }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:8, background:S.accentPale, display:"flex", alignItems:"center", justifyContent:"center", color:S.accentLight }}>{ext ? <LockIco s={15}/> : <UserIco s={15}/>}</div>
                <div>
                  <div style={{ color:S.text, fontSize:13, fontWeight:600, fontFamily:S.font }}>{ext ? "Seller Hidden" : sel.seller}</div>
                  <div style={{ color:S.dim, fontSize:11, fontFamily:S.font }}>{ext ? "Unlock to reveal seller & platform" : sel.loc}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={(e)=>togFav(sel,e)} style={{ ...btn(), padding:"8px 14px", color:favs.has(sel.id)?S.accent:S.muted }}>
                  <HeartIco s={14} f={favs.has(sel.id)}/>{favs.has(sel.id)?"Saved":"Save"}
                </button>
                <button onClick={()=>loggedIn?setModal("flag"):setModal("auth")} style={{ ...btn(), padding:"8px 14px", color:S.muted }}>
                  <FlagIco/>{"Report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleCreateFiles = async (files: FileList | File[]) => {
    const fileArr = Array.from(files).slice(0, 10 - createImages.length);
    if (fileArr.length === 0) return;

    // Convert to base64 and show previews
    const newImages: string[] = [];
    for (const file of fileArr) {
      if (!file.type.startsWith("image/")) continue;
      const b64: string = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });
      newImages.push(b64);
    }

    const allImages = [...createImages, ...newImages];
    setCreateImages(allImages);

    // Resize images for AI analysis (max 800px, keeps payload small)
    const resizeForAI = (dataUrl: string): Promise<string> => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const max = 800;
        let w = img.width, h = img.height;
        if (w > max || h > max) { const r = Math.min(max/w, max/h); w = Math.round(w*r); h = Math.round(h*r); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject(new Error("Failed to load image for resizing"));
      img.src = dataUrl;
    });

    // Run AI analysis on the first image
    console.log("[Look4it] createStep:", createStep, "images:", allImages.length);
    if (createStep === 0) {
      setCreateStep(1);
      setCreateAnalyzing(true);
      try {
        console.log("[Look4it] Resizing image for AI...");
        const smallImg = await resizeForAI(allImages[0]);
        console.log("[Look4it] Resized image size:", Math.round(smallImg.length / 1024), "KB. Sending to API...");
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: [smallImg] }),
        });
        console.log("[Look4it] API response status:", res.status);
        const data = await res.json();
        console.log("[Look4it] API response:", JSON.stringify(data).slice(0, 300));
        if (data.success && data.data) {
          setCreateData(prev => ({
            ...prev,
            title: data.data.title || prev.title,
            desc: data.data.description || prev.desc,
            cat: data.data.category || prev.cat,
            cond: data.data.condition || prev.cond,
            priceLow: data.data.priceLow ? String(data.data.priceLow) : prev.priceLow,
            priceHigh: data.data.priceHigh ? String(data.data.priceHigh) : prev.priceHigh,
          }));
          notify("AI analysis complete!");
        } else {
          console.error("[Look4it] AI failed:", data.error || "Unknown error");
          notify(data.error || "AI analysis failed. You can fill in details manually.");
        }
      } catch (err) {
        console.error("[Look4it] AI error:", err);
        notify("Could not reach AI service. Fill in details manually.");
      } finally {
        setCreateAnalyzing(false);
      }
    } else {
      console.log("[Look4it] Skipping AI — createStep is already", createStep);
    }
  };

  const removeCreateImage = (idx: number) => {
    setCreateImages(prev => prev.filter((_, i) => i !== idx));
  };

  const resetCreate = () => {
    setCreateStep(0);
    setCreateImages([]);
    setCreateData({title:"",desc:"",cat:"OTHER",cond:"GOOD",priceLow:"",priceHigh:"",quantity:"1",lot:"",cosigner:"",loc:"Detroit Metro, MI"});
  };

  const Create = () => (
    <div style={{ maxWidth:720, margin:"0 auto", padding:"36px 24px 48px" }}>
      <h1 style={{ fontFamily:S.serif, fontSize:30, fontWeight:700, color:S.textLight, margin:"0 0 30px", letterSpacing:"-0.02em", textAlign:"center" }}>
        {"Sell on Look"}<span style={{color:S.accent}}>{"4"}</span>{"it"}
      </h1>

      {/* Image Upload Area - always visible */}
      <div
        onDragOver={e=>{e.preventDefault();setCreateDragOver(true);}}
        onDragLeave={()=>setCreateDragOver(false)}
        onDrop={e=>{e.preventDefault();setCreateDragOver(false);handleCreateFiles(e.dataTransfer.files);}}
        onClick={()=>createFileRef.current?.click()}
        style={{ border: createDragOver ? "2px solid " + S.accent : "2px dashed rgba(97,41,80,0.25)", borderRadius:12, padding: createImages.length > 0 ? 16 : 52, textAlign:"center", marginBottom:24, background: createDragOver ? "rgba(97,41,80,0.12)" : S.accentPale, cursor:"pointer", transition:"all 0.2s" }}>
        <input ref={createFileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{if(e.target.files) handleCreateFiles(e.target.files); e.target.value="";}}/>
        {createImages.length === 0 ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <CamIco s={44}/>
            <span style={{ color:S.accentLight, fontSize:16, fontWeight:600, fontFamily:S.font, display:"block", marginTop:14 }}>{"Drop images here or click to browse"}</span>
            <span style={{ color:S.dim, fontSize:12, fontFamily:S.font, display:"block", marginTop:8 }}>{"Up to 10 images. We analyze and generate the listing details."}</span>
          </div>
        ) : (
          <div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", justifyContent:"center" }}>
              {createImages.map((img, i) => (
                <div key={i} style={{ position:"relative", width:100, height:100, borderRadius:8, overflow:"hidden", border:"1px solid " + S.border }}>
                  <img src={img} alt={`Upload ${i+1}`} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                  <button onClick={e=>{e.stopPropagation();removeCreateImage(i);}} style={{ position:"absolute", top:4, right:4, background:"rgba(26,24,32,0.8)", border:"none", width:20, height:20, borderRadius:4, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:S.muted }}>
                    <XIco s={10}/>
                  </button>
                </div>
              ))}
              {createImages.length < 10 && (
                <div style={{ width:100, height:100, borderRadius:8, border:"1px dashed " + S.border, display:"flex", alignItems:"center", justifyContent:"center", color:S.dim }}>
                  <CamIco s={24}/>
                </div>
              )}
            </div>
            <span style={{ color:S.dim, fontSize:11, fontFamily:S.font, display:"block", marginTop:10 }}>{createImages.length}{"/10 images"}</span>
          </div>
        )}
      </div>

      {/* AI Analysis Loading */}
      {createAnalyzing && (
        <div style={{ textAlign:"center", padding:40 }}>
          <div style={{ width:36, height:36, border:"3px solid " + S.border, borderTopColor:S.accent, borderRadius:"50%", margin:"0 auto 14px", animation:"spin 0.8s linear infinite" }}/>
          <p style={{ color:S.muted, fontSize:14, fontFamily:S.font }}>{"AI is analyzing your images..."}</p>
          <p style={{ color:S.dim, fontSize:12, fontFamily:S.font, marginTop:4 }}>{"Generating title, description, and price estimate"}</p>
        </div>
      )}

      {/* Listing Form - after images uploaded */}
      {createStep===1 && !createAnalyzing && (
        <div>
          <div style={{ background:S.accentPale, border:"1px solid rgba(97,41,80,0.2)", borderRadius:8, padding:14, marginBottom:22, display:"flex", alignItems:"center", gap:8 }}>
            <SparkIco/><span style={{ color:S.accentLight, fontSize:12, fontWeight:600, fontFamily:S.font }}>{createData.title ? "AI-generated listing - review and edit below" : "Fill in your listing details below"}</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <div><label style={lbl}>{"Title"}</label><input value={createData.title} onChange={e=>setCreateData({...createData,title:e.target.value})} placeholder="e.g. Hand-Painted Glass Santa Claus Ornament" style={inp}/></div>
            <div><label style={lbl}>{"Description"}</label><textarea value={createData.desc} onChange={e=>setCreateData({...createData,desc:e.target.value})} rows={5} placeholder="Detailed description of the item, condition, dimensions, etc." style={{...inp, resize:"vertical"}}/></div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <Sel label="Category" value={createData.cat} onChange={v=>setCreateData({...createData,cat:v})} options={CATEGORIES} all="Select"/>
              <Sel label="Condition" value={createData.cond} onChange={v=>setCreateData({...createData,cond:v})} options={CONDITIONS} all="Select"/>
            </div>

            {/* Price Estimate */}
            <div>
              <label style={lbl}>{"Price Estimate"}</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center" }}>
                <input type="number" value={createData.priceLow} onChange={e=>setCreateData({...createData,priceLow:e.target.value})} placeholder="$Low" style={inp}/>
                <span style={{ color:S.dim, fontSize:12, fontFamily:S.font }}>{"to"}</span>
                <input type="number" value={createData.priceHigh} onChange={e=>setCreateData({...createData,priceHigh:e.target.value})} placeholder="$High" style={inp}/>
              </div>
              {(createData.priceLow || createData.priceHigh) && (
                <div style={{ background:S.cream, border:"1px solid " + S.border, borderRadius:8, padding:12, marginTop:10, display:"flex", alignItems:"center", gap:8 }}>
                  <SparkIco/>
                  <span style={{ color:S.gold, fontSize:13, fontWeight:600, fontFamily:S.mono }}>
                    {createData.priceLow && createData.priceHigh ? `${fmt(+createData.priceLow)} - ${fmt(+createData.priceHigh)}` : createData.priceLow ? `From ${fmt(+createData.priceLow)}` : `Up to ${fmt(+createData.priceHigh)}`}
                  </span>
                  <span style={{ color:S.dim, fontSize:11, fontFamily:S.font }}>{"estimated value"}</span>
                </div>
              )}
            </div>

            {/* Seller's Fee Breakdown */}
            {(createData.priceLow || createData.priceHigh) && (() => {
              const isPro = (session?.user as any)?.subscriptionTier === "PRO";
              const feeRate = isPro ? 0.05 : 0.20;
              const feeLabel = isPro ? "5% Pro" : "20%";
              const midPrice = createData.priceLow && createData.priceHigh ? (+createData.priceLow + +createData.priceHigh) / 2 : +(createData.priceHigh || createData.priceLow);
              const feeAmt = midPrice * feeRate;
              const payout = midPrice - feeAmt;
              return (
                <div style={{ background:"rgba(90,140,120,0.06)", border:"1px solid rgba(90,140,120,0.15)", borderRadius:8, padding:16 }}>
                  <div style={{ color:S.goldDim, fontSize:10, fontFamily:S.font, marginBottom:10, textTransform:"uppercase", letterSpacing:"1.5px" }}>{"Seller's Fee Breakdown"}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ color:S.muted, fontSize:13, fontFamily:S.font }}>{"Estimated sale price"}</span>
                    <span style={{ color:S.textLight, fontSize:13, fontFamily:S.mono, fontWeight:600 }}>{fmt(midPrice)}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ color:S.muted, fontSize:13, fontFamily:S.font }}>{"Look4it seller's fee ("}{feeLabel}{")"}</span>
                    <span style={{ color:S.accent, fontSize:13, fontFamily:S.mono, fontWeight:600 }}>{"-"}{fmt(feeAmt)}</span>
                  </div>
                  <div style={{ borderTop:"1px solid " + S.border, paddingTop:8, marginTop:4, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:S.textLight, fontSize:14, fontWeight:600, fontFamily:S.font }}>{"Your payout"}</span>
                    <span style={{ color:S.gold, fontSize:16, fontWeight:700, fontFamily:S.mono }}>{fmt(payout)}</span>
                  </div>
                  {!isPro && (
                    <div style={{ marginTop:10, background:S.accentPale, borderRadius:6, padding:"8px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ color:S.muted, fontSize:11, fontFamily:S.font }}>{"Pro subscribers pay only 5% — save "}{fmt(midPrice * 0.15)}{" on this listing"}</span>
                      <button onClick={()=>notify("Redirecting to subscription checkout...")} style={{ background:"none", border:"1px solid rgba(197,194,200,0.25)", color:S.gold, padding:"4px 12px", borderRadius:5, cursor:"pointer", fontFamily:S.font, fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{"Upgrade"}</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Quantity, Lot#, Cosigner */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14 }}>
              <div><label style={lbl}>{"Quantity"}</label><input type="number" min="1" value={createData.quantity} onChange={e=>setCreateData({...createData,quantity:e.target.value})} style={inp}/></div>
              <div><label style={lbl}>{"Lot #"}</label><input value={createData.lot} onChange={e=>setCreateData({...createData,lot:e.target.value})} placeholder="Optional" style={inp}/></div>
              <div><label style={lbl}>{"Cosigner"}</label><input value={createData.cosigner} onChange={e=>setCreateData({...createData,cosigner:e.target.value})} placeholder="Optional" style={inp}/></div>
            </div>

            <div><label style={lbl}>{"Location"}</label><input value={createData.loc} onChange={e=>setCreateData({...createData,loc:e.target.value})} style={inp}/></div>

            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button onClick={resetCreate} style={{ ...btn(), flex:1, justifyContent:"center" }}>{"Start Over"}</button>
              <button onClick={()=>{notify("Listing published successfully!"); resetCreate(); setView("home");}} style={{ ...btn(true), flex:2, justifyContent:"center", padding:"13px 20px", fontSize:14 }}>
                {"Publish Listing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hint text when no images */}
      {createStep===0 && (
        <div style={{ display:"flex", alignItems:"center", gap:8, color:S.dim, fontSize:12, fontFamily:S.font }}>
          <SparkIco/>{"Drop your images above. We will auto generate a title, description, condition, and a price appraisal automatically."}
        </div>
      )}
    </div>
  );

  const Dashboard = () => (
    <div style={{ maxWidth:820, margin:"0 auto", padding:"36px 24px 48px" }}>
      <h1 style={{ fontFamily:S.serif, fontSize:30, fontWeight:700, color:S.textLight, margin:"0 0 28px", letterSpacing:"-0.02em" }}>{"Dashboard"}</h1>
      {!loggedIn ? (
        <div style={{ textAlign:"center", padding:52, background:S.card, border:"1px solid " + S.border, borderRadius:12 }}>
          <UserIco s={40}/><p style={{ color:S.muted, fontFamily:S.font, fontSize:15, margin:"16px 0" }}>{"Sign in to access your dashboard"}</p>
          <button onClick={()=>setModal("auth")} style={btn(true)}>{"Sign In"}</button>
        </div>
      ) : (
        <div style={{ display:"grid", gap:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            {[["Saved Items",String(favItems.length)],["Searches",String(wantList.length)],["Offers","0"],["Unlocked","0"]].map(([l,v])=>(
              <div key={l} style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:18, textAlign:"center" }}>
                <div style={{ color:S.gold, fontSize:26, fontWeight:700, fontFamily:S.mono }}>{v}</div>
                <div style={{ color:S.dim, fontSize:11, fontFamily:S.font, marginTop:6, textTransform:"uppercase", letterSpacing:"0.5px" }}>{l}</div>
              </div>
            ))}
          </div>
          {favItems.length > 0 && (
            <div style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:22 }}>
              <h3 style={{ color:S.textLight, fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 6px", display:"flex", alignItems:"center", gap:8 }}><HeartIco s={16} f/>{"Saved Items"}</h3>
              <p style={{ color:S.dim, fontSize:11, fontFamily:S.font, margin:"0 0 14px" }}>{"Items you've liked. Click to view details."}</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:12 }}>
                {favItems.slice(0,8).map(l => (
                  <div key={l.id} onClick={()=>{setSel(l);setView("listing");}} style={{ background:S.bgLight, border:"1px solid " + S.border, borderRadius:8, overflow:"hidden", cursor:"pointer", transition:"all 0.2s" }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=S.borderHover;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=S.border;}}>
                    <div style={{ position:"relative", paddingTop:"60%", background:S.bg }}>
                      <img src={l.img} alt={l.title} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.opacity=0.3}/>
                      <button onClick={e=>togFav(l,e)} style={{ position:"absolute", top:6, right:6, background:"rgba(26,24,32,0.6)", border:"none", width:26, height:26, borderRadius:5, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:S.accent, backdropFilter:"blur(8px)" }}>
                        <HeartIco s={12} f/>
                      </button>
                    </div>
                    <div style={{ padding:10 }}>
                      <div style={{ color:S.textLight, fontSize:12, fontWeight:600, fontFamily:S.font, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{l.title}</div>
                      <div style={{ color:S.gold, fontSize:14, fontWeight:700, fontFamily:S.mono, marginTop:6 }}>{l.price > 0 ? fmt(l.price) : (l.appraised ? "~" + fmt(l.appraised) : "See listing")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {wantList.length > 0 && (
            <div style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:22 }}>
              <h3 style={{ color:S.textLight, fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 6px", display:"flex", alignItems:"center", gap:8 }}><SearchIco s={16}/>{"Your Want List"}</h3>
              <p style={{ color:S.dim, fontSize:11, fontFamily:S.font, margin:"0 0 14px" }}>{"Items you search for are automatically tracked here. We will notify you when new matches appear."}</p>
              {wantList.slice(0,8).map((w,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:i<Math.min(wantList.length,8)-1?"1px solid " + S.border:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <SearchIco s={12}/>
                    <span style={{ color:S.text, fontSize:13, fontFamily:S.font }}>{w.query}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ color:S.dim, fontSize:10, fontFamily:S.font }}>{w.results}{" results"}</span>
                    <button onClick={()=>{
                      const item = wantList[i];
                      if (item.id) {
                        fetch("/api/want-list", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }).catch(() => {});
                      }
                      setWantList(prev=>prev.filter((_,idx)=>idx!==i));
                    }} style={{ background:"none", border:"none", color:S.dim, cursor:"pointer", padding:2 }}><XIco s={12}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ background:S.accentPale, border:"1px solid rgba(97,41,80,0.15)", borderRadius:10, padding:22 }}>
            <h3 style={{ color:S.textLight, fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 8px" }}>{"Seller Payment Setup"}</h3>
            <p style={{ color:S.muted, fontSize:13, fontFamily:S.font, margin:"0 0 14px" }}>{"Connect your Stripe account to receive payments from sales."}</p>
            <button onClick={()=>notify("Redirecting to Stripe Connect onboarding...")} style={btn(true)}>{"Set Up Stripe Connect"}</button>
          </div>
          <div style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:22 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <h3 style={{ color:S.textLight, fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 4px" }}>{"Free Plan"}</h3>
                <p style={{ color:S.muted, fontSize:12, fontFamily:S.font, margin:0 }}>{"Upgrade to Pro for unlimited free item unlocks"}</p>
              </div>
              <button onClick={()=>notify("Redirecting to subscription checkout...")} style={{ ...btn(), color:S.gold, borderColor:"rgba(197,194,200,0.2)" }}>{"Upgrade to Pro - $99/mo"}</button>
            </div>
          </div>
          <div style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:22 }}>
            <h3 style={{ color:S.textLight, fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 14px" }}>{"Your Listings"}</h3>
            <div style={{ textAlign:"center", padding:"24px 0", color:S.dim, fontSize:13, fontFamily:S.font }}>
              {"No listings yet. "}<button onClick={()=>setView("create")} style={{ background:"none", border:"none", color:S.accentLight, cursor:"pointer", fontFamily:S.font, fontSize:13, textDecoration:"underline" }}>{"Create your first listing"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const Settings = () => (
    <div style={{ maxWidth:660, margin:"0 auto", padding:"36px 24px 48px" }}>
      <h1 style={{ fontFamily:S.serif, fontSize:30, fontWeight:700, color:S.textLight, margin:"0 0 6px", letterSpacing:"-0.02em" }}>{"Settings"}</h1>
      <p style={{ color:S.muted, fontSize:14, fontFamily:S.font, margin:"0 0 30px" }}>{"Manage your account and preferences."}</p>
      {!loggedIn ? (
        <div style={{ textAlign:"center", padding:52, background:S.card, border:"1px solid " + S.border, borderRadius:12 }}>
          <UserIco s={40}/><p style={{ color:S.muted, fontFamily:S.font, fontSize:15, margin:"16px 0" }}>{"Sign in to access settings"}</p>
          <button onClick={()=>setModal("auth")} style={btn(true)}>{"Sign In"}</button>
        </div>
      ) : (
        <div style={{ display:"grid", gap:22 }}>
          {settingsSuccess && <div style={{ background:"rgba(90,140,120,0.1)", border:"1px solid rgba(90,140,120,0.3)", color:"#7BBF9B", padding:"12px 16px", borderRadius:8, fontSize:13, fontFamily:S.font }}>{settingsSuccess}</div>}
          {settingsError && <div style={{ background:"rgba(200,60,60,0.1)", border:"1px solid rgba(200,60,60,0.3)", color:"#E07070", padding:"12px 16px", borderRadius:8, fontSize:13, fontFamily:S.font }}>{settingsError}</div>}
          <div style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:24 }}>
            <h3 style={{ color:S.textLight, fontSize:16, fontWeight:600, fontFamily:S.font, margin:"0 0 18px" }}>{"Profile"}</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div><label style={lbl}>{"Display Name"}</label><input value={settingsName} onChange={e=>setSettingsName(e.target.value)} style={inp}/></div>
              <div><label style={lbl}>{"Email"}</label><input value={session?.user?.email||""} disabled style={{...inp, opacity:0.5, cursor:"not-allowed"}}/></div>
              <button onClick={async ()=>{
                setSettingsError(""); setSettingsSuccess(""); setSettingsLoading(true);
                try {
                  const res = await fetch("/api/auth/update-profile", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:settingsName}) });
                  const data = await res.json();
                  if(!res.ok) { setSettingsError(data.error||"Failed to update profile"); }
                  else { setSettingsSuccess("Profile updated successfully"); }
                } catch { setSettingsError("Something went wrong"); }
                finally { setSettingsLoading(false); }
              }} disabled={settingsLoading} style={{ ...btn(true), alignSelf:"flex-start", opacity:settingsLoading?0.6:1, cursor:settingsLoading?"not-allowed":"pointer" }}>
                {settingsLoading?"Saving...":"Save Profile"}
              </button>
            </div>
          </div>
          <div style={{ background:S.card, border:"1px solid " + S.border, borderRadius:10, padding:24 }}>
            <h3 style={{ color:S.textLight, fontSize:16, fontWeight:600, fontFamily:S.font, margin:"0 0 18px" }}>{"Change Password"}</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div><label style={lbl}>{"Current Password"}</label><input type="password" placeholder="Enter current password" value={settingsCurrentPw} onChange={e=>setSettingsCurrentPw(e.target.value)} style={inp}/></div>
              <div><label style={lbl}>{"New Password"}</label><input type="password" placeholder="Min 8 characters" value={settingsNewPw} onChange={e=>setSettingsNewPw(e.target.value)} style={inp}/></div>
              <div><label style={lbl}>{"Confirm New Password"}</label><input type="password" placeholder="Confirm new password" value={settingsConfirmPw} onChange={e=>setSettingsConfirmPw(e.target.value)} style={inp}/></div>
              <button onClick={async ()=>{
                setSettingsError(""); setSettingsSuccess("");
                if(settingsNewPw !== settingsConfirmPw) { setSettingsError("New passwords do not match"); return; }
                if(settingsNewPw.length < 8) { setSettingsError("New password must be at least 8 characters"); return; }
                setSettingsLoading(true);
                try {
                  const res = await fetch("/api/auth/change-password", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({currentPassword:settingsCurrentPw, newPassword:settingsNewPw}) });
                  const data = await res.json();
                  if(!res.ok) { setSettingsError(data.error||"Failed to change password"); }
                  else { setSettingsSuccess("Password changed successfully"); setSettingsCurrentPw(""); setSettingsNewPw(""); setSettingsConfirmPw(""); }
                } catch { setSettingsError("Something went wrong"); }
                finally { setSettingsLoading(false); }
              }} disabled={settingsLoading} style={{ ...btn(true), alignSelf:"flex-start", opacity:settingsLoading?0.6:1, cursor:settingsLoading?"not-allowed":"pointer" }}>
                {settingsLoading?"Saving...":"Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Overlay moved outside component to prevent remount/focus loss

  const AuthModal = () => (
    <Overlay onClose={()=>{setModal(null);resetAuthForm();}}>
      <h2 style={{ fontFamily:S.serif, fontSize:24, fontWeight:700, color:S.textLight, margin:"0 0 6px" }}>
        {authTab==="signin"?"Welcome back":"Create account"}
      </h2>
      <p style={{ color:S.dim, fontSize:13, fontFamily:S.font, margin:"0 0 22px" }}>
        {authTab==="signin"?"Sign in to Look4it":"Join the Look4it marketplace"}
      </p>
      <div style={{ display:"flex", gap:4, marginBottom:22, background:S.cream, borderRadius:8, padding:3 }}>
        {["signin","signup"].map(t=>(
          <button key={t} onClick={()=>{setAuthTab(t);setAuthError("");}} style={{ flex:1, background:authTab===t?S.accentPale:"transparent", border:"none", color:authTab===t?S.accentLight:S.dim, padding:"9px", borderRadius:6, cursor:"pointer", fontFamily:S.font, fontSize:12, fontWeight:600 }}>
            {t==="signin"?"Sign In":"Sign Up"}
          </button>
        ))}
      </div>
      {authError && <div style={{ background:"rgba(200,60,60,0.1)", border:"1px solid rgba(200,60,60,0.3)", color:"#E07070", padding:"10px 14px", borderRadius:8, fontSize:12, fontFamily:S.font, marginBottom:14 }}>{authError}</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {authTab==="signup" && <div><label style={lbl}>{"Name"}</label><input placeholder="Your name" value={authName} onChange={e=>setAuthName(e.target.value)} style={inp}/></div>}
        <div><label style={lbl}>{"Email"}</label><input type="email" placeholder="you@email.com" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} style={inp}/></div>
        <div><label style={lbl}>{"Password"}</label><input type="password" placeholder="Min 8 characters" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!authLoading)handleAuthSubmit();}} style={inp}/></div>
        {authTab==="signup" && <div><label style={lbl}>{"ZIP Code (Detroit Metro)"}</label><input placeholder="48XXX" value={authZip} onChange={e=>setAuthZip(e.target.value)} style={inp}/></div>}
        <button onClick={handleAuthSubmit} disabled={authLoading} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"13px", marginTop:4, fontSize:14, opacity:authLoading?0.6:1, cursor:authLoading?"not-allowed":"pointer" }}>
          {authLoading?"Please wait...":(authTab==="signin"?"Sign In":"Create Account")}
        </button>
      </div>
    </Overlay>
  );

  const OfferModal = () => (
    <Overlay onClose={()=>setModal(null)}>
      <h2 style={{ fontFamily:S.serif, fontSize:22, fontWeight:700, color:S.textLight, margin:"0 0 6px" }}>{"Make an Offer"}</h2>
      <p style={{ color:S.dim, fontSize:12, fontFamily:S.font, margin:"0 0 18px" }}>{"on "}{sel?.title}</p>
      <div style={{ background:S.cream, borderRadius:8, padding:14, marginBottom:18, display:"flex", justifyContent:"space-between" }}>
        <div><div style={{ color:S.dim, fontSize:10, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1px" }}>{"Asking"}</div><div style={{ color:S.textLight, fontFamily:S.mono, fontSize:18 }}>{fmt(sel?.price||0)}</div></div>
        <div style={{textAlign:"right"}}><div style={{ color:S.dim, fontSize:10, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"1px" }}>{"Appraised"}</div><div style={{ color:S.gold, fontFamily:S.mono, fontSize:18 }}>{fmt(sel?.appraised||0)}</div></div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div><label style={lbl}>{"Your Offer"}</label><input type="number" placeholder="$0.00" value={offerAmt} onChange={e=>setOfferAmt(e.target.value)} style={inp}/></div>
        <div><label style={lbl}>{"Message (optional)"}</label><textarea placeholder="Tell the seller why..." value={offerMsg} onChange={e=>setOfferMsg(e.target.value)} rows={3} style={{...inp,resize:"vertical"}}/></div>
        <button onClick={()=>{setModal(null);notify("Offer submitted! The seller will be notified.");setOfferAmt("");setOfferMsg("");}} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"13px" }}>
          {"Submit Offer"}
        </button>
      </div>
    </Overlay>
  );

  const FlagModal = () => (
    <Overlay onClose={()=>setModal(null)}>
      <h2 style={{ fontFamily:S.serif, fontSize:22, fontWeight:700, color:S.textLight, margin:"0 0 18px" }}>{"Report Listing"}</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Sel label="Reason" value={flagReason} onChange={setFlagReason} options={[{value:"DUPLICATE",label:"Duplicate"},{value:"SCAM",label:"Scam/Fraud"},{value:"INAPPROPRIATE",label:"Inappropriate"},{value:"MISLEADING",label:"Misleading"},{value:"PROHIBITED_ITEM",label:"Prohibited Item"},{value:"OTHER",label:"Other"}]} all="Select reason"/>
        <div><label style={lbl}>{"Details (optional)"}</label><textarea placeholder="Provide additional context..." value={flagDesc} onChange={e=>setFlagDesc(e.target.value)} rows={3} style={{...inp,resize:"vertical"}}/></div>
        <button onClick={()=>{setModal(null);notify("Report submitted. Our AI will review this listing.");setFlagDesc("");}} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"13px" }}>
          {"Submit Report"}
        </button>
      </div>
    </Overlay>
  );

  const About = () => {
    const pStyle = { color: S.text, fontSize: 15, fontFamily: S.font, lineHeight: "1.85", margin: "0 0 20px" } as const;
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 60px" }}>
        <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: S.accentLight, cursor: "pointer", fontFamily: S.font, fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 28, padding: 0 }}>
          <ArrowIco s={14} />{"Back to Home"}
        </button>

        {/* Hero image */}
        <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 36, position: "relative" }}>
          <img src="/images/robRob-greeting.jpg" alt="Robert McPherson and Robert Channer, founders of Look4it" style={{ width: "100%", height: 400, objectFit: "cover", objectPosition: "center top", display: "block" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(26,24,32,0.9))", padding: "60px 32px 28px" }}>
            <h1 style={{ fontFamily: S.serif, fontSize: 36, fontWeight: 700, color: S.textLight, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              {"Who We Are"}
            </h1>
            <p style={{ color: S.gold, fontSize: 14, fontFamily: S.font, margin: 0, fontWeight: 500 }}>{"Robert McPherson & Robert Channer \u2014 Founders"}</p>
          </div>
        </div>

        {/* Intro paragraphs */}
        <p style={pStyle}>{"Robert McPherson and Robert Channer began working together with a shared dedication to creating value through excellent customer service. Their early business ventures demonstrated their ability to identify opportunities and deliver results, leading them to the stadium and event management industry. Starting with sales and service management at Michigan State University, they quickly recognized the potential to expand their expertise. Their work with NCAA university athletic departments across the country grew, and they soon found themselves managing a large team, recruiting, training, and overseeing hundreds of staff members throughout the southeastern United States."}</p>

        <p style={pStyle}>{"With a strong entrepreneurial spirit, Robert and Robert branched out into real estate, purchasing and renovating distressed properties to bring them back to market. This experience in property transformation naturally led them to develop a passion for the estate sale industry. Over the years, they attended estate sales across the country as avid shoppers, gaining valuable insight into what buyers are seeking and how to price items for success."}</p>

        {/* Estate sale home image - full width break */}
        <div style={{ borderRadius: 14, overflow: "hidden", margin: "36px 0", border: "1px solid " + S.border }}>
          <img src="/images/estate-sale-home.jpg" alt="A Look4it estate sale in southeastern Michigan" style={{ width: "100%", height: 340, objectFit: "cover", display: "block" }} />
          <div style={{ background: S.cream, padding: "14px 20px", borderTop: "1px solid " + S.border }}>
            <p style={{ color: S.muted, fontSize: 12, fontFamily: S.font, margin: 0, fontStyle: "italic" }}>{"A Look4it estate sale in southeastern Michigan"}</p>
          </div>
        </div>

        <p style={pStyle}>{"After years of growing their business, they made the decision to sell their successful company, Game Time Vendors Inc, and embraced a new challenge by purchasing and operating a Dairy Queen franchise in Destin, Florida. Their dedication to outstanding customer service was evident throughout their four years of ownership, as they applied the same principles of value creation and customer care that had driven their earlier successes. However, the call of family and the allure of Michigan\u2019s natural beauty, with its four distinct seasons, ultimately drew them back home."}</p>

        <p style={pStyle}>{"Upon their return to Michigan, Robert and Robert channeled their enthusiasm and passion for the estate sale industry into formalizing Look4it. With their extensive background in customer service and a deep understanding of the estate sale market, they were well-equipped to make a significant impact in this new venture. Their strong connection to Michigan\u2019s automotive history also fueled their appreciation for classic and antique automobiles, adding another layer of expertise to the services they offer."}</p>

        {/* Highlight quote block */}
        <div style={{ background: S.accentPale, border: "1px solid rgba(97,41,80,0.2)", borderLeft: "4px solid " + S.accent, borderRadius: "0 10px 10px 0", padding: "24px 28px", margin: "36px 0" }}>
          <p style={{ color: S.textLight, fontSize: 17, fontFamily: S.serif, fontStyle: "italic", lineHeight: "1.7", margin: 0 }}>
            {"\u201CWe approach each sale with a commitment to traditional customer service values\u2014offering warm greetings, providing personal assistance, and ensuring professional presentation of all items.\u201D"}
          </p>
          <p style={{ color: S.gold, fontSize: 13, fontFamily: S.font, margin: "12px 0 0", fontWeight: 600 }}>{"Robert McPherson & Robert Channer"}</p>
        </div>

        <p style={pStyle}>{"At Look4it, Robert and Robert stay current on market trends through industry associations like the Antiques & Collectibles National Association (ACNA) and leverage extensive resources to accurately evaluate and price items. Their dedication to excellence has earned them glowing reviews, with customers praising their professionalism, attention to detail, and genuine care for both clients and shoppers."}</p>

        <p style={pStyle}>{"When you choose Look4it, you\u2019re selecting a team that understands the intricacies of estate sales, values transparency and fairness, and is passionate about bringing forgotten treasures back to life. Robert and Robert are deeply committed to serving the southeastern Michigan community with integrity, enthusiasm, and a genuine love for the work they do."}</p>

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: 44, padding: "32px 24px", background: S.cream, borderRadius: 14, border: "1px solid " + S.border }}>
          <p style={{ color: S.gold, fontSize: 18, fontFamily: S.serif, fontWeight: 600, margin: "0 0 6px" }}>{"Find it. Appraise it. Sell it."}</p>
          <p style={{ color: S.textLight, fontSize: 28, fontFamily: S.serif, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.02em" }}>
            {"LOOK"}<span style={{ color: S.accent }}>{"4"}</span>{"it"}
          </p>
          <button onClick={() => { setView("home"); window.scrollTo(0, 0); }} style={{ ...btn(true), padding: "12px 32px", fontSize: 14, justifyContent: "center" }}>
            {"Start Searching"}
          </button>
        </div>
      </div>
    );
  };

  const Toast = () => toast && (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:toast.type==="success"?"rgba(90,140,120,0.15)":"rgba(97,41,80,0.15)", border:"1px solid " + (toast.type==="success"?"rgba(90,140,120,0.3)":"rgba(97,41,80,0.3)"), color:toast.type==="success"?"#7BBF9B":"#C07090", padding:"12px 24px", borderRadius:8, fontSize:13, fontFamily:S.font, fontWeight:500, zIndex:200, animation:"fadeIn 0.2s ease-out", backdropFilter:"blur(10px)" }}>
      {toast.msg}
    </div>
  );

  const Footer = () => (
    <footer style={{ background:S.bgLight, borderTop:"1px solid " + S.border, padding:"48px 24px 32px" }}>
      <div style={{ maxWidth:1120, margin:"0 auto" }}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:40, marginBottom:40 }}>
          <div>
            <div style={{ fontFamily:S.serif, fontSize:22, fontWeight:700, color:S.gold, marginBottom:12, letterSpacing:"-0.02em" }}>{"Look"}<span style={{color:S.accent}}>{"4"}</span>{"it"}</div>
            <p style={{ color:S.muted, fontSize:13, fontFamily:S.font, lineHeight:1.7, margin:"0 0 16px", maxWidth:300 }}>
              {"The all-in-one resale search tool."}<br/>{"Find it. Appraise it. Sell it. LOOK4it."}
            </p>
            <div style={{ display:"flex", alignItems:"center", gap:6, color:S.dim, fontSize:12, fontFamily:S.font }}>
              <MapIco s={13}/>{" Oakland Twp, Michigan"}
            </div>
          </div>
          <div>
            <h4 style={{ color:S.goldDim, fontSize:10, fontWeight:700, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"2px", margin:"0 0 16px" }}>{"Company"}</h4>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <a href="#" onClick={e=>{e.preventDefault();setView("about");window.scrollTo(0,0);}} style={{ color:S.muted, fontSize:13, fontFamily:S.font, textDecoration:"none", transition:"color 0.2s", cursor:"pointer" }}>{"About Us"}</a>
              {["Contact Us","Careers","Press"].map(l=>(
                <a key={l} href="#" style={{ color:S.muted, fontSize:13, fontFamily:S.font, textDecoration:"none", transition:"color 0.2s" }}>{l}</a>
              ))}
            </div>
          </div>
          <div>
            <h4 style={{ color:S.goldDim, fontSize:10, fontWeight:700, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"2px", margin:"0 0 16px" }}>{"Support"}</h4>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {["FAQ","Help Center","Support","Seller Guide"].map(l=>(
                <a key={l} href="#" style={{ color:S.muted, fontSize:13, fontFamily:S.font, textDecoration:"none", transition:"color 0.2s" }}>{l}</a>
              ))}
            </div>
          </div>
          <div>
            <h4 style={{ color:S.goldDim, fontSize:10, fontWeight:700, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"2px", margin:"0 0 16px" }}>{"Resources"}</h4>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <a href="#" style={{ color:S.muted, fontSize:13, fontFamily:S.font, textDecoration:"none", display:"flex", alignItems:"center", gap:6, transition:"color 0.2s" }}><BotIco s={13}/>{"Talk to our AI"}</a>
              {["Blog","Pricing","Privacy Policy","Terms of Service"].map(l=>(
                <a key={l} href="#" style={{ color:S.muted, fontSize:13, fontFamily:S.font, textDecoration:"none", transition:"color 0.2s" }}>{l}</a>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop:"1px solid " + S.border, paddingTop:24, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
          <p style={{ color:S.dim, fontSize:11, fontFamily:S.font, margin:0 }}>
            {"2026 Look4it. All rights reserved. A Ringoshi LLC product."}
          </p>
          <div style={{ display:"flex", gap:16 }}>
            {["Estate Sales","Auctions","Antiques","Vintage","Collectibles","Metro Detroit"].map(t=>(
              <span key={t} style={{ color:S.dim, fontSize:10, fontFamily:S.font }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );

  return (
    <div style={{ background:S.bg, minHeight:"100vh", color:S.text, display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        ::selection { background:rgba(97,41,80,0.4); color:#F5F0E3; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(197,194,200,0.15); border-radius:3px; }
        select option { background:#21202A; color:#EDE5D0; }
        input::placeholder, textarea::placeholder { color:#8A8890; }
        input:focus, textarea:focus, select:focus { border-color: rgba(97,41,80,0.4) !important; }
        @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        footer a:hover { color: #EDE5D0 !important; }
      `}</style>
      <Header/>
      <div style={{ flex:1 }}>
        {view==="home" && Home()}
        {view==="listing" && Detail()}
        {view==="create" && Create()}
        {view==="dashboard" && Dashboard()}
        {view==="settings" && Settings()}
        {view==="about" && About()}
      </div>
      <Footer/>
      {modal==="auth" && AuthModal()}
      {modal==="offer" && OfferModal()}
      {modal==="flag" && FlagModal()}
      <Toast/>
    </div>
  );
}
