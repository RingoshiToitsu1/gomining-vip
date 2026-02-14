// @ts-nocheck
"use client";
import { useState, useEffect } from "react";

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
  { value: "DIRECT", label: "Look4it", color: "#E8FF00" },
  { value: "HIBID", label: "HiBid", color: "#FF6B35" },
  { value: "AUCTION_NINJA", label: "Auction Ninja", color: "#7B61FF" },
  { value: "ESTATESALES_NET", label: "EstateSales.net", color: "#00D4AA" },
  { value: "EBAY", label: "eBay", color: "#FF4444" },
];

const MOCK = [
  { id:"1", title:"Mid-Century Modern Teak Credenza", desc:"Beautiful 1960s Danish design with dovetail joints, original brass hardware, sliding doors. 72\"W x 18\"D x 32\"H.", category:"FURNITURE", condition:"EXCELLENT", img:"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600", price:850, appraised:920, low:700, high:1100, source:"DIRECT", loc:"Royal Oak, MI", tags:["mid-century","teak","credenza"], views:47, seller:"DetroitEstateCo", time:"2026-02-10T14:00:00Z" },
  { id:"2", title:"Vintage Omega Seamaster Automatic 1972", desc:"Cal. 1012 movement, recently serviced. Original silver dial with patina. 34mm case with original bracelet.", category:"WATCHES", condition:"GOOD", img:"https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600", price:1200, appraised:1350, low:1000, high:1600, source:"HIBID", loc:"Ferndale, MI", tags:["omega","seamaster","vintage"], views:92, seller:"TimeCollector", time:"2026-02-11T09:00:00Z", extUrl:"#" },
  { id:"3", title:"Herman Miller Eames Lounge Chair & Ottoman", desc:"Authentic 2018 production. Walnut shell, black leather. Minor armrest wear. Includes authenticity label.", category:"FURNITURE", condition:"LIKE_NEW", img:"https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600", price:3200, appraised:3500, low:2800, high:4200, source:"DIRECT", loc:"Birmingham, MI", tags:["eames","herman miller","lounge"], views:156, seller:"ModernLiving", time:"2026-02-09T11:00:00Z" },
  { id:"4", title:"Sterling Silver Tea Set - Gorham c.1920", desc:"Five-piece Plymouth pattern. Teapot, coffee pot, sugar, creamer, waste bowl. ~78 troy ounces total.", category:"ANTIQUES", condition:"EXCELLENT", img:"https://images.unsplash.com/photo-1563826904577-6b72c5d75e53?w=600", price:2800, appraised:3100, low:2400, high:3800, source:"AUCTION_NINJA", loc:"Grosse Pointe, MI", tags:["sterling","gorham","tea set"], views:34, seller:"SilverSpoon", time:"2026-02-12T16:00:00Z", extUrl:"#" },
  { id:"5", title:"1978 Fender Stratocaster Olympic White", desc:"All original electronics and hardware. Maple neck, some fret wear. Hard shell case included.", category:"OTHER", condition:"GOOD", img:"https://images.unsplash.com/photo-1564186763535-ebb21ef5277f?w=600", price:2400, appraised:2600, low:2000, high:3000, source:"ESTATESALES_NET", loc:"Dearborn, MI", tags:["fender","stratocaster","guitar"], views:78, seller:"MotorCityMusic", time:"2026-02-08T08:00:00Z", extUrl:"#" },
  { id:"6", title:"Tiffany-Style Stained Glass Dragonfly Lamp", desc:"Handcrafted stained glass shade, bronze base. 26\" tall, 16\" shade. Working condition.", category:"HOME_DECOR", condition:"EXCELLENT", img:"https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=600", price:450, appraised:380, low:250, high:500, source:"EBAY", loc:"Troy, MI", tags:["tiffany","lamp","stained glass"], views:23, seller:"VintageFinds", time:"2026-02-13T10:00:00Z", extUrl:"#" },
];

const fmt = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const ago = (d) => { const s=Math.floor((Date.now()-new Date(d))/1000); return s<3600?Math.floor(s/60)+"m ago":s<86400?Math.floor(s/3600)+"h ago":Math.floor(s/86400)+"d ago"; };
const srcInfo = (s) => SOURCES.find(x=>x.value===s)||SOURCES[0];

const S = {
  font: "'DM Sans', system-ui, sans-serif",
  mono: "'Space Mono', 'JetBrains Mono', monospace",
  bg: "#0A0A0A", accent: "#E8FF00", card: "rgba(255,255,255,0.025)",
  border: "rgba(255,255,255,0.06)", borderHover: "rgba(232,255,0,0.2)",
  text: "#fff", muted: "#888", dim: "#555",
};

