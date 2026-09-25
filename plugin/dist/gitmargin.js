(()=>{var ji=Object.defineProperty;var To=(e,t)=>{for(var o in t)ji(e,o,{get:t[o],enumerable:!0})};function Hi(e){if(!e)return"";let t=e.publicId?` PUBLIC "${e.publicId}"`:"",o=e.systemId?`${e.publicId?"":" SYSTEM"} "${e.systemId}"`:"";return`<!DOCTYPE ${e.name}${t}${o}>
`}var It=null;function Nn(){return It===null&&(It=Hi(document.doctype)+document.documentElement.outerHTML),It}function nn(){return It===null?Nn():It}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Nn,{once:!0}):Nn();function tn(e){let t=document.querySelector(`meta[name="${e}"]`),o=t&&t.getAttribute("content");return o?o.trim():null}var He={versionId:tn("gitmargin-version"),file:tn("gitmargin-file"),service:tn("gitmargin-service"),key:tn("gitmargin-key")};var Wi=new Set(["active","open","selected","current","on","off","show","shown","hidden","visible","disabled","expanded","collapsed","checked","error"]),Ro=e=>window.CSS&&CSS.escape?CSS.escape(e):e.replace(/[^\w-]/g,"\\$&");function Rn(e){try{return document.querySelectorAll(e).length===1}catch{return!1}}function No(e){if(!e||!e.id)return null;let t=`#${Ro(e.id)}`;return Rn(t)?t:null}function Yi(e){return Array.from(e.classList).find(t=>/^[a-z][a-z0-9-]*$/i.test(t)&&t.length<=24&&!Wi.has(t.toLowerCase()))}function Gi(e){let t=e.localName,o=e.parentElement;if(!o)return t;let a=Array.from(o.children).filter(u=>u.localName===t);if(a.length===1)return t;let c=Yi(e);return c&&a.filter(u=>u.classList.contains(c)).length===1?`${t}.${Ro(c)}`:`${t}:nth-of-type(${a.indexOf(e)+1})`}function Dt(e){if(!e||e.nodeType!==1)return null;let t=No(e);if(t)return t;let o=[],a=e,c=null;for(;a&&a.nodeType===1&&a!==document.documentElement;){o.unshift(Gi(a));let f=No(a.parentElement);if(f){c=f;break}a=a.parentElement}let u=(c?`${c} > `:"")+o.join(" > ");if(Rn(u))return u;for(let f=o.length-1;f>=0;f-=1){let $=o.slice(f).join(" > ");if(Rn($))return $}return u||null}var We="gitmargin-root",Ze=`#${We}`;function re(e){return String(e??"").replace(/\s+/g," ").trim()}function Vi(e,t){return e.localName==="br"||!(t==="contents"||t===""||t.startsWith("inline"))}function _o(e,t){for(let o of e.childNodes){if(o.nodeType===3){t.push(o.data);continue}if(o.nodeType!==1)continue;let a=Vi(o,getComputedStyle(o).display);a&&t.push(" "),_o(o,t),a&&t.push(" ")}}function et(e){if(!e||e.nodeType!==1)return"";let t=[];return _o(e,t),re(t.join(""))}function tt(e){if(!e||e.nodeType!==1)return"";let t=et(e);return t||re(e.getAttribute("aria-label")||e.getAttribute("title")||"")}function Mo(e,t=40){let o=re(e);return o.length>t?`${o.slice(0,t-1)}\u2026`:o}var Mn="h1, h2, h3, h4, h5, h6",Ji=new Set(["h1","h2","h3","h4","h5","h6","hgroup","p","span","small","strong","b","em","i","br","img","svg"]),lt=e=>!!e&&e.nodeType===1&&e.getClientRects().length>0,on=null;function Do(){return on||(on={text:new Map},queueMicrotask(()=>{on=null})),on}var _n=(e,t)=>{let o=Do();return e in o||(o[e]=t()),o[e]},Fo=()=>_n("headings",()=>Array.from(document.querySelectorAll(Mn)).filter(lt)),qo=e=>{let{text:t}=Do();return t.has(e)||t.set(e,et(e)),t.get(e)};function Io(e){let t=e.querySelector(Mn);return t?et(t):""}function Ki(e){let t=e&&e.closest?e.closest(Mn):null;if(lt(t))return t;let o=Fo(),a=Node.DOCUMENT_POSITION_FOLLOWING|Node.DOCUMENT_POSITION_CONTAINED_BY,c=null;for(let u=0,f=o.length-1;u<=f;){let $=u+f>>1;o[$].compareDocumentPosition(e)&a?(c=o[$],u=$+1):f=$-1}return c}function Xi(e){for(let t=document.body;t;){if(t===e)return!0;let o=Array.from(t.children).filter(a=>a.id!==We&&lt(a));if(o.length!==1)return!1;t=o[0]}return!1}function Qi(e){let t=c=>c.children.length<=3&&Array.from(c.children).every(u=>Ji.has(u.localName)),o=e.parentElement,a=!1;for(;o&&t(o);)o=o.parentElement,a=!0;return!o||o===document.body||a&&Xi(o)?null:o}function zo(e){let t=e&&e.closest?e.closest("[data-gm-screen]"):null;if(t)return{name:re(t.getAttribute("data-gm-screen")),source:"data-gm-screen",box:t};let o=_n("dialogs",()=>Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).filter(lt)),a=o.find(h=>e&&h.contains(e)),c=a||o.find(h=>h.matches("dialog[open]"));if(c)return{name:Io(c)||re(c.getAttribute("aria-label"))||"Dialog",source:"dialog",box:a||null};let u=_n("marked",()=>{let h=document.querySelector('[aria-current="step"]');if(lt(h))return{name:Io(h)||tt(h).slice(0,60),source:"aria-current",box:null};let B=document.querySelector('[role="tab"][aria-selected="true"]');return lt(B)?{name:tt(B),source:"tab",box:null}:null});if(u)return{...u};let f=e?Ki(e):null,$=f?qo(f):"";if($)return{name:$,source:"heading",box:Qi(f)};let _=re(location.hash);return _?{name:_,source:"hash",box:null}:{name:null,source:"none",box:null}}function rn(e){let{name:t,source:o}=zo(e);return{name:t,source:o}}function Bo(e){return zo(e)}function Po(e){let t=re(e);if(!t)return!1;let o=(a,c)=>Array.from(document.querySelectorAll(a)).some(u=>lt(u)&&re(c(u))===t);return o("[data-gm-screen]",a=>a.getAttribute("data-gm-screen"))||o('dialog[open], [role="dialog"]',a=>a.getAttribute("aria-label"))||Fo().some(a=>re(qo(a))===t)}var Uo=32,Ho=160,Zi=e=>e?e.nodeType===1?e:e.parentElement:null,sn=e=>!!e&&e.nodeType===1&&e.getClientRects().length>0,Ie=e=>String(e??"").replace(/\s+/g,""),In=e=>typeof e=="string"?e.replace(/\s+/g," ").trim():"";function Wo(e,t){let o=In(e),a=In(t);return!o||!a||o===a}function er(e,t){let o=Ie(t);return!o||Ie(e.textContent).includes(o)}var tr=new Set(["data-gm-screen","heading"]),nr=(e,t)=>tr.has(e.source)||e.source==="dialog"&&t.source==="dialog",jo=e=>Ie(e).replace(/\d+/g,"");function or(e,t){let o=jo(t);return!o||jo(e.textContent).includes(o)}function ir(e){return typeof e=="string"?{name:e,source:null}:!e||typeof e!="object"||typeof e.name!="string"?{name:null,source:null}:{name:e.name,source:typeof e.source=="string"?e.source:null}}function rr(e,t,o){if(!In(t.name))return!0;let a=Bo(e);return Wo(t.name,a.name)?!0:nr(t,a)&&a.box&&a.box.contains(e)?!1:or(e,o)}function sr(e,t,o){let a=Ie(t&&t.prefix),c=Ie(t&&t.suffix),u=e.parentElement;if(!u||!a&&!c)return 0;let f=Ie(e.textContent).indexOf(o);if(f<0)return 0;let $=f;for(let B=e.previousSibling;B;B=B.previousSibling)(B.nodeType===1||B.nodeType===3)&&($+=Ie(B.textContent).length);let _=Ie(u.textContent),h=0;return a&&_.slice(0,$).endsWith(a)&&(h+=1),c&&_.slice($+o.length).startsWith(c)&&(h+=1),h}function Yo(e,t){if(!t)return{prefix:"",exact:"",suffix:""};let o=et(e),a=o.indexOf(t);return a<0?{prefix:"",exact:t,suffix:""}:{prefix:o.slice(Math.max(0,a-Uo),a),exact:t,suffix:o.slice(a+t.length,a+t.length+Uo)}}function ar(e,t){let o=e.getBoundingClientRect();if(!t||!o.width||!o.height)return{x:.5,y:.5};let a=c=>Math.min(1,Math.max(0,Math.round(c*1e3)/1e3));return{x:a((t.clientX-o.left)/o.width),y:a((t.clientY-o.top)/o.height)}}function Go(e,t){let o=re(tt(e)).slice(0,Ho);return{selector:Dt(e),tag:e.localName,quote:Yo(e.parentElement||document.body,o),point:ar(e,t)}}function Vo(e){let t=re(e.toString()).slice(0,Ho),o=e.getRangeAt(0),a=Zi(o.commonAncestorContainer);return{selector:Dt(a),tag:a?a.localName:null,quote:Yo(a,t),point:{x:.5,y:.5}}}function lr(e){let t=e&&e.exact;if(!t)return[];let o=Ie(t);if(!o)return[];let a=f=>Ie(f.textContent),c=Array.from(document.querySelectorAll("body *")).filter(f=>!f.closest(Ze)&&a(f).includes(o)),u=f=>a(f)===o;return c.filter(f=>!c.some($=>$!==f&&f.contains($))).map(f=>({element:f,exact:u(f),context:sr(f,e,o),size:f.querySelectorAll("*").length})).sort((f,$)=>Number($.exact)-Number(f.exact)||$.context-f.context||f.size-$.size).map(({element:f,exact:$})=>({element:f,exact:$}))}function dr(e){if(!e)return null;let t=e.split(">").map(o=>o.trim()).filter(Boolean);for(let o=t.length-1;o>0;o-=1)try{let a=document.querySelector(t.slice(0,o).join(" > "));if(a&&!a.closest(Ze))return a}catch{}return null}function an(e,t=null){if(!e)return{element:null,status:"orphaned",via:null};let o=ir(t),a=e.quote&&e.quote.exact,c=[];if(e.selector)try{for(let M of document.querySelectorAll(e.selector))M&&!M.closest(Ze)&&c.push(M)}catch{}let u=0,f=[];for(let M of c)if(!sn(M))f.push(M);else{if(rr(M,o,a))return{element:M,status:"found",via:"selector"};u+=1}let $=f.find(M=>er(M,a));if($)return{element:$,status:"hidden",via:"selector"};if(u&&!Po(o.name))return{element:null,status:"hidden",via:"screen"};let _=lr(e.quote).filter(M=>!sn(M.element)||Wo(o.name,rn(M.element).name)?!0:(u+=1,!1)),B=_.length>1?"quote-loose":"quote",se=_.find(M=>sn(M.element));if(se)return{element:se.element,status:"found",via:B};if(u)return{element:null,status:"hidden",via:"screen"};if(f.length)return{element:f[0],status:"hidden",via:"selector"};if(_.length)return{element:_[0].element,status:"hidden",via:B};let L=dr(e.selector);return L?{element:L,status:sn(L)?"found":"hidden",via:"ancestor"}:{element:null,status:"orphaned",via:null}}var cr=["button","a[href]","input","select","textarea","label","summary",'[role="button"]','[role="tab"]','[role="link"]','[role="menuitem"]','[role="option"]','[role="checkbox"]','[role="radio"]','[role="switch"]','[tabindex]:not([tabindex^="-"])'].join(","),ur=["h1","h2","h3","h4","h5","h6","p","li","dt","dd","td","th","blockquote","figcaption","legend","img","svg","video","figure","picture"].join(","),Dn=e=>!!e&&(e.localName==="body"||e.localName==="html");function Fn(e){if(!e||!e.closest)return null;let t=e.closest(cr);return t&&!Dn(t)?t:null}function Jo(e){if(!e||e.nodeType!==1||!e.closest||Dn(e)||e.closest(Ze))return null;let t=Fn(e);if(t)return t;let o=e.closest(ur);return o&&!Dn(o)?o:e}var pr=20,mr=40,ln=[],Ko=!0,wt=null;function Xo(e){Ko=!!e}function gr(e){let t=Fn(e);if(t)return t;if(e.localName==="body"||e.localName==="html")return null;let o=re(tt(e));return o&&o.length<=mr?e:null}function fr(e){let t=tt(e);if(t)return t;if(e.labels&&e.labels.length){let o=re(Array.from(e.labels,a=>et(a)).join(" "));if(o)return o}return re(e.getAttribute("placeholder")||e.getAttribute("name")||"")}function hr(e){if(!Ko)return;let t=e.target;if(!t||t.nodeType!==1||t.closest(Ze))return;let o=gr(t);o&&o!==wt&&(wt&&wt.localName==="label"&&(wt.contains(o)||wt.control===o)||(wt=o,ln.push({at:Date.now(),selector:Dt(o),text:Mo(fr(o))}),ln.length>pr&&ln.shift()))}function Qo(){document.addEventListener("click",hr,!0)}function qn(e=Date.now()){return ln.map(t=>({seconds_before:Math.max(0,Math.round((e-t.at)/1e3)),selector:t.selector,text:t.text}))}var qt={};To(qt,{add:()=>Lr,applyRemote:()=>Nr,comments:()=>Wn,hasExported:()=>br,hasUnexportedWork:()=>yr,isSeen:()=>Cr,load:()=>jn,markExported:()=>wr,markSeen:()=>Er,newId:()=>Un,overallNote:()=>Yn,remove:()=>Tr,reviewer:()=>un,seed:()=>Hn,setOverallNote:()=>Ar,setReviewer:()=>$r,storageOk:()=>vr,subscribe:()=>Sr,update:()=>Or});var Zo="gitmargin:";function xr(){let e=String(location.pathname||""),t=0;for(let o=0;o<e.length;o+=1)t=Math.imul(t,31)+e.charCodeAt(o)|0;return(t>>>0).toString(36)}function Un(){let e=new Uint8Array(3);return crypto.getRandomValues(e),`c_${Array.from(e,t=>t.toString(16).padStart(2,"0")).join("")}`}var q={comments:[],reviewer:"",overallNote:"",path:"",seen:[]},zn=null,vr=()=>zn,Bn=`${Zo}unversioned`,dn=!1,br=()=>dn,wr=()=>{dn=!0},yr=()=>(q.comments.length>0||q.overallNote.trim().length>0)&&!dn,Pn=new Set;function kr(){try{q.path=location.pathname||"",localStorage.setItem(Bn,JSON.stringify(q)),zn=!0}catch{zn=!1}}function Ft(){kr(),Pn.forEach(e=>e())}function cn(){dn=!1,Ft()}function jn(e){Bn=`${Zo}${e||"unversioned"}:${xr()}`;try{let t=JSON.parse(localStorage.getItem(Bn)||"null"),o=!t||!t.path||t.path===(location.pathname||"");t&&o&&Array.isArray(t.comments)&&(q.comments=t.comments,q.reviewer=typeof t.reviewer=="string"?t.reviewer:"",q.overallNote=typeof t.overallNote=="string"?t.overallNote:"",q.seen=Array.isArray(t.seen)?t.seen.filter(a=>typeof a=="string"):[])}catch{}}function Hn(e,t,o){let a=new Set(q.comments.map(u=>u.id)),c=(e||[]).filter(u=>u&&u.id&&!a.has(u.id));c.length&&(q.comments=c.concat(q.comments)),!q.reviewer&&t&&(q.reviewer=t),!q.overallNote&&o&&(q.overallNote=o),(c.length||t||o)&&Ft()}function Sr(e){return Pn.add(e),()=>Pn.delete(e)}var Wn=()=>q.comments,un=()=>q.reviewer,Yn=()=>q.overallNote;function $r(e){q.reviewer=String(e||""),Ft()}var Cr=e=>q.seen.includes(e);function Er(e){!e||q.seen.includes(e)||(q.seen.push(e),Ft())}function Ar(e){q.overallNote=String(e||""),cn()}function Lr(e){return q.comments.push(e),cn(),e}function Or(e,t){let o=q.comments.find(a=>a.id===e);return o?(Object.assign(o,t),cn(),o):null}function Tr(e){let t=q.comments.findIndex(o=>o.id===e);return t<0?!1:(q.comments.splice(t,1),cn(),!0)}function Nr({upsert:e=[],drop:t=[]}){if(!e.length&&!t.length)return;let o=new Set(t),a=new Map(q.comments.filter(c=>!o.has(c.id)).map(c=>[c.id,c]));e.forEach(c=>a.set(c.id,c)),q.comments=[...a.values()].sort((c,u)=>String(c.time||"").localeCompare(String(u.time||""))||String(c.id).localeCompare(String(u.id))),Ft()}var pn=null,Gn=null;function Rr(){pn=[],Gn=[];for(let e=2,t=0;t<64;e+=1){let o=!0;for(let a=2;a*a<=e;a+=1)if(e%a===0){o=!1;break}o&&(t<8&&(Gn[t]=Math.pow(e,1/2)*4294967296|0),pn[t]=Math.pow(e,1/3)*4294967296|0,t+=1)}}var De=(e,t)=>e>>>t|e<<32-t;function ei(e){pn||Rr();let t=[];for(let u=0;u<e.length;u+=1)t.push(e.charCodeAt(u)&255);let o=t.length*8;for(t.push(128);t.length%64!==56;)t.push(0);t.push(0,0,0,0,o>>>24&255,o>>>16&255,o>>>8&255,o&255);let a=Gn.slice(0),c=[];for(let u=0;u<t.length;u+=64){for(let C=0;C<16;C+=1)c[C]=t[u+4*C]<<24|t[u+4*C+1]<<16|t[u+4*C+2]<<8|t[u+4*C+3];for(let C=16;C<64;C+=1){let de=De(c[C-15],7)^De(c[C-15],18)^c[C-15]>>>3,K=De(c[C-2],17)^De(c[C-2],19)^c[C-2]>>>10;c[C]=c[C-16]+de+c[C-7]+K|0}let[f,$,_,h,B,se,L,M]=a;for(let C=0;C<64;C+=1){let de=M+(De(B,6)^De(B,11)^De(B,25))+(B&se^~B&L)+pn[C]+c[C]|0,K=(De(f,2)^De(f,13)^De(f,22))+(f&$^f&_^$&_)|0;M=L,L=se,se=B,B=h+de|0,h=_,_=$,$=f,f=de+K|0}[f,$,_,h,B,se,L,M].forEach((C,de)=>{a[de]=a[de]+C|0})}return a.map(u=>`00000000${(u>>>0).toString(16)}`.slice(-8)).join("")}var ti=5e3,ni=3e4,_r=5*6e4,Mr=6e4,Ir=5e3,yt={full:"This prototype has reached its comment limit. Your comment is saved here but not shared.",replies_full:"This comment has reached its reply limit. Your reply is saved here but not shared.",slow_down:"Too many comments are arriving at once. Yours will be shared in a minute.",too_long:"A comment is too long to share. It is saved here; shorten it to share it.",invalid:"A comment could not be shared. It is saved here.",unknown_version:"The comment service does not know this version of the page. Comments are saved here only.",not_found:"The comment service does not know this prototype. Comments are saved here only."},Vn=e=>{let t=new Uint8Array(e);return crypto.getRandomValues(t),Array.from(t,o=>o.toString(16).padStart(2,"0")).join("")},Dr=()=>`r_${Vn(3)}`,Fr=e=>new Date(e).toISOString().replace(/\.\d{3}Z$/,"Z");function oi(e){let t=new Map;return{read(o){try{let a=e().getItem(o);return a?JSON.parse(a):t.get(o)??null}catch{return t.get(o)??null}},write(o,a){t.set(o,a);try{e().setItem(o,JSON.stringify(a))}catch{}}}}function qr(){try{let e=/(?:^#|&)gm_claim=([0-9a-f]{32})(?:&|$)/.exec(window.location.hash);if(!e)return null;let t=window.location.hash.replace(/(^#|&)gm_claim=[0-9a-f]{32}/,"$1").replace(/^#&?$/,"");try{window.history.replaceState(null,"",window.location.pathname+window.location.search+t)}catch{}return e[1]}catch{return null}}function zr(e,t){let o=new URL(e.service).origin;try{if(!t||!/^https?:$/.test(t.protocol)||!t.origin||t.origin==="null")return o;let a=/^\/p\/([^/]+)\/(latest|v\d{1,4}-[0-9a-f]{6})$/.exec(t.pathname);if(a&&decodeURIComponent(a[1])===e.key)return t.origin}catch{}return o}function Br(e){let t=String(e||"").toLowerCase();return t.endsWith(".github.io")||t.endsWith(".gitlab.io")}function ii({stamp:e,store:t,fetchImpl:o=(...L)=>fetch(...L),now:a=()=>Date.now(),timers:c={set:(L,M)=>setTimeout(L,M),clear:L=>clearTimeout(L)},isHidden:u=()=>typeof document<"u"&&document.visibilityState==="hidden",onVisible:f=L=>typeof document<"u"&&document.addEventListener("visibilitychange",L),storage:$=null,openWindow:_=L=>window.open(L,"gitmargin-signin","popup,width=520,height=680"),takeArrivalCode:h=qr,sharedStorage:B=()=>typeof location<"u"&&(location.protocol==="file:"||Br(location.hostname)),pageLocation:se=()=>typeof location>"u"?null:{protocol:location.protocol,pathname:location.pathname,origin:typeof self<"u"&&typeof self.origin=="string"?self.origin:"null"}}){if(!e||!e.service||!e.key||!e.versionId)return null;let L,M;try{let l=new URL(e.service);if(!/^https?:$/.test(l.protocol))return null;M=zr(e,se()),L=`${M}/api/p/${encodeURIComponent(e.key)}/comments`}catch{return null}let C=oi(()=>$||localStorage),de=`gitmargin:token:${e.key}`,K=`gitmargin:sync:${e.key}:${e.versionId}`,z=C.read(de);(typeof z!="string"||z.length<16)&&(z=Vn(16),C.write(de,z));let Ae=`gitmargin:pass:${e.key}`,Z={mode:"none",read:"open",members:null},nt=B()?oi(()=>{throw new Error("tab only")}):C,R=nt.read(Ae);(!R||typeof R.pass!="string"||!(Date.parse(R.expires)>a()))&&(R=null);let P={state:"idle",code:null,shortCode:null,who:null,timer:null,started:0},J=()=>Z.mode!=="none"&&!R;function G(l){let x={mode:l&&typeof l.identity=="string"?l.identity:"none",read:l&&l.read==="members"?"members":"open",members:l&&typeof l.members=="string"?l.members:null};x.mode===Z.mode&&x.read===Z.read&&x.members===Z.members||(Object.assign(Z,x),we())}function be(){R&&(R=null,nt.write(Ae,null),we())}let W=C.read(K)||{},O=Array.isArray(W.ops)?W.ops:[],ne=new Set(Array.isArray(W.synced)?W.synced:[]),ee=new Set(Array.isArray(W.mine)?W.mine:[]),F=W.rejected&&typeof W.rejected=="object"?W.rejected:{},Q=()=>C.write(K,{ops:O,synced:[...ne],mine:[...ee],rejected:F}),Fe=new Set,oe={state:"connecting",problem:null,versions:[],latest:null},we=()=>Fe.forEach(l=>l());function ye(l){let m=JSON.stringify(oe);Object.assign(oe,l),JSON.stringify(oe)!==m&&we()}let Ge=null,I=null,Le=!1,ie=!1,ue=0,Oe=a(),ce=l=>t.comments().find(m=>m.id===l)||null;function Te(l){for(let m of t.comments()){if(m.id===l)return m.author||null;let x=(m.replies||[]).find(b=>b.id===l);if(x)return x.author||null}return null}let pe=()=>R?{name:R.identity.name,provider:R.identity.provider,username:R.identity.username,verified:!0}:{name:t.reviewer()||""},Pt=1e3,Ut=600*1e3,ct=20*1e3;function Ve(l,m=null){P.timer!==null&&c.clear(P.timer),Object.assign(P,{timer:null,code:null,state:l,who:m,shortCode:l==="waiting"?P.shortCode:null}),we()}function ut(){let l=P.code;P.timer=c.set(async()=>{if(P.timer=null,P.code!==l)return;if(a()-P.started>Ut)return Ve("failed");let m=null,x=0;try{let b=await o(`${L.replace(/\/comments$/,"")}/auth/claim`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:l})});x=b.status,m=await b.json()}catch{}if(P.code===l){if(x===200&&m&&m.member===!0&&typeof m.pass=="string"){R={pass:m.pass,expires:m.expires,identity:m.identity||{}},nt.write(Ae,R),Ve("idle"),Se();return}return x===200&&m&&m.member===!1?Ve("not_member",{...m.identity||{},members:m.members||null}):x===404&&a()-P.started<ct?ut():x===404||x===400?Ve("failed"):ut()}},Pt)}let pt=l=>O.filter(m=>m.id===l),ot=(l,m)=>O.some(x=>x.id===l&&x.op===m);function me(l){O.push(l),Oe=a(),Q(),Se()}async function ke(l,m,x){let b=R?R.pass:null,S=await o(m,{method:l,headers:{"content-type":"application/json",...l==="GET"?{}:{"x-gitmargin-token":z},...b?{"x-gitmargin-pass":b}:{}},body:x===void 0?void 0:JSON.stringify(x)}),j=null;try{j=await S.json()}catch{}if(!S.ok&&!(j&&typeof j.error=="string"))throw new Error("unreadable answer");return{ok:S.ok,status:S.status,answer:j,carried:b}}function kt(l){R&&R.pass===l.carried&&be()}function Ne(l){return{version_id:e.versionId,author:{name:l.author&&l.author.name||t.reviewer()||""},comment:{id:l.id,time:l.time,intent:l.intent,anchor:l.anchor,state:l.state}}}async function it(l){let m=ce(l.id),x=`${L}/${l.id}`,b;if(l.op==="add"){if(!m)return"drop";b=await ke("POST",L,Ne(m))}else if(l.op==="edit"){if(!m)return"drop";b=await ke("PATCH",x,{intent:m.intent})}else if(l.op==="delete")b=await ke("DELETE",x);else if(l.op==="reply-add")b=await ke("POST",`${x}/replies`,l.reply);else if(l.op==="reply-edit"){let T=m&&(m.replies||[]).find(Y=>Y.id===l.rid);if(!T)return"drop";b=await ke("PATCH",`${x}/replies/${l.rid}`,{text:T.text})}else if(l.op==="reply-delete")b=await ke("DELETE",`${x}/replies/${l.rid}`);else return"drop";if(b.ok)return ne.add(l.id),"done";let S=b.answer.error;if(S==="sign_in")return G({identity:b.answer.provider,read:Z.read,members:Z.members}),kt(b),"later";if(S==="id_taken"&&(l.op==="add"||l.op==="reply-add"))return ne.add(l.id),ee.delete(l.op==="add"?l.id:l.rid),"drop";if(S==="slow_down"||S==="service_unavailable")return ye({problem:yt[S]||null}),"later";if(S==="not_found"&&l.op!=="add"&&l.op!=="reply-add")return"drop";l.op!=="delete"&&l.op!=="reply-delete"&&(F[l.rid||l.id]=S);let j=l.op==="reply-add"||l.op==="reply-edit";return ye({problem:(j&&S==="full"?yt.replies_full:yt[S])||yt.invalid}),"drop"}async function rt(){if(J())return O.length===0;for(;O.length;){let l=O[0];if(l.tried=!0,await it(l)==="later")return!1;let x=O.indexOf(l);x>=0&&O.splice(x,1),Q()}return!0}function qe(l,m){let x=[],b=[],S=new Set;for(let T of l.comments||[]){if(!T||typeof T.id!="string")continue;if(S.add(T.id),T.deleted){b.push(T.id),ne.delete(T.id);for(let D=O.length-1;D>=0;D-=1)O[D].id===T.id&&O.splice(D,1);continue}ne.add(T.id);let Y=ce(T.id),Be={...T};Y&&(ot(T.id,"edit")||F[T.id])&&(Be.intent=Y.intent);let $e=Array.isArray(T.replies)?[...T.replies]:[];for(let D of pt(T.id)){if(D.op==="reply-add"&&!$e.some(ae=>ae.id===D.rid)&&$e.push({...D.reply,time:D.time,updated:D.time}),D.op==="reply-delete"){let ae=$e.findIndex(Ue=>Ue.id===D.rid);ae>=0&&$e.splice(ae,1)}if(D.op==="reply-edit"&&Y){let ae=(Y.replies||[]).find(ft=>ft.id===D.rid),Ue=$e.find(ft=>ft.id===D.rid);ae&&Ue&&(Ue.text=ae.text)}}for(let D of Y&&Y.replies||[]){if(!F[D.id])continue;let ae=$e.find(Ue=>Ue.id===D.id);ae?ae.text=D.text:$e.push(D)}Be.replies=$e,!(Y&&JSON.stringify(Y)===JSON.stringify(Be))&&!ot(T.id,"delete")&&x.push(Be)}if(m){for(let T of t.comments())ne.has(T.id)&&!S.has(T.id)&&(b.push(T.id),ne.delete(T.id));for(let T of t.comments())S.has(T.id)||ne.has(T.id)||F[T.id]||ot(T.id,"add")||(ee.add(T.id),O.push({op:"add",id:T.id}),ie=!0)}(x.length||b.length)&&(Oe=a()),t.applyRemote({upsert:x,drop:b});let j=Date.parse(l.server_time);Number.isNaN(j)||(Ge=new Date(j-Ir).toISOString()),Q(),G(l.prototype),ye({versions:Array.isArray(l.versions)?l.versions:[],latest:l.latest||null})}async function St(){if(Le){ie=!0;return}Le=!0;try{let l=await rt(),m=Ge===null,x=`${L}?version=${encodeURIComponent(e.versionId)}${m?"":`&since=${encodeURIComponent(Ge)}`}`,b=await ke("GET",x);!b.ok&&b.answer.error==="sign_in"?(G({identity:b.answer.provider,read:"members",members:Z.members}),kt(b),Ge=null,ue=0,R||ye({state:"locked",problem:null})):b.ok?(qe(b.answer,m),ue=0,ye({state:"shared",problem:l?Object.keys(F).length?oe.problem:null:oe.problem})):(ue+=1,ye({state:"offline",problem:yt[b.answer.error]||yt.not_found}))}catch{ue+=1,ye({state:"offline"})}finally{Le=!1,Je(),ie&&(ie=!1,Se())}}function ze(){return ue>0?Math.min(ti*2**ue,Mr):oe.state==="locked"||a()-Oe>=_r?ni:ti}function Je(){I!==null&&c.clear(I),I=null,!u()&&(I=c.set(()=>{I=null,St()},ze()))}function Se(){I!==null&&c.clear(I),I=null,St()}f(()=>{u()?(I!==null&&c.clear(I),I=null):Se()});async function mt(l){try{let m=await o(`${L.replace(/\/comments$/,"")}/auth/claim`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:l})}),x=await m.json();m.status===200&&x&&x.member===!0&&typeof x.pass=="string"&&(R={pass:x.pass,expires:x.expires,identity:x.identity||{}},nt.write(Ae,R))}catch{}}Q();let gt=h();return gt?mt(gt).then(Se):Se(),{subscribe(l){return Fe.add(l),()=>Fe.delete(l)},view:()=>({...oe,unsent:O.length,isLatest:!oe.latest||oe.latest===e.versionId,identity:{...Z},session:R?{...R.identity}:null,signin:{state:P.state,shortCode:P.shortCode,who:P.who}}),isMine(l){let m=Te(l);return m&&m.verified===!0?ee.has(l)||!!(R&&R.identity.provider===m.provider&&R.identity.username===m.username):ee.has(l)},signIn(){if(Z.mode==="none"||P.state==="waiting")return;let l=Vn(16),m=ei(l),x=_(`${M}/auth/start?key=${encodeURIComponent(e.key)}&code_hash=${m}`),b=String(parseInt(m.slice(0,8),16)%1e4).padStart(4,"0");Object.assign(P,{code:l,shortCode:`${b.slice(0,2)}-${b.slice(2)}`,who:null,started:a()}),P.state=x?"waiting":"blocked",we(),x&&ut()},cancelSignIn(){Ve("idle")},async signOut(){if(!R)return;let l=R.pass;be();try{await o(`${L.replace(/\/comments$/,"")}/auth/session`,{method:"DELETE",headers:{"x-gitmargin-pass":l}})}catch{}},isUnshared:l=>!!F[l]||O.some(m=>m.op==="add"&&m.id===l||m.op==="reply-add"&&m.rid===l),versionId:e.versionId,async loadVersion(l){try{let m=await ke("GET",`${L}?version=${encodeURIComponent(l)}`);return m.ok?(m.answer.comments||[]).filter(x=>x&&!x.deleted):null}catch{return null}},pageUrl:l=>`${M}/p/${encodeURIComponent(e.key)}/${encodeURIComponent(l)}`,add(l){let m=t.add({...l,author:pe(),replies:[],version_id:e.versionId});return ee.add(m.id),me({op:"add",id:m.id}),m},update(l,m){let x=t.update(l,m);if(!x)return x;let b=O.find(S=>S.op==="add"&&S.id===l);return delete F[l],!b&&!ne.has(l)?me({op:"add",id:l}):!b||b.tried?me({op:"edit",id:l}):Q(),x},remove(l){if(!t.remove(l))return!1;let x=O.find(S=>S.op==="add"&&S.id===l),b=!!x&&!x.tried;for(let S=O.length-1;S>=0;S-=1)O[S].id===l&&O.splice(S,1);return delete F[l],b?Q():me({op:"delete",id:l}),!0},addReply(l,m){let x=ce(l);if(!x)return null;let b=Fr(a()),S={id:Dr(),text:String(m),author:pe()};return t.applyRemote({upsert:[{...x,replies:[...x.replies||[],{...S,time:b,updated:b}]}]}),ee.add(S.id),me({op:"reply-add",id:l,rid:S.id,reply:S,time:b}),S},editReply(l,m,x){let b=ce(l);if(!b)return!1;let S=(b.replies||[]).map(Y=>Y.id===m?{...Y,text:String(x)}:Y);t.applyRemote({upsert:[{...b,replies:S}]});let j=O.find(Y=>Y.op==="reply-add"&&Y.rid===m),T=!!F[m];if(delete F[m],j&&(j.reply={...j.reply,text:String(x)}),j&&!j.tried)Q(),Se();else if(!j&&T){let Y=S.find(Be=>Be.id===m);me({op:"reply-add",id:l,rid:m,reply:{id:m,text:String(x),author:Y.author},time:Y.time})}else me({op:"reply-edit",id:l,rid:m});return!0},removeReply(l,m){let x=ce(l);if(!x)return!1;t.applyRemote({upsert:[{...x,replies:(x.replies||[]).filter(j=>j.id!==m)}]});let b=O.findIndex(j=>j.op==="reply-add"&&j.rid===m),S=!!F[m];return delete F[m],b>=0&&!O[b].tried?(O.splice(b,1),Q()):S&&b<0?Q():(b>=0&&O.splice(b,1),me({op:"reply-delete",id:l,rid:m})),!0},debug:()=>({delay:ze(),ops:O.map(l=>({...l})),since:Ge,token:z}),stop(){I!==null&&c.clear(I),I=null}}}var Qn={};To(Qn,{FORMAT_VERSION:()=>zt,copy:()=>Hr,download:()=>jr,embeddedComments:()=>Kn,embeddedJson:()=>ai,embeddedReviewer:()=>Xn,envelope:()=>Bt,markdown:()=>mn,nounFor:()=>si,reviewedFileName:()=>Jn,reviewedHtml:()=>gn});var zt="0.1",Pr=(e=new Date)=>e.toISOString().replace(/\.\d{3}Z$/,"Z"),Ee=e=>String(e??"").replace(/\r\n|[\r\n\u2028\u2029]/g," ").trim(),Ur={button:"button",a:"link",input:"field",select:"field",textarea:"field",img:"image",label:"label"};function si(e){let o=(String(e||"").split(">").pop().trim().match(/^[a-z][a-z0-9]*/i)||[""])[0].toLowerCase();return/^h[1-6]$/.test(o)?"heading":Ur[o]||"element"}function Kn(){let e=document.getElementById("gitmargin-comments");if(!e)return[];try{let t=JSON.parse(e.textContent||"null");return t&&Array.isArray(t.comments)?t.comments:[]}catch{return[]}}function Xn(){let e=document.getElementById("gitmargin-comments");if(!e)return{name:"",note:""};try{let t=JSON.parse(e.textContent||"null")||{};return{name:t.reviewer&&t.reviewer.name||"",note:t.overall_note||""}}catch{return{name:"",note:""}}}function ri(e,t){let o=e&&typeof e.name=="string"&&e.name?e.name:t;return e&&e.verified===!0&&typeof e.provider=="string"&&e.provider?{name:o,provider:e.provider,username:typeof e.username=="string"?e.username:"",verified:!0}:{name:o}}function Bt(){return{gitmargin:zt,file:He.file,version_id:He.versionId,exported_at:Pr(),reviewer:{name:un()||null},viewport:{width:window.innerWidth,height:window.innerHeight},overall_note:Yn()||null,comments:Wn().map(e=>({id:e.id,time:e.time,intent:{text:e.intent.text,tag:e.intent.tag||null},anchor:e.anchor,state:e.state,status:e.status||"open",replies:(e.replies||[]).map(t=>({id:t.id||null,time:t.time||null,author:ri(t.author,null),text:String(t.text||"")})),...e.author&&typeof e.author.name=="string"?{author:ri(e.author,null)}:{}}))}}function ai(){return JSON.stringify(Bt(),null,2).replace(/</g,"\\u003c")}function mn(){let e=Bt(),t=`${e.exported_at.slice(0,10)} ${e.exported_at.slice(11,16)} UTC`,o=[`gitmargin batch v${zt} | ${Ee(e.file)||"unknown file"} | ${Ee(e.version_id)||"no version id"}`,`Reviewer: ${Ee(e.reviewer.name)||"not given"}. Viewport ${e.viewport.width}x${e.viewport.height}. Exported ${t}.`],a=e.comments.map((u,f)=>{let $=u.intent.tag?`[${Ee(u.intent.tag)}] `:"",_=[],h=u.state.screen&&Ee(u.state.screen.name),B=h?`On "${h}"${u.state.hash?` (${Ee(u.state.hash)})`:""}`:"On this page";_.push(B);let se=(u.state.trail||[]).map(Ae=>Ee(Ae.text)).filter(Boolean);se.length&&_.push(`after clicking ${se.join(", ")}`);let L=u.anchor.quote&&Ee(u.anchor.quote.exact),M=si(u.anchor.tag||u.anchor.selector),C=L?`the "${L}" ${M}`:`the ${M}`,de=u.anchor.selector?` (${Ee(u.anchor.selector)})`:"",K=an(u.anchor,u.state.screen),z=K.status==="orphaned"?" [orphaned: spot not found]":K.via==="ancestor"||K.via==="quote-loose"?" [nearby: the exact element was not found, this is the closest match]":"";return`${f+1}. ${$}${_.join(", ")}: ${C}${de}${z}.
   "${Ee(u.intent.text)}"`}),c=e.overall_note?[`Overall: ${Ee(e.overall_note)}`]:[];return[o.join(`
`),a.join(`

`),c.join("")].filter(Boolean).join(`

`)}function gn(){let e=nn().replace(/[ \t]*<script\b[^>]*\bid=["']gitmargin-comments["'][^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi,(c,u)=>{try{let f=JSON.parse(u);return f&&Array.isArray(f.comments)?"":c}catch{return c}}),t=`<script type="application/json" id="gitmargin-comments">
${ai()}
<\/script>
`,o=-1,a=/<\/body\s*>/gi;for(let c=a.exec(e);c;c=a.exec(e))o=c.index;return o<0?e+t:e.slice(0,o)+t+e.slice(o)}function Jn(){let e=(He.file||"").replace(/\.x?html?$/i,""),t=String(un()||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,24).replace(/-+$/,"");return`${e||"prototype"}.reviewed${t?`.${t}`:""}.html`}function jr(){let e=new Blob([gn()],{type:"text/html;charset=utf-8"}),t=URL.createObjectURL(e),o=document.createElement("a");return o.href=t,o.download=Jn(),o.style.display="none",document.body.appendChild(o),o.click(),o.remove(),setTimeout(()=>URL.revokeObjectURL(t),1e4),Jn()}async function Hr(){let e=mn();try{return await navigator.clipboard.writeText(e),{ok:!0,text:e}}catch{try{let t=document.createElement("textarea");t.value=e,t.setAttribute("readonly",""),t.style.cssText="position:fixed;top:-1000px;opacity:0",document.body.appendChild(t),t.select();let o=document.execCommand("copy");return t.remove(),{ok:o,text:e}}catch{return{ok:!1,text:e}}}}var li=`/* Marker on a light prototype, Graphite on a dark one (issue #21).

   The overlay is drawn the way the comment tools people already use draw
   theirs: a pin with initials at the spot, the thread opening right there, a
   list on demand, and one small floating chrome for the controls. One accent,
   one colour per person, real shadows so a card reads as a layer over any
   page, and the same 13px system type as before.

   Which of the two token sets applies is MEASURED from the page's own ground
   (src/overlay/theme.js), never taken from the browser's colour-scheme
   preference: the pins sit on the prototype, and a dark prototype is dark on
   a light-mode machine too. \`gm-dark\` on the host switches the set.

   Everything lives inside a shadow root, so the prototype's CSS cannot reach in
   and ours cannot reach out. \`all: initial\` on the host blocks the inherited
   properties (font, color, line-height) that would otherwise cross the boundary. */

:host {
  all: initial;
  --gm-accent: #7c3aed;                    /* fills: the armed button, the send arrow */
  --gm-accent-ink: #7c3aed;                /* lines and text in the accent: frame, ring, underline */
  --gm-accent-soft: rgba(124, 58, 237, 0.12);
  --gm-surface: #ffffff;                   /* a card, the sheet, the chrome */
  --gm-surface-2: #f4f4f6;                 /* a hovered row, a field's ground */
  --gm-text: #1e1e1e;
  --gm-muted: #6b6b6b;
  --gm-line: #e7e7ea;                      /* decorative dividers only */
  /* The boundary of anything a person operates: a field, a chip, a button.
     WCAG 1.4.11 asks 3:1 for that (review R26 of the #3 cycle). */
  --gm-field-line: rgba(30, 30, 30, 0.5);
  --gm-ring: #ffffff;                      /* the ring around a pin, the frame's outer line */
  --gm-ring-width: 1px;                    /* the frame's outer line: one hairline on light, two on dark */
  --gm-neutral: #6b7280;                   /* the chip of a person with no name */
  --gm-danger: #e5484d;                    /* the unread dot */
  --gm-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  --gm-shadow-soft: 0 2px 14px rgba(0, 0, 0, 0.16);
  --gm-pin-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);

  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;                    /* the page keeps its clicks; our own bits opt back in */
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--gm-text);
  -webkit-font-smoothing: antialiased;
}

/* Graphite: the same overlay on a dark page. Surfaces go near-black with light
   type, the accent lightens so it still reads as text, and the ring around a
   pin and the frame's outer line go light and one pixel wider, which is what
   keeps a pin from vanishing into a dark prototype. */
:host(.gm-dark) {
  --gm-accent-ink: #b39cf7;
  --gm-accent-soft: rgba(179, 156, 247, 0.18);
  --gm-surface: #1f1f23;
  --gm-surface-2: #2a2a30;
  --gm-text: #f4f4f5;
  --gm-muted: #a1a1aa;
  --gm-line: #35353c;
  --gm-field-line: rgba(244, 244, 245, 0.5);
  --gm-ring: #f4f4f5;
  --gm-ring-width: 2px;
  --gm-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  --gm-shadow-soft: 0 2px 14px rgba(0, 0, 0, 0.45);
  --gm-pin-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

/* Comment mode is a modal state layered over someone else's page: every click
   goes to the overlay instead of the prototype. This edge is the one cue that
   is visible wherever the reviewer looks. */
:host(.gm-armed)::after {
  content: '';
  position: fixed;
  inset: 0;
  border: 2px solid var(--gm-accent-ink);
  opacity: 0.4;
  pointer-events: none;
}

/* As a popover the root joins the top layer, so the overlay stays reachable
   when the prototype opens a modal <dialog>. Popovers come with a border,
   padding and a background of their own; all three go. */
:host(:popover-open) { border: 0; padding: 0; margin: 0; background: transparent; width: auto; height: auto; }

* { box-sizing: border-box; }
[hidden] { display: none !important; }

/* One focus rule for the whole overlay. The fields below replace the browser
   ring with a hue change, which is not a perceivable indicator on its own
   (review R18 and the R19 split note); this restores a real one for keyboard
   use without bringing rings back for the mouse. The pair below is the
   fallback for an engine that runs the bundle but cannot parse the rule after
   it (:where() needs Chrome 88, :focus-visible needs Safari 15.4). */
button:focus, input:focus, textarea:focus, [tabindex]:focus, a:focus {
  outline: 2px solid var(--gm-accent-ink);
  outline-offset: 2px;
  border-radius: 6px;
}
button:focus:not(:focus-visible), input:focus:not(:focus-visible),
textarea:focus:not(:focus-visible), [tabindex]:focus:not(:focus-visible), a:focus:not(:focus-visible) {
  outline: none;
}
:where(button, input, textarea, [tabindex], a):focus-visible {
  outline: 2px solid var(--gm-accent-ink);
  outline-offset: 2px;
  border-radius: 6px;
}
button { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; padding: 0; }
input, textarea { font: inherit; color: inherit; }
.gm-icon { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }

/* ---------- pins ---------- */

/* A teardrop with its point at the bottom left, sitting on the spot: initials
   on the author's colour, a ring in the page's ground colour, a shadow. The
   selected one grows from its point, so the point stays where it was. */
.gm-pin {
  position: fixed;
  width: 26px;
  height: 26px;
  border-radius: 50% 50% 50% 4px;
  background: var(--gm-author, var(--gm-neutral));
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--gm-ring);
  box-shadow: var(--gm-pin-shadow);
  pointer-events: auto;
  transform-origin: 0 100%;
  transition: transform 120ms ease;
  animation: gm-pin-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1.25);
}
/* Where the point is says where the spot is: bottom left by default (the pin
   hangs up and to the right of its spot), bottom right for a pin in the left
   gutter, and the top corners when the pin had to go below the spot. */