const Svg = ({d,size=20,fill="none",stroke="currentColor"}) => <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
const SearchIco = ({s=18})=><Svg size={s} d="M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.3-4.3"/>;
const HeartIco = ({s=16,f=false})=><svg width={s} height={s} viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const LockIco = ({s=12})=><Svg size={s} d="M7 11V7a5 5 0 0110 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"/>;
const EyeIco = ({s=12})=><Svg size={s} d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z"/>;
const FlagIco = ({s=14})=><Svg size={s} d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V15"/>;
const XIco = ({s=16})=><Svg size={s} d="M18 6L6 18M6 6l12 12"/>;
const ArrowIco = ({s=18})=><Svg size={s} d="M19 12H5M12 19l-7-7 7-7"/>;
const BellIco = ({s=18})=><Svg size={s} d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 003.4 0"/>;
const UserIco = ({s=16})=><Svg size={s} d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z"/>;
const CamIco = ({s=28})=><Svg size={s} d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3zM12 10a3 3 0 100 6 3 3 0 000-6z"/>;
const SparkIco = ({s=14})=><Svg size={s} d="M12 3l-1.9 5.8a2 2 0 01-1.3 1.3L3 12l5.8 1.9a2 2 0 011.3 1.3L12 21l1.9-5.8a2 2 0 011.3-1.3L21 12l-5.8-1.9a2 2 0 01-1.3-1.3L12 3z"/>;