.gm-pin.is-left { border-radius: 50% 50% 4px 50%; transform-origin: 100% 100%; }
.gm-pin.is-below { border-radius: 4px 50% 50% 50%; transform-origin: 0 0; }
.gm-pin.is-below.is-left { border-radius: 50% 4px 50% 50%; transform-origin: 100% 0; }
.gm-pin:hover, .gm-pin.is-hot { transform: scale(1.12); }
.gm-pin.is-selected { transform: scale(1.22); box-shadow: 0 0 0 3px var(--gm-accent-soft), var(--gm-pin-shadow); }

@keyframes gm-pin-in {
  from { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.1); }
  to   { transform: scale(1); opacity: 1; }
}

/* The frame around the element a comment is about: drawn, never written into
   the page. The outer line in the ground colour is what keeps it readable on
   a page whose colour nobody chose (review R8 of the #10 cycle). */
.gm-frame {
  position: fixed;
  border: 1px solid var(--gm-accent-ink);
  border-radius: 4px;
  box-shadow: 0 0 0 3px var(--gm-accent-soft);
  pointer-events: none;
  outline: var(--gm-ring-width) solid var(--gm-ring);
}
/* From the frame to the thread beside it, when a gap is left between them. */
.gm-tie { position: fixed; height: 1px; background: var(--gm-accent-ink); opacity: 0.5; pointer-events: none; }
/* The same frame, drawn BEFORE the click around what the click would attach
   to (issue #10). Same stroke, same offset, so the preview and the selected
   comment's frame are one mark at two moments. */