export default function Look4it() {
  const [view, setView] = useState("home");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(MOCK);
  const [fil, setFil] = useState({cat:"",cond:"",src:"",min:"",max:"",sort:"newest"});
  const [showFil, setShowFil] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [favs, setFavs] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [offerAmt, setOfferAmt] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [flagReason, setFlagReason] = useState("SCAM");
  const [flagDesc, setFlagDesc] = useState("");
  const [authTab, setAuthTab] = useState("signin");
  const [createStep, setCreateStep] = useState(0);
  const [createData, setCreateData] = useState({title:"",desc:"",cat:"FURNITURE",cond:"GOOD",price:"",loc:"Detroit Metro, MI"});

  useEffect(() => {
    let r = [...MOCK];
    if(q){ const lq=q.toLowerCase(); r=r.filter(l=>l.title.toLowerCase().includes(lq)||l.desc.toLowerCase().includes(lq)||l.tags.some(t=>t.includes(lq))); }
    if(fil.cat) r=r.filter(l=>l.category===fil.cat);
    if(fil.cond) r=r.filter(l=>l.condition===fil.cond);
    if(fil.src) r=r.filter(l=>l.source===fil.src);
    if(fil.min) r=r.filter(l=>l.price>=+fil.min);
    if(fil.max) r=r.filter(l=>l.price<=+fil.max);
    if(fil.sort==="price_asc") r.sort((a,b)=>a.price-b.price);
    else if(fil.sort==="price_desc") r.sort((a,b)=>b.price-a.price);
    else r.sort((a,b)=>new Date(b.time)-new Date(a.time));
    setResults(r);
  }, [q, fil]);

  const notify = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const togFav = (id,e) => { e?.stopPropagation(); setFavs(p=>{const n=new Set(p); n.has(id)?n.delete(id):n.add(id); notify(n.has(id)?"Added to favorites":"Removed"); return n;}); };

  // ---- STYLES ----
  const btn = (primary=false) => ({
    background: primary ? "linear-gradient(135deg, #E8FF00, #C4D900)" : "rgba(255,255,255,0.05)",
    border: primary ? "none" : "1px solid rgba(255,255,255,0.1)",
    color: primary ? "#0A0A0A" : "#ccc",
    padding: "10px 20px", borderRadius: 10, cursor: "pointer",
    fontFamily: S.font, fontSize: 13, fontWeight: 600, transition: "all 0.2s",
    display: "inline-flex", alignItems: "center", gap: 6,
  });
  const inp = { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", padding:"10px 12px", borderRadius:8, fontSize:14, fontFamily:S.font, width:"100%", boxSizing:"border-box", outline:"none" };
  const lbl = { display:"block", color:"#666", fontSize:11, fontWeight:600, marginBottom:6, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"0.5px" };

  // ---- HEADER ----
  const Header = () => (
    <header style={{ position:"sticky", top:0, zIndex:50, background:"rgba(10,10,10,0.92)", backdropFilter:"blur(20px)", borderBottom:`1px solid ${S.border}`, padding:"0 20px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:24 }}>
        <button onClick={()=>{setView("home");setSel(null);}} style={{ background:"none", border:"none", cursor:"pointer", padding:0 }}>
          <span style={{ fontFamily:S.mono, fontSize:22, fontWeight:700, color:S.accent }}>Look<span style={{color:"#fff"}}>4</span>it</span>
        </button>
        <nav style={{ display:"flex", gap:3 }}>
          {[["home","Browse"],["create","Sell"],["dashboard","Dashboard"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{ background:view===v?"rgba(232,255,0,0.1)":"transparent", border:view===v?"1px solid rgba(232,255,0,0.2)":"1px solid transparent", color:view===v?S.accent:"#777", padding:"5px 14px", borderRadius:7, cursor:"pointer", fontFamily:S.font, fontSize:12, fontWeight:500 }}>{l}</button>
          ))}
        </nav>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button style={{ background:"transparent", border:`1px solid ${S.border}`, color:"#777", width:34, height:34, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
          <BellIco/><div style={{ position:"absolute", top:-2, right:-2, width:7, height:7, background:"#FF4444", borderRadius:"50%", border:"2px solid #0A0A0A" }}/>
        </button>
        <button onClick={()=>loggedIn?setLoggedIn(false):setModal("auth")} style={{ ...btn(true), padding:"7px 14px" }}>
          <UserIco s={14}/>{loggedIn?"Ringo":"Sign In"}
        </button>
      </div>
    </header>
  );

  // ---- LISTING CARD ----
  const Card = ({l}) => {
    const si = srcInfo(l.source); const ext = l.source!=="DIRECT";
    return (
      <div onClick={()=>{setSel(l);setView("listing");}} style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:14, overflow:"hidden", cursor:"pointer", transition:"all 0.2s" }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=S.borderHover;e.currentTarget.style.transform="translateY(-2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=S.border;e.currentTarget.style.transform="none";}}>
        <div style={{ position:"relative", paddingTop:"72%", background:"#151515" }}>
          <img src={l.img} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} onError={e=>e.target.style.opacity=0.3}/>
          <div style={{ position:"absolute", top:8, left:8, background:si.color, color:"#0A0A0A", padding:"2px 8px", borderRadius:5, fontSize:9, fontWeight:700, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"0.5px" }}>{si.label}</div>
          <button onClick={e=>togFav(l.id,e)} style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.5)", border:"none", width:30, height:30, borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:favs.has(l.id)?"#FF4444":"#fff", backdropFilter:"blur(8px)" }}>
            <HeartIco s={14} f={favs.has(l.id)}/>
          </button>
          {ext && <div style={{ position:"absolute", bottom:8, right:8, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)", padding:"3px 8px", borderRadius:5, display:"flex", alignItems:"center", gap:3, color:S.accent, fontSize:9, fontWeight:600, fontFamily:S.font }}><LockIco/>Finder's Fee</div>}
        </div>
        <div style={{ padding:14 }}>
          <h3 style={{ color:"#fff", fontSize:13, fontWeight:600, fontFamily:S.font, margin:0, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{l.title}</h3>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:10 }}>
            <div>
              <div style={{ color:S.accent, fontSize:17, fontWeight:700, fontFamily:S.mono }}>{fmt(l.price)}</div>
              {l.appraised && <div style={{ color:"#555", fontSize:10, fontFamily:S.font, marginTop:2 }}>Appraised: {fmt(l.appraised)}</div>}
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:"#555", fontSize:10, fontFamily:S.font }}>{l.loc}</div>
              <div style={{ color:"#444", fontSize:9, display:"flex", alignItems:"center", gap:3, justifyContent:"flex-end", marginTop:2 }}><EyeIco/>{l.views}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ---- SELECT DROPDOWN ----
  const Sel = ({label,value,onChange,options,all="All"}) => (
    <div>
      <label style={lbl}>{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{...inp, padding:"8px 10px", fontSize:12}}>
        <option value="">{all}</option>
        {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );

  // ---- HOME VIEW ----
  const Home = () => (
    <div>
      <div style={{ padding:"44px 20px 28px", textAlign:"center", background:"radial-gradient(ellipse at 50% 0%, rgba(232,255,0,0.05) 0%, transparent 70%)" }}>
        <h1 style={{ fontFamily:S.mono, fontSize:38, fontWeight:700, color:"#fff", margin:"0 0 6px", lineHeight:1.1 }}>
          Look<span style={{color:S.accent}}>4</span>it. Find it.
        </h1>
        <p style={{ fontFamily:S.font, fontSize:15, color:"#666", margin:"0 0 28px" }}>
          The search engine for estate sales, auctions, and secondhand treasures across Metro Detroit.
        </p>
        {/* Search */}
        <div style={{ maxWidth:680, margin:"0 auto" }}>
          <div style={{ display:"flex", gap:6, background:"rgba(255,255,255,0.03)", border:`1px solid ${S.border}`, borderRadius:12, padding:4 }}>
            <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"0 12px" }}>
              <SearchIco/>
              <input placeholder="Search furniture, watches, art, tools..." value={q} onChange={e=>setQ(e.target.value)}
                style={{ background:"transparent", border:"none", outline:"none", color:"#fff", fontSize:14, fontFamily:S.font, width:"100%", padding:"10px 0" }}/>
              {q && <button onClick={()=>setQ("")} style={{ background:"rgba(255,255,255,0.08)", border:"none", width:22, height:22, borderRadius:5, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#888" }}><XIco s={12}/></button>}
            </div>
            <button onClick={()=>setShowFil(!showFil)} style={{ background:showFil?S.accent:"rgba(232,255,0,0.1)", border:"1px solid rgba(232,255,0,0.3)", color:showFil?"#0A0A0A":S.accent, padding:"8px 16px", borderRadius:8, cursor:"pointer", fontFamily:S.font, fontSize:12, fontWeight:600 }}>Filters</button>
          </div>
        </div>
        {/* Filters */}
        {showFil && (
          <div style={{ maxWidth:680, margin:"10px auto 0" }}>
            <div style={{ background:"rgba(255,255,255,0.025)", border:`1px solid ${S.border}`, borderRadius:10, padding:16, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:10, textAlign:"left" }}>
              <Sel label="Category" value={fil.cat} onChange={v=>setFil({...fil,cat:v})} options={CATEGORIES}/>
              <Sel label="Condition" value={fil.cond} onChange={v=>setFil({...fil,cond:v})} options={CONDITIONS}/>
              <Sel label="Source" value={fil.src} onChange={v=>setFil({...fil,src:v})} options={SOURCES} all="All Sources"/>
              <div><label style={lbl}>Min Price</label><input type="number" placeholder="$0" value={fil.min} onChange={e=>setFil({...fil,min:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12}}/></div>
              <div><label style={lbl}>Max Price</label><input type="number" placeholder="No max" value={fil.max} onChange={e=>setFil({...fil,max:e.target.value})} style={{...inp,padding:"8px 10px",fontSize:12}}/></div>
              <Sel label="Sort" value={fil.sort} onChange={v=>setFil({...fil,sort:v})} options={[{value:"newest",label:"Newest"},{value:"price_asc",label:"Price: Low-High"},{value:"price_desc",label:"Price: High-Low"}]} all="Newest"/>
            </div>
          </div>
        )}
      </div>
      {/* Results Grid */}
      <div style={{ padding:"20px 20px 48px", maxWidth:1100, margin:"0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ color:"#555", fontSize:12, fontFamily:S.font }}>{results.length} results{q&&<> for "<span style={{color:S.accent}}>{q}</span>"</>}</span>
          <div style={{ display:"flex", gap:10 }}>
            {SOURCES.map(s=><div key={s.value} style={{ display:"flex", alignItems:"center", gap:3 }}><div style={{ width:7, height:7, borderRadius:2, background:s.color }}/><span style={{ color:"#555", fontSize:10, fontFamily:S.font }}>{s.label}</span></div>)}
          </div>
        </div>
        {results.length===0 ? (
          <div style={{ textAlign:"center", padding:60, color:"#444", fontFamily:S.font }}>
            <SearchIco s={40}/><p style={{marginTop:16,fontSize:16}}>No items found</p><p style={{fontSize:13,color:"#333"}}>Try different search terms or adjust your filters</p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:16 }}>
            {results.map(l=><Card key={l.id} l={l}/>)}
          </div>
        )}
      </div>
    </div>
  );

  // ---- LISTING DETAIL VIEW ----
  const Detail = () => {
    if(!sel) return null;
    const si = srcInfo(sel.source); const ext = sel.source!=="DIRECT";
    const fee = (sel.appraised||sel.price)*0.1;
    return (
      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px 48px" }}>
        <button onClick={()=>{setView("home");setSel(null);}} style={{ ...btn(), marginBottom:20, padding:"7px 14px", fontSize:12 }}><ArrowIco/>Back to results</button>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          {/* Image */}
          <div style={{ borderRadius:14, overflow:"hidden", background:"#151515", position:"relative" }}>
            <img src={sel.img} alt="" style={{ width:"100%", aspectRatio:"4/3", objectFit:"cover" }} onError={e=>e.target.style.opacity=0.3}/>
            <div style={{ position:"absolute", top:12, left:12, background:si.color, color:"#0A0A0A", padding:"3px 10px", borderRadius:6, fontSize:10, fontWeight:700, fontFamily:S.font, textTransform:"uppercase" }}>{si.label}</div>
          </div>
          {/* Info */}
          <div>
            <h1 style={{ fontFamily:S.font, fontSize:24, fontWeight:700, color:"#fff", margin:"0 0 8px", lineHeight:1.3 }}>{sel.title}</h1>
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              <span style={{ background:"rgba(255,255,255,0.06)", color:"#aaa", padding:"3px 10px", borderRadius:6, fontSize:11, fontFamily:S.font }}>{CATEGORIES.find(c=>c.value===sel.category)?.label}</span>
              <span style={{ background:"rgba(255,255,255,0.06)", color:"#aaa", padding:"3px 10px", borderRadius:6, fontSize:11, fontFamily:S.font }}>{CONDITIONS.find(c=>c.value===sel.condition)?.label}</span>
              <span style={{ color:"#555", fontSize:11, fontFamily:S.font, display:"flex", alignItems:"center", gap:4 }}><EyeIco/>{sel.views} views</span>
            </div>

            {/* Price Card */}
            <div style={{ background:"rgba(232,255,0,0.04)", border:"1px solid rgba(232,255,0,0.15)", borderRadius:12, padding:20, marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ color:"#888", fontSize:11, fontFamily:S.font, marginBottom:4 }}>Asking Price</div>
                  <div style={{ color:S.accent, fontSize:28, fontWeight:700, fontFamily:S.mono }}>{fmt(sel.price)}</div>
                </div>
                {sel.appraised && (
                  <div style={{ textAlign:"right" }}>
                    <div style={{ color:"#888", fontSize:11, fontFamily:S.font, marginBottom:4, display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end" }}><SparkIco/>AI Appraised</div>
                    <div style={{ color:"#fff", fontSize:20, fontWeight:600, fontFamily:S.mono }}>{fmt(sel.appraised)}</div>
                    <div style={{ color:"#555", fontSize:11, fontFamily:S.font, marginTop:2 }}>Range: {fmt(sel.low)} - {fmt(sel.high)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {ext ? (
              <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${S.border}`, borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  <LockIco s={14}/><span style={{ color:S.accent, fontSize:13, fontWeight:600, fontFamily:S.font }}>External Listing - Finder's Fee Required</span>
                </div>
                <p style={{ color:"#777", fontSize:12, fontFamily:S.font, margin:"0 0 12px", lineHeight:1.5 }}>
                  This item is listed on {si.label}. Pay a finder's fee of <strong style={{color:S.accent}}>{fmt(fee)}</strong> (10% of appraised value) to unlock the purchase link.
                </p>
                <button onClick={()=>loggedIn?notify("Redirecting to Stripe checkout..."):setModal("auth")} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"12px 20px", fontSize:14 }}>
                  <LockIco s={14}/>Unlock for {fmt(fee)}
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <button onClick={()=>loggedIn?notify("Redirecting to Stripe checkout..."):setModal("auth")} style={{ ...btn(true), flex:1, justifyContent:"center", padding:"12px 20px", fontSize:14 }}>
                  Buy Now - {fmt(sel.price)}
                </button>
                <button onClick={()=>loggedIn?setModal("offer"):setModal("auth")} style={{ ...btn(), flex:1, justifyContent:"center", padding:"12px 20px", fontSize:14, color:S.accent, borderColor:"rgba(232,255,0,0.3)" }}>
                  Make Offer
                </button>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom:16 }}>
              <h3 style={{ color:"#aaa", fontSize:12, fontWeight:600, fontFamily:S.font, textTransform:"uppercase", letterSpacing:"0.5px", margin:"0 0 8px" }}>Description</h3>
              <p style={{ color:"#999", fontSize:13, fontFamily:S.font, lineHeight:1.7, margin:0 }}>{sel.desc}</p>
            </div>

            {/* Tags */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
              {sel.tags.map(t=><span key={t} style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${S.border}`, color:"#777", padding:"3px 10px", borderRadius:6, fontSize:11, fontFamily:S.font }}>#{t}</span>)}
            </div>

            {/* Seller & Meta */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:16, borderTop:`1px solid ${S.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:"rgba(232,255,0,0.1)", display:"flex", alignItems:"center", justifyContent:"center", color:S.accent }}><UserIco s={14}/></div>
                <div>
                  <div style={{ color:"#ccc", fontSize:13, fontWeight:600, fontFamily:S.font }}>{sel.seller}</div>
                  <div style={{ color:"#555", fontSize:11, fontFamily:S.font }}>{sel.loc}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>togFav(sel.id)} style={{ ...btn(), padding:"7px 12px", color:favs.has(sel.id)?"#FF4444":"#888" }}>
                  <HeartIco s={14} f={favs.has(sel.id)}/>{favs.has(sel.id)?"Saved":"Save"}
                </button>
                <button onClick={()=>loggedIn?setModal("flag"):setModal("auth")} style={{ ...btn(), padding:"7px 12px", color:"#888" }}>
                  <FlagIco/>Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ---- CREATE LISTING VIEW ----
  const Create = () => (
    <div style={{ maxWidth:640, margin:"0 auto", padding:"32px 20px 48px" }}>
      <h1 style={{ fontFamily:S.mono, fontSize:28, fontWeight:700, color:"#fff", margin:"0 0 4px" }}>
        Sell on Look<span style={{color:S.accent}}>4</span>it
      </h1>
      <p style={{ color:"#666", fontSize:14, fontFamily:S.font, margin:"0 0 28px" }}>Upload photos and our AI will generate a description and price appraisal.</p>

      {createStep===0 && (
        <div>
          {/* Image Upload Area */}
          <div style={{ border:`2px dashed rgba(232,255,0,0.2)`, borderRadius:14, padding:48, textAlign:"center", marginBottom:24, background:"rgba(232,255,0,0.02)", cursor:"pointer" }}
            onClick={()=>{ setCreateStep(1); notify("AI analyzing your images...","info"); setTimeout(()=>{
              setCreateData({title:"Vintage Brass Table Lamp - Art Deco Style",desc:"Elegant Art Deco brass table lamp, circa 1940s. Features a geometric stepped base with original patina and a frosted glass shade. Fully rewired with a 3-way switch. Height 18 inches. Minor wear consistent with age. A stunning accent piece for any room.",cat:"HOME_DECOR",cond:"GOOD",price:"185",loc:"Detroit Metro, MI"});
              notify("AI appraisal complete!");
            },1500); }}>
            <CamIco s={40}/><br/>
            <span style={{ color:S.accent, fontSize:15, fontWeight:600, fontFamily:S.font, display:"block", marginTop:12 }}>Upload Photos</span>
            <span style={{ color:"#555", fontSize:12, fontFamily:S.font, display:"block", marginTop:6 }}>Drag and drop or click to browse. Up to 10 images.</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, color:"#555", fontSize:12, fontFamily:S.font }}>
            <SparkIco/>Our AI will automatically generate a title, description, category, condition, and price range from your photos.
          </div>
        </div>
      )}

      {createStep===1 && (
        <div>
          <div style={{ background:"rgba(232,255,0,0.04)", border:"1px solid rgba(232,255,0,0.15)", borderRadius:10, padding:12, marginBottom:20, display:"flex", alignItems:"center", gap:8 }}>
            <SparkIco/><span style={{ color:S.accent, fontSize:12, fontWeight:600, fontFamily:S.font }}>AI-generated listing - review and edit below</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div><label style={lbl}>Title</label><input value={createData.title} onChange={e=>setCreateData({...createData,title:e.target.value})} style={inp}/></div>
            <div><label style={lbl}>Description</label><textarea value={createData.desc} onChange={e=>setCreateData({...createData,desc:e.target.value})} rows={5} style={{...inp, resize:"vertical"}}/></div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Sel label="Category" value={createData.cat} onChange={v=>setCreateData({...createData,cat:v})} options={CATEGORIES} all="Select"/>
              <Sel label="Condition" value={createData.cond} onChange={v=>setCreateData({...createData,cond:v})} options={CONDITIONS} all="Select"/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={lbl}>Your Asking Price</label><input type="number" value={createData.price} onChange={e=>setCreateData({...createData,price:e.target.value})} placeholder="$0.00" style={inp}/></div>
              <div><label style={lbl}>Location</label><input value={createData.loc} onChange={e=>setCreateData({...createData,loc:e.target.value})} style={inp}/></div>
            </div>
            {createData.price && (
              <div style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${S.border}`, borderRadius:10, padding:14 }}>
                <div style={{ color:"#888", fontSize:11, fontFamily:S.font, marginBottom:6 }}>AI Price Appraisal Range</div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#aaa", fontFamily:S.mono, fontSize:14 }}>{fmt(+createData.price*0.8)}</span>
                  <span style={{ color:S.accent, fontFamily:S.mono, fontSize:14, fontWeight:700 }}>{fmt(+createData.price)}</span>
                  <span style={{ color:"#aaa", fontFamily:S.mono, fontSize:14 }}>{fmt(+createData.price*1.3)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:2 }}>
                  <span style={{ color:"#555", fontSize:10, fontFamily:S.font }}>Low</span>
                  <span style={{ color:"#555", fontSize:10, fontFamily:S.font }}>Your Price</span>
                  <span style={{ color:"#555", fontSize:10, fontFamily:S.font }}>High</span>
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button onClick={()=>setCreateStep(0)} style={{ ...btn(), flex:1, justifyContent:"center" }}>Back</button>
              <button onClick={()=>{notify("Listing published successfully!"); setCreateStep(0); setCreateData({title:"",desc:"",cat:"FURNITURE",cond:"GOOD",price:"",loc:"Detroit Metro, MI"}); setView("home");}} style={{ ...btn(true), flex:2, justifyContent:"center", padding:"12px 20px", fontSize:14 }}>
                Publish Listing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ---- DASHBOARD VIEW ----
  const Dashboard = () => (
    <div style={{ maxWidth:800, margin:"0 auto", padding:"32px 20px 48px" }}>
      <h1 style={{ fontFamily:S.mono, fontSize:28, fontWeight:700, color:"#fff", margin:"0 0 24px" }}>Dashboard</h1>
      {!loggedIn ? (
        <div style={{ textAlign:"center", padding:48, background:S.card, border:`1px solid ${S.border}`, borderRadius:14 }}>
          <UserIco s={40}/><p style={{ color:"#888", fontFamily:S.font, fontSize:15, margin:"16px 0" }}>Sign in to access your dashboard</p>
          <button onClick={()=>setModal("auth")} style={btn(true)}>Sign In</button>
        </div>
      ) : (
        <div style={{ display:"grid", gap:16 }}>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {[["Active Listings","3"],["Total Views","295"],["Offers","2"],["Revenue","$850"]].map(([l,v])=>(
              <div key={l} style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:12, padding:16, textAlign:"center" }}>
                <div style={{ color:S.accent, fontSize:24, fontWeight:700, fontFamily:S.mono }}>{v}</div>
                <div style={{ color:"#666", fontSize:11, fontFamily:S.font, marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          {/* Seller Setup */}
          <div style={{ background:"rgba(232,255,0,0.03)", border:"1px solid rgba(232,255,0,0.1)", borderRadius:12, padding:20 }}>
            <h3 style={{ color:"#fff", fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 8px" }}>Seller Payment Setup</h3>
            <p style={{ color:"#777", fontSize:13, fontFamily:S.font, margin:"0 0 12px" }}>Connect your Stripe account to receive payments from sales.</p>
            <button onClick={()=>notify("Redirecting to Stripe Connect onboarding...")} style={btn(true)}>Set Up Stripe Connect</button>
          </div>
          {/* Subscription */}
          <div style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:12, padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <h3 style={{ color:"#fff", fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 4px" }}>Free Plan</h3>
                <p style={{ color:"#777", fontSize:12, fontFamily:S.font, margin:0 }}>Upgrade to Pro for unlimited free item unlocks</p>
              </div>
              <button onClick={()=>notify("Redirecting to subscription checkout...")} style={{ ...btn(), color:S.accent, borderColor:"rgba(232,255,0,0.3)" }}>Upgrade to Pro - $99/mo</button>
            </div>
          </div>
          {/* Recent Listings */}
          <div style={{ background:S.card, border:`1px solid ${S.border}`, borderRadius:12, padding:20 }}>
            <h3 style={{ color:"#fff", fontSize:15, fontWeight:600, fontFamily:S.font, margin:"0 0 14px" }}>Your Listings</h3>
            {MOCK.slice(0,2).map(l=>(
              <div key={l.id} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom:`1px solid ${S.border}` }}>
                <img src={l.img} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:"cover" }}/>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#ccc", fontSize:13, fontWeight:500, fontFamily:S.font }}>{l.title}</div>
                  <div style={{ color:"#555", fontSize:11, fontFamily:S.font, marginTop:2 }}>{fmt(l.price)} - {l.views} views</div>
                </div>
                <span style={{ color:"#00D4AA", fontSize:10, fontWeight:600, fontFamily:S.font, padding:"4px 8px", background:"rgba(0,212,170,0.1)", borderRadius:5, alignSelf:"center" }}>Active</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ---- MODALS ----
  const Overlay = ({children, onClose}) => (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#141414", border:`1px solid ${S.border}`, borderRadius:16, padding:28, maxWidth:420, width:"100%", position:"relative" }}>
        <button onClick={onClose} style={{ position:"absolute", top:12, right:12, background:"none", border:"none", color:"#666", cursor:"pointer" }}><XIco/></button>
        {children}
      </div>
    </div>
  );

  const AuthModal = () => (
    <Overlay onClose={()=>setModal(null)}>
      <h2 style={{ fontFamily:S.mono, fontSize:22, fontWeight:700, color:"#fff", margin:"0 0 4px" }}>
        {authTab==="signin"?"Welcome back":"Create account"}
      </h2>
      <p style={{ color:"#666", fontSize:13, fontFamily:S.font, margin:"0 0 20px" }}>
        {authTab==="signin"?"Sign in to Look4it":"Join the Look4it marketplace"}
      </p>
      <div style={{ display:"flex", gap:4, marginBottom:20, background:"rgba(255,255,255,0.03)", borderRadius:8, padding:3 }}>
        {["signin","signup"].map(t=>(
          <button key={t} onClick={()=>setAuthTab(t)} style={{ flex:1, background:authTab===t?"rgba(232,255,0,0.1)":"transparent", border:"none", color:authTab===t?S.accent:"#666", padding:"8px", borderRadius:6, cursor:"pointer", fontFamily:S.font, fontSize:12, fontWeight:600 }}>
            {t==="signin"?"Sign In":"Sign Up"}
          </button>
        ))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {authTab==="signup" && <div><label style={lbl}>Name</label><input placeholder="Your name" style={inp}/></div>}
        <div><label style={lbl}>Email</label><input type="email" placeholder="you@email.com" style={inp}/></div>
        <div><label style={lbl}>Password</label><input type="password" placeholder="Min 8 characters" style={inp}/></div>
        {authTab==="signup" && <div><label style={lbl}>ZIP Code (Detroit Metro)</label><input placeholder="48XXX" style={inp}/></div>}
        <button onClick={()=>{setLoggedIn(true);setModal(null);notify("Welcome to Look4it!");}} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"12px", marginTop:4, fontSize:14 }}>
          {authTab==="signin"?"Sign In":"Create Account"}
        </button>
      </div>
    </Overlay>
  );

  const OfferModal = () => (
    <Overlay onClose={()=>setModal(null)}>
      <h2 style={{ fontFamily:S.mono, fontSize:20, fontWeight:700, color:"#fff", margin:"0 0 4px" }}>Make an Offer</h2>
      <p style={{ color:"#666", fontSize:12, fontFamily:S.font, margin:"0 0 16px" }}>on {sel?.title}</p>
      <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:8, padding:12, marginBottom:16, display:"flex", justifyContent:"space-between" }}>
        <div><div style={{ color:"#666", fontSize:10, fontFamily:S.font }}>Asking</div><div style={{ color:"#fff", fontFamily:S.mono, fontSize:16 }}>{fmt(sel?.price||0)}</div></div>
        <div style={{textAlign:"right"}}><div style={{ color:"#666", fontSize:10, fontFamily:S.font }}>Appraised</div><div style={{ color:S.accent, fontFamily:S.mono, fontSize:16 }}>{fmt(sel?.appraised||0)}</div></div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div><label style={lbl}>Your Offer</label><input type="number" placeholder="$0.00" value={offerAmt} onChange={e=>setOfferAmt(e.target.value)} style={inp}/></div>
        <div><label style={lbl}>Message (optional)</label><textarea placeholder="Tell the seller why..." value={offerMsg} onChange={e=>setOfferMsg(e.target.value)} rows={3} style={{...inp,resize:"vertical"}}/></div>
        <button onClick={()=>{setModal(null);notify("Offer submitted! The seller will be notified.");setOfferAmt("");setOfferMsg("");}} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"12px" }}>
          Submit Offer
        </button>
      </div>
    </Overlay>
  );

  const FlagModal = () => (
    <Overlay onClose={()=>setModal(null)}>
      <h2 style={{ fontFamily:S.mono, fontSize:20, fontWeight:700, color:"#fff", margin:"0 0 16px" }}>Report Listing</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <Sel label="Reason" value={flagReason} onChange={setFlagReason} options={[{value:"DUPLICATE",label:"Duplicate"},{value:"SCAM",label:"Scam/Fraud"},{value:"INAPPROPRIATE",label:"Inappropriate"},{value:"MISLEADING",label:"Misleading"},{value:"PROHIBITED_ITEM",label:"Prohibited Item"},{value:"OTHER",label:"Other"}]} all="Select reason"/>
        <div><label style={lbl}>Details (optional)</label><textarea placeholder="Provide additional context..." value={flagDesc} onChange={e=>setFlagDesc(e.target.value)} rows={3} style={{...inp,resize:"vertical"}}/></div>
        <button onClick={()=>{setModal(null);notify("Report submitted. Our AI will review this listing.");setFlagDesc("");}} style={{ ...btn(true), width:"100%", justifyContent:"center", padding:"12px", background:"linear-gradient(135deg, #FF4444, #CC0000)" }}>
          Submit Report
        </button>
      </div>
    </Overlay>
  );

  // ---- TOAST ----
  const Toast = () => toast && (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:toast.type==="success"?"#1a2e1a":"#2e1a1a", border:`1px solid ${toast.type==="success"?"rgba(0,212,170,0.3)":"rgba(255,68,68,0.3)"}`, color:toast.type==="success"?"#00D4AA":"#FF6666", padding:"10px 20px", borderRadius:10, fontSize:13, fontFamily:S.font, fontWeight:500, zIndex:200, animation:"fadeIn 0.2s ease-out" }}>
      {toast.msg}
    </div>
  );

  // ---- RENDER ----
  return (
    <div style={{ background:S.bg, minHeight:"100vh", color:S.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        ::selection { background:rgba(232,255,0,0.3); }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:3px; }
        select option { background:#1a1a1a; color:#fff; }
        input::placeholder, textarea::placeholder { color:#444; }
        @keyframes fadeIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      `}</style>
      <Header/>
      {view==="home" && <Home/>}
      {view==="listing" && <Detail/>}
      {view==="create" && <Create/>}
      {view==="dashboard" && <Dashboard/>}
      {modal==="auth" && <AuthModal/>}
      {modal==="offer" && <OfferModal/>}
      {modal==="flag" && <FlagModal/>}
      <Toast/>
    </div>
  );
}