.gm-target[hidden] { display: none; }

/* From a pin's point to the spot it had to step away from: a line, drawn from
   its left end and turned to meet the spot. */
.gm-leader { position: fixed; height: 2px; background: var(--gm-accent-ink); opacity: 0.55; pointer-events: none; transform-origin: 0 50%; }
.gm-underline { position: fixed; height: 2px; background: var(--gm-accent-ink); opacity: 0.5; pointer-events: none; }

/* ---------- the chrome ---------- */

/* One pill, top right, where the comment tools people already use keep theirs.
   It floats over the page rather than pushing it down, because the page is
   someone else's. When the sheet is open the pill moves left, out of its way. */
.gm-bar {
  position: fixed;
  z-index: 3;
  top: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--gm-surface);
  border-radius: 999px;
  box-shadow: var(--gm-shadow-soft);
  pointer-events: auto;
  transition: right 150ms ease;
}
.gm-bar.is-shifted { right: 336px; }
.gm-bar > button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  min-width: 30px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--gm-text);
  white-space: nowrap;
}
.gm-bar > button:hover { background: var(--gm-surface-2); }
.gm-switch { padding-right: 12px; }
/* Armed: a tint, not a fill. Send to author is the one solid accent on the page. */
.gm-switch.is-on { background: var(--gm-accent-soft); color: var(--gm-accent-ink); font-weight: 600; }
.gm-switch.is-on:hover { background: var(--gm-accent-soft); }
.gm-badge { font-weight: 600; font-variant-numeric: tabular-nums; position: relative; }
.gm-badge .dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--gm-danger);
  border: 1.5px solid var(--gm-surface);
}
.gm-id { padding: 0 2px; }
.gm-id.is-text { padding: 0 12px; }
.gm-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--gm-author, var(--gm-neutral));
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  display: inline-grid;
  place-items: center;
  flex: none;
}
.gm-spacer { flex: 1; }

/* One line under the pill: where Send is, that the service is down, that a
   newer version exists. Hidden while the sheet is open, since the sheet says it. */
.gm-notice {
  position: fixed;
  z-index: 1;
  top: 52px;
  right: 16px;
  max-width: 320px;
  padding: 6px 10px;
  background: var(--gm-surface);
  color: var(--gm-muted);
  border-radius: 8px;
  box-shadow: var(--gm-shadow-soft);
  font-size: 12px;
  text-align: left;
  pointer-events: auto;
  transition: right 150ms ease;
}
.gm-notice:hover { color: var(--gm-text); }
.gm-notice.is-shifted { right: 336px; }

/* ---------- popovers under the chrome: identity, menu, preview ---------- */

.gm-pop {
  position: fixed;
  z-index: 2;
  top: 52px;
  right: 16px;
  width: 300px;
  padding: 12px 14px;
  background: var(--gm-surface);
  border-radius: 12px;
  box-shadow: var(--gm-shadow);
  pointer-events: auto;
  transition: right 150ms ease;
}
.gm-pop.is-shifted { right: 336px; }

.gm-preview {
  position: fixed;
  width: 220px;
  padding: 8px 10px;
  background: var(--gm-surface);
  border-radius: 8px;
  box-shadow: var(--gm-shadow);
  font-size: 12px;
  pointer-events: none;
}
.gm-preview b { display: block; font-weight: 600; }
.gm-preview span { color: var(--gm-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- the thread, at the spot ---------- */

.gm-thread {
  position: fixed;
  width: 300px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--gm-surface);
  border-radius: 12px;
  box-shadow: var(--gm-shadow);
  pointer-events: auto;
}
.gm-thread-ctx {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 0;
  color: var(--gm-muted);
  font-size: 12px;
}
.gm-thread-ctx .where { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Where the comment is: the number and the screen lead, the quoted words follow. */
.gm-thread-ctx b, .gm-thread-ctx .gm-screen { color: var(--gm-text); font-weight: 600; }
.gm-thread-ctx .gm-screen::before, .gm-thread-ctx .gm-quote::before { content: '\\00b7'; margin: 0 5px; color: var(--gm-muted); font-weight: 400; }
.gm-thread-ctx b { color: var(--gm-text); font-weight: 700; margin-right: 6px; }
/* The caret on the thread's edge, level with its pin, when the thread sits beside the element. */
.gm-thread.is-beside::before {
  content: '';
  position: absolute;
  left: -6px;
  top: var(--gm-caret, 20px);
  width: 12px;
  height: 12px;
  margin-top: -6px;
  background: var(--gm-surface);
  transform: rotate(45deg);
  border-radius: 2px;
  box-shadow: -2px 2px 4px rgba(0, 0, 0, 0.06);
}
.gm-thread-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 14px 12px; }
.gm-thread-foot { flex: none; padding: 0 14px 12px; }
.gm-thread-foot:empty { display: none; }
.gm-thread-foot .gm-reply-btn { color: var(--gm-accent-ink); font-weight: 600; font-size: 12px; padding: 2px 0; }
.gm-reply-write .gm-reply-row { margin-top: 0; }

.gm-meta { color: var(--gm-muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
/* A dot between the parts of a meta line, so a screen name and a time never run together. */
.gm-meta > * + *:not(.gm-flag):not(.gm-status)::before { content: '\\00b7'; margin-right: 6px; color: var(--gm-muted); font-weight: 400; }
.gm-who-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; min-width: 0; }
.gm-who-row .gm-avatar { width: 20px; height: 20px; font-size: 9px; }
.gm-who-row .gm-meta { flex: 1; min-width: 0; flex-wrap: nowrap; overflow: hidden; }
.gm-who-row .gm-meta > * { white-space: nowrap; }
.gm-author { color: var(--gm-text); font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
.gm-handle { overflow: hidden; text-overflow: ellipsis; }
.gm-time { flex: none; }
.gm-tag { color: var(--gm-accent-ink); font-size: 10px; letter-spacing: 0.07em; text-transform: uppercase; font-weight: 600; }
.gm-flag { color: var(--gm-muted); border: 1px solid var(--gm-line); border-radius: 4px; padding: 0 5px; font-size: 10px; }
/* A status is information, not an alert: the accent, small caps. */
.gm-status { color: var(--gm-accent-ink); border: 1px solid var(--gm-accent-ink); border-radius: 999px; padding: 0 7px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; flex: none; }
.gm-text { margin: 3px 0 0 28px; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.gm-card-actions { display: flex; gap: 12px; margin: 6px 0 0 28px; }
.gm-card-actions button { color: var(--gm-muted); font-size: 11px; padding: 2px 0; }
.gm-card-actions button:hover { color: var(--gm-accent-ink); }
/* Reply is the action a thread is for; Edit and Delete are the quiet ones beside
   it, shown when the pointer or the keyboard is in the thread. */
.gm-card-actions .gm-reply-btn { color: var(--gm-accent-ink); font-weight: 600; font-size: 12px; }
.gm-card-actions .gm-quiet { opacity: 0; transition: opacity 120ms ease; }
.gm-thread:hover .gm-quiet, .gm-thread:focus-within .gm-quiet { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .gm-card-actions .gm-quiet { transition: none; } }
.gm-card-actions .gm-del[data-armed='yes'] { color: var(--gm-accent-ink); font-weight: 600; }
.gm-thread textarea, .gm-box textarea, .gm-foot textarea {
  width: 100%;
  min-height: 62px;
  background: var(--gm-surface-2);
  color: var(--gm-text);
  border: 1px solid var(--gm-field-line);
  border-radius: 8px;
  padding: 7px 9px;
  resize: vertical;
  outline: none;
}
.gm-thread textarea { margin: 6px 0 0 28px; width: calc(100% - 28px); }
.gm-thread textarea:focus, .gm-box textarea:focus, .gm-foot textarea:focus { border-color: var(--gm-accent-ink); }
textarea::placeholder, input::placeholder { color: var(--gm-muted); }

.gm-replies { margin: 8px 0 0 28px; padding-left: 10px; border-left: 2px solid var(--gm-line); }
.gm-reply + .gm-reply { margin-top: 6px; }
.gm-reply .gm-who-row { margin-top: 2px; }
.gm-reply .gm-text { font-size: 12.5px; }
.gm-reply .gm-card-actions { margin-top: 3px; }
.gm-reply-ask { margin-top: 8px; }
.gm-reply-ask .gm-reply-field { width: 100%; }
.gm-reply-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.gm-reply-field {
  flex: 1;
  min-width: 0;
  background: var(--gm-surface-2);
  color: var(--gm-text);
  border: 1px solid var(--gm-field-line);
  border-radius: 8px;
  padding: 6px 10px;
  outline: none;
}
.gm-reply-field:focus { border-color: var(--gm-accent-ink); }
.gm-reply-row button { color: var(--gm-muted); font-size: 11px; }
.gm-reply-row .gm-reply-send { color: var(--gm-accent-ink); font-weight: 600; }
.gm-boxwarn { color: var(--gm-accent-ink); font-size: 11px; margin-top: 7px; }
.gm-boxwarn:empty { display: none; }

/* ---------- the sheet: every comment, on demand ---------- */

.gm-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  display: flex;
  flex-direction: column;
  background: var(--gm-surface);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}
.gm-sheet-head { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px 10px; }
.gm-sheet-title { display: flex; align-items: center; gap: 10px; }
.gm-section { display: flex; align-items: baseline; gap: 6px; font-weight: 700; font-size: 14px; }
.gm-section .count { color: var(--gm-muted); font-weight: 500; font-variant-numeric: tabular-nums; }
.gm-close { color: var(--gm-muted); width: 26px; height: 26px; border-radius: 6px; font-size: 14px; display: grid; place-items: center; }
.gm-close:hover { background: var(--gm-surface-2); color: var(--gm-text); }
.gm-filters { display: flex; gap: 6px; padding: 0 16px 10px; }
.gm-filter { padding: 3px 10px; border-radius: 999px; border: 1px solid var(--gm-line); color: var(--gm-muted); font-size: 12px; }
.gm-filter:hover { border-color: var(--gm-field-line); color: var(--gm-text); }
.gm-filter.is-on { background: var(--gm-accent-soft); color: var(--gm-accent-ink); border-color: transparent; font-weight: 600; }

.gm-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; border-top: 1px solid var(--gm-line); }
.gm-group {
  padding: 10px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--gm-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.gm-group + .gm-card { margin-top: 2px; }
.gm-card {
  display: flex;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  position: relative;
}
.gm-card:hover, .gm-card.is-hot { background: var(--gm-surface-2); }
.gm-card.is-selected { background: var(--gm-surface-2); box-shadow: inset 3px 0 0 var(--gm-accent-ink); }
.gm-card .num { flex: none; width: 16px; color: var(--gm-muted); font-size: 12px; font-variant-numeric: tabular-nums; padding-top: 3px; }
.gm-card .gm-avatar { width: 22px; height: 22px; border-radius: 50% 50% 50% 3px; font-size: 9px; margin-top: 1px; }
.gm-card .body { flex: 1; min-width: 0; }
.gm-card .gm-author { font-size: 12.5px; }
/* Two lines of the comment, then an ellipsis: enough to know which one it is. */
.gm-card .gm-text { margin: 1px 0 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.gm-card .dot { position: absolute; right: 16px; top: 14px; width: 7px; height: 7px; border-radius: 50%; background: var(--gm-danger); }
.gm-card .gm-meta { flex-wrap: nowrap; overflow: hidden; }
.gm-card .gm-meta > * { white-space: nowrap; }
.gm-empty { padding: 16px; color: var(--gm-muted); }

.gm-foot { flex: none; border-top: 1px solid var(--gm-line); padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
/* The whole-page note, closed: drawn as the field it opens into. */
.gm-note-toggle {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: 1px solid var(--gm-field-line);
  border-radius: 8px;
  background: var(--gm-surface-2);
  color: var(--gm-muted);
}
.gm-note-toggle:hover { border-color: var(--gm-accent-ink); color: var(--gm-text); }
.gm-foot textarea { min-height: 52px; }
.gm-send { display: flex; gap: 8px; align-items: center; }
.gm-btn {
  flex: none;
  border: 1px solid var(--gm-field-line);
  border-radius: 8px;
  padding: 7px 10px;
  text-align: center;
  white-space: nowrap;
}
.gm-btn:hover { border-color: var(--gm-accent-ink); color: var(--gm-accent-ink); }
.gm-btn.primary { flex: 1; background: var(--gm-accent); border-color: var(--gm-accent); color: #fff; font-weight: 600; }
.gm-btn.primary:hover { background: #6d28d9; color: #fff; }
.gm-btn.ghost { border-color: transparent; color: var(--gm-muted); padding: 7px 4px; }
.gm-btn.ghost:hover { color: var(--gm-accent-ink); }
.gm-said { color: var(--gm-muted); font-size: 11px; }
.gm-said:empty { display: none; }
.gm-keep { color: var(--gm-muted); font-size: 11px; }
.gm-keep:empty { display: none; }

/* ---------- comment box ---------- */

.gm-box {
  position: fixed;
  width: 300px;
  background: var(--gm-surface);
  border-radius: 12px;
  box-shadow: var(--gm-shadow);
  padding: 12px 14px;
  pointer-events: auto;
}
.gm-box .where { color: var(--gm-muted); font-size: 12px; margin-bottom: 8px; overflow-wrap: anywhere; }
.gm-chips { display: flex; gap: 5px; margin: 8px 0; }
.gm-chip { border: 1px solid var(--gm-line); border-radius: 999px; padding: 2px 9px; font-size: 11px; color: var(--gm-muted); }
.gm-chip:hover { border-color: var(--gm-accent-ink); color: var(--gm-accent-ink); }
.gm-chip.is-on { border-color: var(--gm-accent); background: var(--gm-accent); color: #fff; }
.gm-box-actions { display: flex; gap: 7px; }
.gm-box-actions .gm-btn { padding: 6px 10px; }
.gm-box-name { margin-top: 8px; }
.gm-box-name-why { color: var(--gm-muted); font-size: 11px; margin-bottom: 4px; }
/* No outline reset here. Focus is MOVED to this field by the first Save, so it
   is the one place a ring matters most (review R27). */
.gm-box-name input, .gm-who input {
  width: 100%;
  background: var(--gm-surface-2);
  color: var(--gm-text);
  border: 1px solid var(--gm-field-line);
  border-radius: 8px;
  padding: 6px 10px;
}
.gm-box-name input:focus, .gm-who input:focus { border-color: var(--gm-accent-ink); }

/* ---------- the name row and the identity states (issue #18) ---------- */
/* Both live in the popover under the identity chip. */

.gm-who label { display: block; margin-bottom: 4px; color: var(--gm-muted); font-size: 12px; }
.gm-identity + .gm-who { margin-top: 10px; }
.gm-identity-says { display: block; color: var(--gm-text); }
.gm-identity-code {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 10px;
  border: 1px solid var(--gm-field-line);
  border-radius: 6px;
  font: 600 14px ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: 0.06em;
}
.gm-identity-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.gm-identity-live[hidden] + .gm-identity-actions { margin-top: 0; }
.gm-identity-btn {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--gm-accent);
  color: #fff;
  font-weight: 600;
}
.gm-identity-btn:hover { background: #6d28d9; }
.gm-identity-quiet { color: var(--gm-muted); border-bottom: 1px solid var(--gm-line); }
.gm-identity-quiet:hover { color: var(--gm-text); border-bottom-color: var(--gm-text); }
.gm-identity.is-row { display: flex; align-items: center; gap: 10px; }
.gm-identity.is-row .gm-identity-live { flex: 1; min-width: 0; }
.gm-identity.is-row .gm-identity-says { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gm-identity.is-row .gm-identity-actions { margin-top: 0; }
/* A name the comment service vouched for, against a typed one: same type, one step stronger. */
.gm-author.is-verified { font-weight: 700; }

/* ---------- versions (issue #15), in the sheet's foot ---------- */

.gm-shared { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.gm-version {
  text-align: left;
  display: flex; align-items: baseline; gap: 6px;
  width: 100%;
  font-size: 12px;
  color: var(--gm-muted);
}
.gm-version::after { content: '\u25BE'; color: var(--gm-muted); font-size: 10px; margin-left: auto; }
.gm-version[aria-expanded='true']::after { content: '\u25B4'; }
.gm-version:hover { color: var(--gm-accent-ink); }
.gm-version:disabled { cursor: default; color: var(--gm-muted); }
.gm-version:disabled::after { content: none; }
.gm-versions { padding: 0 0 4px; max-height: 40vh; overflow-y: auto; }
.gm-vrow {
  text-align: left;
  text-decoration: none;
  display: block;
  width: 100%;
  padding: 5px 0;
  border-top: 1px solid var(--gm-line);
  font-size: 12px;
  color: var(--gm-text);
  cursor: pointer;
}
a.gm-vrow:hover, button.gm-vrow:hover { color: var(--gm-accent-ink); }
.gm-newer { padding: 2px 0 6px; font-size: 12px; color: var(--gm-text); }
.gm-newer:empty { display: none; }
.gm-newer a { color: var(--gm-accent-ink); }
.gm-older-list { padding: 2px 0 6px 10px; border-left: 2px solid var(--gm-line); margin: 0 0 6px; }
.gm-older { padding: 5px 0; }
.gm-older + .gm-older { border-top: 1px solid var(--gm-line); }
.gm-older .gm-meta { font-size: 11.5px; }
.gm-older-quote { color: var(--gm-muted); font-size: 11px; margin-top: 3px; overflow-wrap: anywhere; }
.gm-older .gm-text { font-size: 12.5px; margin: 3px 0 0; }
.gm-older-note { color: var(--gm-muted); font-size: 11px; padding: 4px 0; }

@media (prefers-reduced-motion: reduce) {
  .gm-pin { animation: none; transition: none; }
  .gm-bar, .gm-pop, .gm-notice { transition: none; }
}

/* A narrow window: the sheet takes the width, and the pill stays where it is,
   above the sheet's title, so comment mode is never pushed off-screen (review
   of #21, R19). A proper phone mode is part 2's own work. */
@media (max-width: 600px) {
  .gm-sheet { width: 100%; box-shadow: none; }
  /* Room at the top of the sheet for the pill, which sits over it: the sheet
     is drawn after the bar in the shadow root, so without a stacking order of
     its own the full-width sheet would paint over comment mode and swallow
     its clicks (review of #21, R19, second round). */
  .gm-sheet-head { padding-top: 54px; }
  .gm-bar.is-shifted, .gm-pop.is-shifted, .gm-notice.is-shifted { right: 16px; }
  .gm-thread { width: min(300px, calc(100vw - 16px)); }
}
`;function ui(e){if(typeof e!="string")return null;let t=e.trim(),o=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(t);if(o)return(o[4]===void 0?1:Number(o[4]))>0?[Number(o[1]),Number(o[2]),Number(o[3])]:null;let a=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(t);if(a){if(a[2]!==void 0&&parseInt(a[2],16)===0)return null;let c=parseInt(a[1],16);return[c>>16&255,c>>8&255,c&255]}return null}function di(e){let t=ui(e);if(!t)return null;let o=t.map(a=>{let c=a/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)});return .2126*o[0]+.7152*o[1]+.0722*o[2]}var Yr=.4,Ye=null;function ci(e,t){if(typeof e!="string")return null;if(ui(e)!==null||/^rgba?\(/i.test(e))return e;try{if(!Ye){let f=t.createElement("canvas");f.width=1,f.height=1,Ye=f.getContext("2d",{willReadFrequently:!0})}if(!Ye)return e;if(Ye.fillStyle="#000000",Ye.fillStyle=e,Ye.fillStyle==="#000000"&&!/^#0{6}$|^black$/i.test(e.trim()))return null;Ye.clearRect(0,0,1,1),Ye.fillRect(0,0,1,1);let[o,a,c,u]=Ye.getImageData(0,0,1,1).data;return u===0?null:`rgba(${o}, ${a}, ${c}, ${u/255})`}catch{return e}}var Gr=e=>e<Yr?"dark":"light";function pi(e=document,t=null){let o=e.defaultView;if(!o||!e.documentElement)return"light";let a=u=>!!(u&&u.closest&&u.closest(`#${We}`)),c=t;if(!c)try{let u=o.innerWidth/2,f=o.innerHeight/2;c=(e.elementsFromPoint?e.elementsFromPoint(u,f):[e.elementFromPoint(u,f)]).find(_=>_&&!a(_))||null}catch{c=null}a(c)&&(c=null),c||(c=e.body);for(let u=c;u;u=u.parentElement){let f=null;try{f=o.getComputedStyle(u)}catch{f=null}if(!f)continue;let $=di(ci(f.backgroundColor,e));if($!==null)return Gr($);if(f.backgroundImage&&f.backgroundImage!=="none"){let _=di(ci(f.color,e));if(_!==null)return _>.5?"dark":"light"}}return"light"}var mi=["#d1242f","#7c3aed","#2563eb","#0f766e","#15803d","#b45309","#be185d","#4338ca"],Vr="#6b7280";function Jr(e){let t=0;for(let o=0;o<e.length;o+=1)t=Math.imul(t,31)+e.charCodeAt(o)|0;return t>>>0}function fn(e){let t=String(e||"").trim().split(/\s+/).filter(Boolean);if(!t.length)return"?";let o=Array.from(t[0])[0]||"",a=t.length>1&&Array.from(t[t.length-1])[0]||"";return(o+a).toUpperCase()}function hn(e){let t=e&&(e.username||e.name),o=String(t||"").trim().toLowerCase();return o?mi[Jr(o)%mi.length]:Vr}var Kr=["change","bug","question","like"],Xr=320,V=26,dt=300;function s(e,t={},o=[]){let a=document.createElement(e);for(let[c,u]of Object.entries(t))c==="text"?a.textContent=u:c.startsWith("on")?a.addEventListener(c.slice(2).toLowerCase(),u):u!=null&&a.setAttribute(c,u);for(let c of[].concat(o))c&&a.appendChild(c);return a}function gi(e){let t="http://www.w3.org/2000/svg",o=document.createElementNS(t,"svg");o.setAttribute("viewBox","0 0 16 16"),o.setAttribute("aria-hidden","true"),o.setAttribute("class","gm-icon");let a=document.createElementNS(t,"path");return a.setAttribute("d",e),o.appendChild(a),o}var fi="M2 3h12v8H6l-3 3v-3H2z",ve=(e,t,o)=>Math.min(o,Math.max(t,e)),Qr=e=>String(e||"").replace(/\s+/g," ").trim();function hi(e){let t=Date.parse(e||"");if(!Number.isFinite(t))return"";let o=Math.max(0,Math.round((Date.now()-t)/1e3));return o<60?"now":o<3600?`${Math.round(o/60)}m`:o<86400?`${Math.round(o/3600)}h`:`${Math.round(o/86400)}d`}function Zr(e,t){if(!e||typeof t!="string"||!t||t.length>200)return null;let o=new RegExp(t.split(/\s+/).map(u=>u.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+")),a=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),c;for(;c=a.nextNode();){let u=o.exec(c.data);if(u){let f=document.createRange();return f.setStart(c,u.index),f.setEnd(c,u.index+u[0].length),f}}return null}function xi(e){let{store:t,batch:o,createComment:a,anchorFromElement:c,anchorFromSelection:u,resolve:f,setRecording:$,targetFor:_}=e,h=e.sync||null,B={gitlab:"GitLab",github:"GitHub"},se=n=>B[n]||String(n||""),L=n=>{let r=n&&n.name&&n.name.trim()||"Someone";if(!n||n.verified!==!0)return r;let d=n.username?` @${n.username}`:"";return`${r}${d} \xB7 ${se(n.provider)}`},M=n=>n&&n.verified===!0?"gm-author is-verified":"gm-author",C=n=>n.author||(h?null:{name:t.reviewer()}),de=(n,r="gm-avatar")=>s("span",{class:r,style:`--gm-author:${hn(n)}`,text:fn(n&&n.name),"aria-hidden":"true"}),K=s("div",{id:We,popover:"manual"}),z=K.attachShadow({mode:"open"});z.appendChild(s("style",{text:li})),document.body.appendChild(K);try{K.showPopover()}catch{K.removeAttribute("popover")}let Ae="light";function Z(){Ae=pi(document),K.classList.toggle("gm-dark",Ae==="dark")}Z();let nt=s("div"),R=s("div");z.append(nt,R);let P=s("div",{class:"gm-frame gm-target",hidden:"hidden"});z.appendChild(P);let J=!1,G=null,be=null,W=null,O=null,ne="",ee=!1,F=null,Q=null,Fe=null,oe=null,we=!1,ye=!1,Ge="",I=!1,Le="all",ie=!1,ue=null,Oe=null,ce=null,Te=!1,pe=null,Pt=!1,Ut="pin",ct="",Ve="",ut="",pt=new Map,ot=new Map,me=s("button",{class:"gm-switch",type:"button",role:"switch","aria-checked":"false",title:"Comment mode. While this is on, clicking marks a spot instead of using the page. C turns it on, Escape off."},[gi(fi),s("span",{class:"label",text:"Comment"})]),ke=s("span",{class:"count",text:"0"}),kt=s("span",{class:"dot",hidden:"hidden"}),Ne=s("button",{class:"gm-badge",type:"button","aria-expanded":"false",title:"All comments. Opens the comments list; Escape closes it.","data-focus":"badge"},[gi(fi),ke,kt]),it=s("span",{class:"gm-avatar","aria-hidden":"true"}),rt=s("span",{class:"label",hidden:"hidden"}),qe=s("button",{class:"gm-id",type:"button","aria-expanded":"false","aria-label":"Your name"},[it,rt]),St=s("div",{class:"gm-bar",role:"toolbar","aria-label":"gitmargin"},[me,Ne,qe]),ze=s("button",{class:"gm-notice",type:"button","aria-live":"polite",hidden:"hidden"});ze.addEventListener("click",()=>xn()),z.append(St,ze);let Je=s("input",{type:"text",id:"gm-reviewer",placeholder:"optional",maxlength:"80"}),Se=s("div",{class:"gm-who"},[s("label",{for:"gm-reviewer",text:h?"Your name, shown with your comments":"Your name, for the author"}),Je]),mt=s("span",{class:"gm-identity-says"}),gt=s("span",{class:"gm-identity-code",hidden:"hidden"}),l=s("div",{class:"gm-identity-live",role:"status","aria-live":"polite"},[mt,gt]),m=s("button",{type:"button",class:"gm-identity-btn"}),x=s("button",{type:"button",class:"gm-identity-quiet",hidden:"hidden"}),b=s("div",{class:"gm-identity",hidden:"hidden"},[l,s("div",{class:"gm-identity-actions"},[m,x])]);m.addEventListener("click",()=>h&&h.signIn()),x.addEventListener("click",()=>{h&&(h.view().signin.state==="waiting"?h.cancelSignIn():h.signOut())});let S=s("div",{class:"gm-pop gm-idpop",hidden:"hidden",role:"dialog","aria-label":"Your name"},[...h?[b]:[],Se]);z.appendChild(S);let j=s("span",{class:"count",text:"0"}),T=s("div",{class:"gm-section"},[s("span",{text:"Comments"}),j]),Y=s("button",{class:"gm-close",type:"button",title:"Close","aria-label":"Close the comments list",text:"\u2715"}),Be=s("div",{class:"gm-filters",hidden:h?null:"hidden"}),$e=["all","unread","mine"].map(n=>s("button",{type:"button",class:"gm-filter","data-filter":n,"aria-pressed":"false",text:n[0].toUpperCase()+n.slice(1)}));$e.forEach(n=>{Be.appendChild(n),n.addEventListener("click",()=>{Le=n.dataset.filter,X(!0)})});let Pe=s("div",{class:"gm-list"}),D=s("textarea",{placeholder:"Anything that is not about one spot","aria-label":"A note about the whole thing",hidden:"hidden"}),ae=s("button",{class:"gm-note-toggle",type:"button",text:"Add a note about the whole thing"}),Ue=s("button",{class:"gm-btn primary",type:"button",text:"Send to author"}),ft=s("button",{class:"gm-btn ghost",type:"button",text:"Copy for author"}),Zn=s("div",{class:"gm-said",role:"status","aria-live":"polite"}),eo=s("div",{class:"gm-keep",role:"status","aria-live":"polite"}),$t=s("button",{class:"gm-version",type:"button","aria-expanded":"false"}),ht=s("div",{class:"gm-versions",hidden:"hidden","aria-live":"polite"}),jt=s("div",{class:"gm-newer",role:"status"}),to=s("div",{class:"gm-shared",hidden:"hidden"},[$t,ht,jt]),no=s("div",{class:"gm-sheet",hidden:"hidden",role:"complementary","aria-label":"gitmargin comments"},[s("div",{class:"gm-sheet-head"},[s("div",{class:"gm-sheet-title"},[T,s("div",{class:"gm-spacer"}),Y]),eo,...h?[to]:[]]),Be,Pe,s("div",{class:"gm-foot"},[ae,D,s("div",{class:"gm-send"},[Ue,ft]),Zn])]);z.appendChild(no);let te=s("div",{class:"gm-thread",hidden:"hidden",role:"dialog","aria-label":"Comment"}),Ke=s("div",{class:"gm-preview",hidden:"hidden","aria-hidden":"true"});z.append(te,Ke),te.addEventListener("click",n=>n.stopPropagation());function Ct(){St.classList.toggle("is-shifted",I),ze.classList.toggle("is-shifted",I),S.classList.toggle("is-shifted",I),no.hidden=!I,Ne.setAttribute("aria-expanded",I?"true":"false"),S.hidden=!ie,qe.setAttribute("aria-expanded",ie?"true":"false"),oo()}function oo(){ze.textContent!==ct&&(ze.textContent=ct),ze.hidden=!ct||ie||I}let xn=()=>{I||(I=!0,Pt=!0,ie=!1,Ct(),X(!0))},Ht=()=>{I&&(I=!1,Ct(),X())};function Wt(){ie&&(ie=!1,Ct())}function vn(n,{scroll:r=!1,from:d="pin"}={}){if(G=n,Ut=d,ue=null,Wt(),h&&!h.isMine(n)&&t.markSeen&&t.markSeen(n),X(!0),!r)return;let i=$n.find(p=>p.comment.id===n);i&&i.element&&i.status==="found"&&i.element.scrollIntoView({block:"center",behavior:"smooth"})}function bi(){let n=t.comments().find(r=>r.id===be);return n?n.intent.text:""}function io(){return be!==null&&ce!==null&&ce!==bi()&&!Te?(Te=!0,X(!0),!1):(Yt(),!0)}function Yt(){if(G===null)return;let n=G;G=null,be=null,ce=null,Te=!1,pe=null,ne.trim()||(W=null,O=null),X(!0),wi(n)}function wi(n){let r=Qe.get(n),d=I?Qt.get(n):null,i=w=>w&&w.isConnected&&w;((Ut==="card"?i(d)||i(r):i(r)||i(d))||Ne).focus()}let Gt=n=>{J=!!n,$(!J),me.classList.toggle("is-on",J),document.documentElement.style.cursor=J?"crosshair":"",K.classList.toggle("gm-armed",J),me.setAttribute("aria-checked",J?"true":"false"),J?Wt():Xe(),!J&&!Re.value.trim()&&bn()};me.addEventListener("click",()=>Gt(!J)),Ne.addEventListener("click",()=>I?Ht():xn()),Y.addEventListener("click",()=>{Ht(),Ne.focus()}),qe.addEventListener("click",()=>{ie=!ie,Ct(),ie&&!Se.hidden&&Je.focus()});function yi(){D.hidden=!1,ae.textContent="A note about the whole thing",D.focus()}ae.addEventListener("click",()=>{if(!D.hidden){D.hidden=!0,ae.textContent="Add a note about the whole thing";return}yi()}),Je.addEventListener("input",()=>t.setReviewer(Je.value)),D.addEventListener("input",()=>t.setOverallNote(D.value));function ro(n){Zn.textContent=n}function ki(){let n=o.download();t.markExported(),ro(`Saved ${n} to your downloads. Reply to the message you got this file in and attach it.`)}async function Si(){let n=await o.copy();window.__gitmargin&&(window.__gitmargin.lastCopy=n.text,window.__gitmargin.lastCopyOk=n.ok),n.ok&&t.markExported(),ro(n.ok?"Copied. Paste it anywhere.":"Could not reach the clipboard. Use Send to author instead.")}Ue.addEventListener("click",ki),ft.addEventListener("click",Si);let so=s("div",{class:"where"}),Re=s("textarea",{placeholder:"What did you expect here?","aria-label":"What did you expect here?"}),Vt=Kr.map(n=>s("button",{class:"gm-chip",type:"button",text:n,"data-tag":n,"aria-pressed":"false"})),Et=s("div",{class:"gm-boxwarn"}),ao=s("button",{class:"gm-btn primary",type:"button",text:"Save"}),lo=s("button",{class:"gm-btn",type:"button",text:"Cancel"}),co="Not saved yet. Others will see this, so add your name, or press again to go without one.",At=s("input",{type:"text","aria-label":"Your name, shown with your comments","aria-describedby":"gm-box-name-why",placeholder:"Your name",maxlength:"80"}),Jt=s("div",{class:"gm-box-name",hidden:"hidden"},[s("div",{class:"gm-box-name-why",id:"gm-box-name-why",text:co}),At]);function $i(){let n=le.getBoundingClientRect();le.style.top=`${ve(n.top,8,Math.max(8,window.innerHeight-n.height-8))}px`}let Ci=()=>!!(h&&h.view().identity.mode!=="none"),Kt=!1,uo=!1;function po(n="box"){return!h||uo||t.reviewer().trim()||Ci()?!1:(uo=!0,n==="box"?(Jt.hidden=!1,$i(),At.focus()):(Kt=!0,X(!0)),!0)}At.addEventListener("input",()=>t.setReviewer(At.value));let le=s("div",{class:"gm-box",hidden:"hidden"},[so,Re,s("div",{class:"gm-chips"},Vt),Jt,s("div",{class:"gm-box-actions"},[ao,lo]),Et]);z.appendChild(le),Vt.forEach(n=>n.addEventListener("click",()=>{let r=n.dataset.tag;Q.tag=Q.tag===r?null:r,Vt.forEach(d=>{let i=d.dataset.tag===Q.tag;d.classList.toggle("is-on",i),d.setAttribute("aria-pressed",i?"true":"false")})}));function bn(){le.hidden=!0,Q=null,Xe(),Vt.forEach(n=>{n.classList.remove("is-on"),n.setAttribute("aria-pressed","false")}),Re.value="",Et.textContent="",Jt.hidden=!0}function wn(){return Re.value.trim()&&!Et.textContent?(Et.textContent="Press again to discard what you typed.",Re.focus(),!1):(bn(),!0)}function mo(n,r){let d=n.quote&&n.quote.exact;if(d)return`"${d.slice(0,60)}"`;let i=r&&r.nodeType===1?(r.getAttribute("aria-label")||r.getAttribute("title")||"").trim():"",p=r&&r.nodeType===1?r.localName:"",w=o.nounFor(p||n.selector);return i?`the "${i}" ${w}`:`the ${w}`}function go({anchor:n,element:r,x:d,y:i,framed:p=null}){Q={anchor:n,element:r,tag:null},so.textContent=mo(n,r),p?kn(p):Xe(),Yt(),Re.value="",le.hidden=!1;let w=300,g=le.getBoundingClientRect().height||190,v=d,y=i;if(!Number.isFinite(v)||!Number.isFinite(y)||v===0&&y===0){let E=r&&r.getBoundingClientRect?r.getBoundingClientRect():{left:24,bottom:24};v=E.left,y=E.bottom}le.style.left=`${ve(v+12,8,Lt()-w-8)}px`,le.style.top=`${ve(y+12,8,window.innerHeight-g-8)}px`,Re.focus()}function yn(){let n=Re.value.trim();if(!n||!Q||po())return;Jt.hidden=!0;let r=a({anchor:Q.anchor,element:Q.element,text:n,tag:Q.tag});t.add(r),bn()}ao.addEventListener("click",yn),lo.addEventListener("click",wn),Re.addEventListener("keydown",n=>{n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&yn()}),At.addEventListener("keydown",n=>{n.key==="Enter"&&!n.isComposing&&yn()}),Re.addEventListener("input",()=>{Et.textContent=""}),document.addEventListener("keydown",n=>{if(n.key==="Escape"){if(!le.hidden){n.preventDefault(),wn();return}if(G!==null){n.preventDefault(),io();return}if(ie){n.preventDefault(),Wt();return}if(I){n.preventDefault(),Ht(),Ne.focus();return}J&&(n.preventDefault(),Gt(!1))}});let Xt=4;function fo(){if(!oe)return;let n=oe.isConnected?oe.getBoundingClientRect():null;if(!n||!n.width&&!n.height){Xe();return}let r=Math.max(n.left-3,Xt),d=Math.max(n.top-3,Xt),i=Math.min(n.right+3,window.innerWidth-Xt),p=Math.min(n.bottom+3,window.innerHeight-Xt);if(i<=r||p<=d){P.hidden=!0;return}P.style.left=`${r}px`,P.style.top=`${d}px`,P.style.width=`${i-r}px`,P.style.height=`${p-d}px`,P.hidden=!1}function kn(n){oe=n,fo()}function Xe(){oe=null,P.hidden=!0}function ho(){let n=window.getSelection();return!n||n.isCollapsed||!n.toString().trim()?null:ye||n.toString()!==Ge?n:null}function Ei(){return we&&!!ho()}function Ai(n){if(!J||!le.hidden)return;if(Ei()){Xe();return}let r=_(n);r?kn(r):Xe()}let xo=null,Sn=!1;document.addEventListener("pointermove",n=>{J&&(xo=n.target,!Sn&&(Sn=!0,requestAnimationFrame(()=>{Sn=!1,Ai(xo)})))},!0),document.addEventListener("pointerdown",()=>{we=!0,ye=!1,Ge=String(window.getSelection()||"")},!0),document.addEventListener("selectionchange",()=>{we&&(ye=!0)}),document.addEventListener("pointerup",()=>{we=!1},!0),document.addEventListener("pointercancel",()=>{we=!1},!0),document.documentElement.addEventListener("pointerleave",()=>{J&&le.hidden&&Xe()}),document.addEventListener("focusin",n=>{if(!J||!le.hidden)return;let r=_(n.target);r?kn(r):Xe()},!0),document.addEventListener("mouseup",()=>{J&&(Fe=ho())},!0),document.addEventListener("click",n=>{let r=n.target,d=r&&r.nodeType===1&&r.closest(`#${We}`);if(d||(Wt(),G!==null&&(le.hidden||J)&&io()),!J||!r||r.nodeType!==1||d||(n.preventDefault(),n.stopPropagation(),!le.hidden&&!wn()))return;let i,p,w=null;if(Fe)i=u(Fe),p=Fe.getRangeAt(0).commonAncestorContainer,p=p.nodeType===1?p:p.parentElement,Fe=null;else{let g=_(r);if(!g)return;i=c(g,n),p=g,w=g}go({anchor:i,element:p,x:n.clientX,y:n.clientY,framed:w})},!0),document.addEventListener("keydown",n=>{if(!le.hidden||n.key!=="c"&&n.key!=="C"||n.metaKey||n.ctrlKey||n.altKey)return;let r=document.activeElement;for(;r&&r.shadowRoot&&r.shadowRoot.activeElement;)r=r.shadowRoot.activeElement;if(r&&(r.isContentEditable||r.matches("input, textarea, select")))return;if(!J){n.preventDefault(),Gt(!0);return}let d=window.getSelection(),i=d&&!d.isCollapsed&&d.toString().trim();if(!i&&r&&r.closest&&r.closest(`#${We}`))return;let p=i?d.getRangeAt(0).commonAncestorContainer.nodeType===1?d.getRangeAt(0).commonAncestorContainer:d.getRangeAt(0).commonAncestorContainer.parentElement:oe||_(r);if(!p)return;n.preventDefault();let w=i?u(d):c(p,null);go({anchor:w,element:p,framed:i?null:p})});let Qe=new Map,Qt=new Map,$n=[],Lt=()=>window.innerWidth-(I?Xr:0);function Li(n,r,d){let i=n.anchor.quote&&n.anchor.quote.exact;return!!(d&&i&&Qr(r.textContent).length>i.length)}function Oi(n){try{let r=document.createRange();r.selectNodeContents(n);let d=Array.from(r.getClientRects()).filter(i=>i.width&&i.height);return d.length?{left:Math.min(...d.map(i=>i.left)),right:Math.max(...d.map(i=>i.right))}:null}catch{return null}}function Ti(n,r,d){let p=[[n+V/2,r+V/2],[n+1,r+1],[n+V-1,r+1],[n+1,r+V-1],[n+V-1,r+V-1]];for(let[w,g]of p){let v=null;try{v=document.elementFromPoint(w,g)}catch{return!0}if(!(!v||v===document.body||v===document.documentElement)){if(v===K)return!1;if(!(v===d||v.contains(d)))return!1}}return!0}function Ni(n){R.textContent="",pt.clear();let r=new Set,d=[];for(let i of Qe.values())i.style.pointerEvents="none";n.forEach(({comment:i,status:p,element:w},g)=>{if(p!=="found"||!w)return;let v=w.getBoundingClientRect();if(v.bottom<0||v.top>window.innerHeight||v.right<0||v.left>window.innerWidth)return;r.add(i.id);let y=null;try{y=Zr(w,i.anchor.quote&&i.anchor.quote.exact)}catch{}let E=y?Array.from(y.getClientRects()).filter(U=>U.width):[],A=Li(i,w,y)&&E.length>0,k=A?{x:E[E.length-1].right,top:E[E.length-1].top,bottom:E[E.length-1].bottom}:{x:v.left,top:v.top,bottom:v.bottom},N=Qe.get(i.id);N||(N=s("button",{class:"gm-pin",type:"button","data-focus":`pin:${i.id}`},[s("span",{class:"initials"})]),N.addEventListener("click",U=>{U.stopPropagation(),G===i.id?Yt():vn(i.id)}),N.addEventListener("pointerenter",U=>{U.pointerType&&U.pointerType!=="mouse"||G===null&&(ue=i.id,Cn())}),N.addEventListener("pointerleave",()=>{ue===i.id&&(ue=null,Cn())}),Qe.set(i.id,N),nt.appendChild(N));let ge=C(i);N.style.setProperty("--gm-author",hn(ge)),N.firstChild.textContent=fn(ge&&ge.name),N.title=i.intent.text,N.setAttribute("aria-label",`Comment ${g+1}: ${i.intent.text}`),N.classList.toggle("is-selected",G===i.id),N.classList.toggle("is-hot",Oe===i.id);let _e=Oi(w),xe=_e?{left:Math.max(v.left,_e.left-2),right:Math.min(v.right,_e.right+2)}:{left:v.left,right:v.right};G===i.id&&R.appendChild(s("div",{class:"gm-frame",style:`left:${xe.left-3}px;top:${v.top-3}px;width:${xe.right-xe.left+6}px;height:${v.height+6}px`}));let H=4,Me=V-4,Ce=A?[{left:k.x-2,top:k.top-V-H,cls:"",dir:1,at:[k.x,k.top]},{left:k.x-2,top:k.bottom+H,cls:"is-below",dir:1,at:[k.x,k.bottom]}]:[{left:k.x-V+H,top:k.top-V+H,cls:"is-left",dir:-1,at:[k.x,k.top]},{left:k.x-V+H,top:k.top-H,cls:"is-below is-left",dir:-1,at:[k.x,k.top]},{left:k.x-2,top:k.top-V-H,cls:"",dir:1,at:[k.x,k.top]},{left:k.x-2,top:k.bottom+H,cls:"is-below",dir:1,at:[k.x,k.bottom]},{left:k.x-V+H,top:k.bottom-H,cls:"is-below is-left",dir:-1,at:[k.x,k.bottom]}],at=Lt()-V-2,xt=window.innerHeight-V-2,Ln=(U,je)=>d.some(he=>U<he.right+6&&U+V>he.left-6&&je<he.bottom+6&&je+V>he.top-6),$o=`${Math.round(k.x)},${Math.round(k.top)},${Math.round(k.bottom)},${at},${xt},${A?1:0}`,_t=ot.get(i.id),fe=_t&&_t.key===$o&&!Ln(_t.pick.left,_t.pick.top)?_t.pick:null;for(let U of fe?[]:Ce){for(let je=0;je<=3&&!fe;je+=1){let he=U.left+je*Me*U.dir,Mt=U.top;he<2||he>at||Mt<2||Mt>xt||Ln(he,Mt)||!Ti(he,Mt,w)||(fe={...U,left:he,top:Mt})}if(fe)break}if(!fe){let U=ve(Ce[0].left,2,at),je=ve(Ce[0].top,2,xt);for(let he=0;he<4&&Ln(U,je);he+=1)U=ve(U+Me*Ce[0].dir,2,at);fe={...Ce[0],left:U,top:je}}ot.set(i.id,{key:$o,pick:fe});let vt=fe.left,bt=fe.top,Co=fe.cls.includes("is-left"),On=fe.cls.includes("is-below");N.style.left=`${vt}px`,N.style.top=`${bt}px`,N.style.pointerEvents="",N.classList.toggle("is-left",Co),N.classList.toggle("is-below",On),d.push({left:vt,top:bt,right:vt+V,bottom:bt+V}),pt.set(i.id,{left:vt,top:bt,below:On,rect:v,textRight:xe.right,frameRight:xe.right+3});let Eo=Co?vt+V:vt,Ao=On?bt:bt+V,Lo=fe.at[0]-Eo,Oo=fe.at[1]-Ao,Tn=Math.hypot(Lo,Oo);if(Tn>8&&Tn<240){let U=Math.atan2(Oo,Lo)*180/Math.PI;R.appendChild(s("div",{class:"gm-leader",style:`left:${Eo}px;top:${Ao}px;width:${Tn}px;transform:rotate(${U}deg)`}))}if(A)for(let U of E)R.appendChild(s("div",{class:"gm-underline",style:`left:${U.left}px;top:${U.bottom}px;width:${U.width}px`}))});for(let[i,p]of Qe)r.has(i)||(p.remove(),Qe.delete(i),ot.delete(i))}function Cn(){let n=ue!==null?$n.find(g=>g.comment.id===ue):null,r=n&&pt.get(n.comment.id);if(!n||!r){Ke.hidden=!0;return}Ke.textContent="";let d=C(n.comment);Ke.append(s("b",{text:L(d)}),s("span",{text:n.comment.intent.text})),Ke.hidden=!1;let i=220,p=Ke.offsetHeight||44,w=r.left+V+8;w+i>Lt()-8&&(w=r.left-i-8),Ke.style.left=`${ve(w,8,Lt()-i-8)}px`,Ke.style.top=`${ve(r.top,8,window.innerHeight-p-8)}px`}function vo(n,{own:r=!1,time:d=""}={}){let i=s("div",{class:"gm-meta"},[s("span",{class:M(n),text:r?`${L(n)} (you)`:L(n)}),d?s("span",{class:"gm-time",text:hi(d)}):null]);return s("div",{class:"gm-who-row"},[de(n),i])}function Ri(n){let r=Array.isArray(n.replies)?n.replies:[],d=h&&W===n.id;if(!r.length||d&&O&&r.length===1)return null;let i=s("div",{class:"gm-replies"});return r.forEach(p=>{if(d&&O===p.id)return;let w=h&&h.isMine(p.id),g=s("div",{class:"gm-reply"},[vo(p.author,{own:w,time:p.time}),h&&h.isUnshared(p.id)?s("div",{class:"gm-meta",style:"margin-left:28px"},[s("span",{class:"gm-flag",text:"not shared yet"})]):null,s("p",{class:"gm-text",text:String(p.text||"")})]);if(w){let v=s("button",{type:"button",class:"gm-quiet",text:"Edit","data-focus":`redit:${p.id}`}),y=s("button",{type:"button",class:"gm-del gm-quiet",text:"Delete","data-focus":`rdel:${p.id}`});v.addEventListener("click",()=>{W=n.id,O=p.id,ne=String(p.text||""),X(!0)}),pe===`reply:${p.id}`&&(y.textContent="Delete?",y.dataset.armed="yes"),y.addEventListener("click",()=>{if(pe!==`reply:${p.id}`){pe=`reply:${p.id}`,F=`rdel:${p.id}`,X(!0);return}pe=null,h.removeReply(n.id,p.id),F=`reply:${n.id}`,X(!0)}),g.appendChild(s("div",{class:"gm-card-actions"},[v,y]))}i.appendChild(g)}),i}function _i(n){let r=s("div",{class:"gm-reply-write"});{let d=s("input",{type:"text",class:"gm-reply-field","aria-label":"Your reply",placeholder:"Reply",maxlength:"4000"});d.value=ne;let i=Kt&&!t.reviewer().trim(),p=s("input",{type:"text",class:"gm-reply-field gm-reply-name","aria-label":"Your name, shown with your comments","aria-describedby":"gm-reply-name-why",placeholder:"Your name",maxlength:"80"}),w=s("div",{class:"gm-boxwarn",role:"status",text:ee?"Press again to discard what you typed.":""}),g=s("button",{type:"button",class:"gm-reply-send",text:O?"Save":"Send"}),v=s("button",{type:"button",text:"Cancel"}),y=()=>{W=null,O=null,ne="",Kt=!1,ee=!1,F=`reply:${n.id}`,X(!0)},E=()=>{if(d.value.trim()&&!ee){ee=!0,w.textContent="Press again to discard what you typed.";return}y()},A=()=>{let N=d.value.trim();N&&(po("panel")||(i&&p.value.trim()&&t.setReviewer(p.value),O?h.editReply(n.id,O,N):h.addReply(n.id,N),y()))};d.addEventListener("input",()=>{ne=d.value,ee=!1,w.textContent=""});let k=N=>{N.key==="Enter"&&!N.isComposing&&A(),N.key==="Escape"&&(N.stopPropagation(),E())};d.addEventListener("keydown",k),p.addEventListener("keydown",k),g.addEventListener("click",A),v.addEventListener("click",E),i&&r.appendChild(s("div",{class:"gm-reply-ask"},[s("div",{class:"gm-box-name-why",id:"gm-reply-name-why",text:co}),p])),r.appendChild(s("div",{class:"gm-reply-row"},[d,g,v])),r.appendChild(w),requestAnimationFrame(()=>{if(W!==n.id)return;let N=i?p:d;z.activeElement!==d&&z.activeElement!==p&&N.focus()})}return r}function Zt(){if(!F)return;let n=F;requestAnimationFrame(()=>{if(F!==n||(F=null,z.activeElement))return;let r=Array.from(z.querySelectorAll("[data-focus]")).find(d=>d.dataset.focus===n);r&&r.focus()})}function bo(n){let{comment:r,status:d,via:i}=n,p=[];return d==="hidden"&&p.push(s("span",{class:"gm-flag",text:"on another screen"})),d==="orphaned"&&p.push(s("span",{class:"gm-flag",text:"orphaned"})),(i==="ancestor"||i==="quote-loose")&&d!=="orphaned"&&p.push(s("span",{class:"gm-flag",text:"nearby"})),h&&h.isUnshared(r.id)&&p.push(s("span",{class:"gm-flag",text:"not shared yet"})),p}function Mi(n,r){let d=G!==null?n.find(H=>H.comment.id===G):null;if(!d){G!==null&&(G=null),te.hidden=!0;return}let{comment:i,status:p,element:w}=d,g=!h||h.isMine(i.id),v=i.state.screen&&i.state.screen.name,y=n.indexOf(d),E=be===i.id||W===i.id,A=JSON.stringify([i,p,d.via,g,y,v,be,W,O,Kt,ee,Te,pe,t.reviewer()]);if(!r&&te.childElementCount&&(E||A===ut))return;ut=A;let k=z.activeElement;!F&&k&&te.contains(k)&&k.dataset.focus&&(F=k.dataset.focus),te.textContent="";let N=s("div",{class:"gm-thread-ctx"},[s("span",{class:"where"},[s("b",{text:`#${y+1}`}),v?s("span",{class:"gm-screen",text:v}):null,s("span",{class:"gm-quote",text:mo(i.anchor,w)})]),...bo(d),i.status&&i.status!=="open"?s("span",{class:"gm-status",text:i.status}):null]),ge=s("div",{class:"gm-thread-body"});if(ge.appendChild(vo(i.author||C(i),{own:!!(h&&g),time:i.time})),i.intent.tag&&ge.appendChild(s("div",{class:"gm-meta",style:"margin-left:28px"},[s("span",{class:"gm-tag",text:i.intent.tag})])),be===i.id){let H=s("textarea",{"data-focus":`editing:${i.id}`});H.value=ce===null?i.intent.text:ce,H.addEventListener("input",()=>{ce=H.value,Te=!1});let Me=s("button",{type:"button",text:"Save"}),Ce=s("button",{type:"button",text:"Cancel"}),at=()=>{be=null,ce=null,Te=!1,F=`edit:${i.id}`,X(!0)};Me.addEventListener("click",()=>{let xt=H.value.trim();xt&&t.update(i.id,{intent:{...i.intent,text:xt}}),at()}),Ce.addEventListener("click",at),ge.append(H,s("div",{class:"gm-card-actions"},[Me,Ce]),s("div",{class:"gm-boxwarn",role:"status",text:Te?"Press again to discard what you typed.":""}))}else{let H=s("button",{type:"button",class:"gm-quiet",text:"Edit","data-focus":`edit:${i.id}`}),Me=s("button",{type:"button",class:"gm-del gm-quiet",text:"Delete","data-focus":`del:${i.id}`});H.addEventListener("click",()=>{be=i.id,ce=i.intent.text,Te=!1,F=`editing:${i.id}`,X(!0)}),pe===i.id&&(Me.textContent="Delete?",Me.dataset.armed="yes"),Me.addEventListener("click",()=>{if(pe!==i.id){pe=i.id,F=`del:${i.id}`,X(!0);return}pe=null,t.remove(i.id),X(!0),Ne.focus()});let Ce=g?[H,Me]:[];ge.append(s("p",{class:"gm-text",text:i.intent.text}),...Ce.length?[s("div",{class:"gm-card-actions"},Ce)]:[])}let _e=Ri(i);_e&&ge.appendChild(_e);let xe=s("div",{class:"gm-thread-foot"});if(h&&W===i.id)xe.appendChild(_i(i));else if(h){let H=s("button",{type:"button",class:"gm-reply-btn",text:"Reply","data-focus":`reply:${i.id}`});H.addEventListener("click",()=>{if(W&&W!==i.id&&ne.trim()&&!ee){ee=!0,X(!0);return}ee=!1,W=i.id,O=null,ne="",X(!0)}),xe.appendChild(H),W&&W!==i.id&&ee&&xe.appendChild(s("div",{class:"gm-boxwarn",role:"status",text:"Press again to discard the reply you were writing elsewhere."}))}te.append(N,ge,xe),te.hidden=!1,te.dataset.id=i.id,te.dataset.status=p,Zt()}function Ii(){if(te.hidden)return;let n=pt.get(G),r=te.offsetHeight||200,d=Lt();if(!n){te.style.left=`${Math.max(8,d-dt-16)}px`,te.style.top="52px";return}let{rect:i,textRight:p,frameRight:w}=n,g,v=n.top-8,y=!1;i.right+12+dt<=d-8?(g=i.right+12,y=!0):p+14+dt<=d-8?(g=p+14,y=!0):i.left-14-dt>=8?g=i.left-14-dt:(g=n.left,v=i.bottom+10);let E=ve(v,8,Math.max(8,window.innerHeight-r-8));te.style.left=`${ve(g,8,Math.max(8,d-dt-8))}px`,te.style.top=`${E}px`,te.classList.toggle("is-beside",y);let A=(i.top+i.bottom)/2;te.style.setProperty("--gm-caret",`${ve(A-E,12,Math.max(12,r-12))}px`);let k=ve(g,8,Math.max(8,d-dt-8));y&&k-6-w>12&&A>E&&A<E+r&&R.appendChild(s("div",{class:"gm-tie",style:`left:${w+1}px;top:${A}px;width:${k-6-w-1}px`}))}let st=!1,En="",wo=null,Ot=new Set,Tt=new Map;$t.addEventListener("click",()=>{st=!st,En="",en()});function Di(n){let r=n.state&&n.state.screen&&n.state.screen.name,d=n.anchor&&n.anchor.quote&&n.anchor.quote.exact;return s("div",{class:"gm-older"},[s("div",{class:"gm-meta"},[s("span",{class:M(n.author),text:L(n.author)}),r?s("span",{text:r}):null,n.status&&n.status!=="open"?s("span",{class:"gm-status",text:n.status}):null]),d?s("div",{class:"gm-older-quote",text:`"${d}"`}):null,s("p",{class:"gm-text",text:String(n.intent&&n.intent.text||"")})])}let yo="";function Fi(n){let r=n.identity.mode!=="none",d=se(n.identity.mode),i=n.unsent,p=n.identity.read==="members",w=i?`to send ${i} comment${i===1?"":"s"}`:p?"to see comments":"to comment",g="",v="",y="",E="",A=!1;if(r&&n.session)g=`Commenting as ${n.session.name||"you"}${n.session.username?` @${n.session.username}`:""} \xB7 ${se(n.session.provider)}`,E="Sign out";else if(r&&n.signin.state==="waiting")g=`Waiting for ${d}... Finish in the small window, and check it shows this code:`,v=n.signin.shortCode||"",E="Cancel",A=!0;else if(r&&n.signin.state==="blocked")g="Your browser blocked the sign-in window. Allow pop-ups for this page, then try again.",y=`Sign in with ${d}`,A=!0;else if(r&&n.signin.state==="not_member"){let ge=n.signin.who||{},_e=n.identity.mode==="github",xe=ge.members||n.identity.members||(_e?"the repository":"the group");g=`Your account ${_e?"has no access to":"is not in"} ${xe}. You are signed in to ${d} as ${ge.name||"someone"}, and only ${_e?"people who can open it":"members"} can ${p?"open this prototype":"comment here"}. Ask the author for access, or sign out of ${d} and sign in here with another account.`,y=`Sign in with ${d} again`,A=!0}else r&&n.signin.state==="failed"?(g="Sign-in did not finish.",y=`Sign in with ${d} ${w}`,A=!0):r&&(g=i?"Saved here. Not shared until you sign in.":"",y=`Sign in with ${d} ${w}`,A=i>0);let k=[r,g,v,y,E].join("|");if(k===yo)return;let N=z.activeElement===m||z.activeElement===x;yo=k,b.hidden=!r,b.classList.toggle("is-row",!!(g&&E&&!y&&!v)),Se.hidden=r,mt.textContent=g,mt.title=g,mt.hidden=!g,gt.textContent=v,gt.hidden=!v,l.hidden=!g&&!v,m.textContent=y,m.hidden=!y,x.textContent=E,x.hidden=!E,r&&n.session?ko(n.session):r&&(it.hidden=!0,rt.hidden=!1,rt.textContent="Sign in",qe.classList.add("is-text"),qe.setAttribute("aria-label",`Sign in with ${d}`)),A&&!ie&&(ie=!0,Ct()),N&&(y?m:E?x:m).focus()}function ko(n){let r=n&&n.name&&n.name.trim()||"";it.hidden=!r,rt.hidden=!!r,rt.textContent=r?"":"Your name",qe.classList.toggle("is-text",!r),it.style.setProperty("--gm-author",hn(n)),it.textContent=fn(r),qe.setAttribute("aria-label",r?`Your name: ${r}`:"Your name")}function en(){if(!h)return;let n=h.view();Fi(n);let r=n.versions.find(g=>g.version_id===h.versionId)||null,d=r?n.versions.filter(g=>g.version_id!==h.versionId):[];if(to.hidden=!r||d.length===0&&n.isLatest,!r)return;$t.textContent=`Version ${r.round}${n.isLatest?" (current)":""}`,$t.disabled=d.length===0,d.length||(st=!1),$t.setAttribute("aria-expanded",st?"true":"false"),ht.hidden=!st;let i=n.versions.find(g=>g.version_id===n.latest)||null,p=!n.isLatest&&i?`${i.round}|${i.has_page}`:"";p!==wo&&(wo=p,jt.textContent="",p&&(jt.appendChild(s("span",{text:`A newer version exists (Version ${i.round}). `})),jt.appendChild(i.has_page?s("a",{href:h.pageUrl(i.version_id),target:"_blank",rel:"noopener",text:`Open version ${i.round}`,"aria-label":`Open version ${i.round} in a new tab`}):s("span",{text:"Ask whoever sent you this page for the new one."}))));let w=JSON.stringify([st,n.versions,[...Ot],[...Tt.entries()].map(([g,v])=>[g,Array.isArray(v)?v.length:v])]);!st||w===En||(En=w,ht.textContent="",d.forEach(g=>{let v=`Version ${g.round} \xB7 ${g.comments} comment${g.comments===1?"":"s"}`;if(g.has_page){ht.appendChild(s("a",{class:"gm-vrow",href:h.pageUrl(g.version_id),target:"_blank",rel:"noopener",text:`${v} \xB7 open`,"aria-label":`${v}, opens in a new tab`}));return}let y=Ot.has(g.version_id),E=s("button",{class:"gm-vrow",type:"button","aria-expanded":y?"true":"false","data-focus":`version:${g.version_id}`,text:`${v} \xB7 ${y?"hide":"read"}`});if(E.addEventListener("click",async()=>{F=`version:${g.version_id}`,Ot.has(g.version_id)?Ot.delete(g.version_id):(Ot.add(g.version_id),Array.isArray(Tt.get(g.version_id))||(Tt.set(g.version_id,"loading"),en(),Tt.set(g.version_id,await h.loadVersion(g.version_id)||"failed"),F=`version:${g.version_id}`)),en()}),ht.appendChild(E),y){let A=Tt.get(g.version_id),k=s("div",{class:"gm-older-list"});A==="loading"?k.appendChild(s("div",{class:"gm-older-note",text:"Loading..."})):Array.isArray(A)?A.length?A.forEach(N=>k.appendChild(Di(N))):k.appendChild(s("div",{class:"gm-older-note",text:"No comments on that version."})):k.appendChild(s("div",{class:"gm-older-note",text:"Could not reach the comment service."})),ht.appendChild(k)}}),Zt())}function So(){let n=h.view();return n.problem?n.problem:n.state==="locked"?"Comments on this prototype are for members only. Sign in to see the latest.":n.state==="offline"?t.storageOk()===!1?"Working locally. Comments will be shared when the service is back; keep this tab open until then.":"Working locally. Comments will be shared when the service is back.":n.state==="connecting"||n.unsent>0?"Sharing...":n.identity.read==="members"?"Shared. Signed-in members see these comments.":"Shared. Everyone with this page sees these comments."}let Nt=n=>!!(h&&!h.isMine(n.id)&&t.isSeen&&!t.isSeen(n.id));function qi(n,r){let{comment:d,status:i}=n,p=!h||h.isMine(d.id),w=C(d),g=s("div",{class:"gm-meta"});h&&g.appendChild(s("span",{class:M(d.author),text:p?`${L(d.author)} (you)`:L(d.author)})),d.intent.tag&&g.appendChild(s("span",{class:"gm-tag",text:d.intent.tag})),bo(n).forEach(A=>g.appendChild(A)),d.status&&d.status!=="open"&&g.appendChild(s("span",{class:"gm-status",text:d.status}));let v=hi(d.time);v&&g.appendChild(s("span",{class:"gm-time",text:v}));let y=s("div",{class:"gm-card",role:"button",tabindex:"0","data-focus":`card:${d.id}`,"aria-label":`Comment ${r+1}${i==="found"?"":i==="hidden"?", on another screen":", orphaned"}${Nt(d)?", unread":""}: ${d.intent.text}`},[s("div",{class:"num",text:String(r+1)}),de(w),s("div",{class:"body"},[g,s("p",{class:"gm-text",text:d.intent.text})]),Nt(d)?s("span",{class:"dot","aria-hidden":"true"}):null]);y.classList.toggle("is-selected",G===d.id),y.classList.toggle("is-hot",Oe===d.id);let E=()=>{G===d.id?Yt():vn(d.id,{scroll:!0,from:"card"})};return y.addEventListener("click",E),y.addEventListener("keydown",A=>{A.key!=="Enter"&&A.key!==" "||(A.preventDefault(),E())}),y.addEventListener("pointerenter",()=>{Oe=d.id;let A=Qe.get(d.id);A&&A.classList.add("is-hot")}),y.addEventListener("pointerleave",()=>{Oe===d.id&&(Oe=null);let A=Qe.get(d.id);A&&A.classList.remove("is-hot")}),y}function zi(n){return JSON.stringify([Le,h?t.reviewer():"",n.map(r=>[r.comment.id,r.status,r.via,r.comment.intent,r.comment.author,r.comment.status,r.comment.state.screen,Nt(r.comment),h&&h.isUnshared(r.comment.id),r.comment.time])])}function Bi(n){let r=z.activeElement;!F&&r&&Pe.contains(r)&&r.dataset.focus&&(F=r.dataset.focus),Pe.textContent="",Qt.clear();let d=n.filter(g=>Le==="unread"?Nt(g.comment):Le==="mine"?!h||h.isMine(g.comment.id):!0);n.length?d.length||Pe.appendChild(s("div",{class:"gm-empty",text:Le==="unread"?"Nothing unread.":"None of these are yours."})):Pe.appendChild(s("div",{class:"gm-empty",text:"No comments yet. To leave one, press C or the Comment button, then click anything on the page."}));let i=new Map;d.forEach(g=>{let v=g.comment.state.screen&&g.comment.state.screen.name||"",y=g.status!=="hidden",E=`${y?"here":"there"}:${v}`;i.has(E)||i.set(E,{screen:v,here:y,entries:[]}),i.get(E).entries.push(g)});let p=[...i.values()].sort((g,v)=>Number(v.here)-Number(g.here)),w=p.length===1&&p[0].here;p.forEach(g=>{if(!w){let v=g.screen?`${g.screen}${g.here?"":" \xB7 another screen"}`:g.here?"This screen":"Elsewhere";Pe.appendChild(s("div",{class:"gm-group",text:v}))}g.entries.forEach(v=>{let y=qi(v,n.indexOf(v));Qt.set(v.comment.id,y),Pe.appendChild(y)})}),Zt()}function Pi(n){let r=n.length;ke.textContent=String(r),j.textContent=String(r);let d=n.filter(p=>Nt(p.comment)).length;Ne.title=`${r===1?"1 comment":`${r} comments`}${d?`, ${d} unread`:""}. `+(I?"Closes the comments list.":"Opens the comments list; Escape closes it."),kt.hidden=!d;let i="";if(!I&&h){let p=h.view();p.problem||p.state==="offline"||p.state==="locked"?i=So():!p.isLatest&&p.versions.some(w=>w.version_id===p.latest)&&(i="A newer version of this page exists. Open the comments to see it.")}else!I&&!h&&r&&!Pt&&t.hasUnexportedWork()&&(i=t.storageOk()===!1?"Not saved in this browser. Send to author is under the count.":"Kept in this browser. Send to author is under the count.");ct=i,oo(),$e.forEach(p=>{let w=p.dataset.filter===Le;p.classList.toggle("is-on",w),p.setAttribute("aria-pressed",w?"true":"false")}),(!h||h.view().identity.mode==="none")&&ko({name:t.reviewer()})}function Ui(n,r){let d=zi(n);r||d!==Ve||!Pe.childElementCount?(Ve=d,Bi(n)):Qt.forEach((p,w)=>{p.classList.toggle("is-selected",G===w),p.classList.toggle("is-hot",Oe===w)}),Mi(n,r),en(),Pi(n);let i=t.storageOk();eo.textContent=h?So():i===!1?"Not saved in this browser. Send or copy before you close this tab.":i===!0?"Kept in this browser until you send it.":"",z.activeElement!==Je&&(Je.value=t.reviewer()),z.activeElement!==D&&(D.value=t.overallNote()),t.overallNote()&&D.hidden&&(D.hidden=!1,ae.textContent="A note about the whole thing")}function X(n){let r=t.comments().map(d=>{let{element:i,status:p,via:w}=f(d.anchor,d.state&&d.state.screen);return{comment:d,element:i,status:p,via:w}});$n=r,Ui(r,n),Ni(r),Ii(),Cn(),fo(),Zt()}let An=!1;function Rt(){An||(An=!0,requestAnimationFrame(()=>{An=!1,X()}))}new MutationObserver(n=>{n.every(r=>r.target===K||K.contains(r.target))||(Z(),Rt())}).observe(document.body,{childList:!0,subtree:!0,attributes:!0,characterData:!0}),window.addEventListener("beforeunload",n=>{(h?h.view().unsent===0:!t.hasUnexportedWork())||(n.preventDefault(),n.returnValue="")}),window.addEventListener("scroll",Rt,!0),window.addEventListener("resize",()=>{Z(),Rt()}),window.addEventListener("scroll",()=>{Z(),Rt()},{once:!0,capture:!0}),document.addEventListener("transitionend",Z,!0),document.addEventListener("animationend",Z,!0);try{let n=window.matchMedia("(prefers-color-scheme: dark)");n&&n.addEventListener&&n.addEventListener("change",Z)}catch{}return t.subscribe(Rt),X(),{setCommentMode:Gt,isCommentMode:()=>J,openPanel:xn,closePanel:Ht,openThread:vn,render:X,isBoxOpen:()=>!le.hidden,target:()=>oe,theme:()=>Ae,shadow:z}}var es=()=>new Date().toISOString().replace(/\.\d{3}Z$/,"Z");function ts({anchor:e,element:t,text:o,tag:a}){return{id:Un(),time:es(),intent:{text:String(o||"").trim(),tag:a||null},anchor:e,state:{hash:location.hash||null,title:document.title||null,screen:rn(t),trail:qn(),scroll:{x:Math.round(window.scrollX),y:Math.round(window.scrollY)},viewport:{width:window.innerWidth,height:window.innerHeight},screenshot:null},status:"open"}}function vi(){jn(He.versionId);let e=Xn();Hn(Kn(),e.name,e.note),Qo();let t=ii({stamp:He,store:qt}),o=t?{...qt,add:t.add,update:t.update,remove:t.remove}:qt,a=xi({store:o,sync:t,batch:Qn,createComment:ts,anchorFromElement:Go,anchorFromSelection:Vo,resolve:an,setRecording:Xo,targetFor:Jo});window.__gitmargin={format:zt,versionId:He.versionId,file:He.file,export:Bt,markdown:mn,reviewedHtml:gn,originalLength:nn().length,trail:()=>qn(),lastCopy:null,lastCopyOk:null,ui:a,sync:t},t&&t.subscribe(()=>a.render())}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",vi,{once:!0}):vi();})();
