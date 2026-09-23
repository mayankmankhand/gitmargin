(()=>{var _i=Object.defineProperty;var Eo=(e,t)=>{for(var o in t)_i(e,o,{get:t[o],enumerable:!0})};function Mi(e){if(!e)return"";let t=e.publicId?` PUBLIC "${e.publicId}"`:"",o=e.systemId?`${e.publicId?"":" SYSTEM"} "${e.systemId}"`:"";return`<!DOCTYPE ${e.name}${t}${o}>
`}var _t=null;function On(){return _t===null&&(_t=Mi(document.doctype)+document.documentElement.outerHTML),_t}function tn(){return _t===null?On():_t}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",On,{once:!0}):On();function en(e){let t=document.querySelector(`meta[name="${e}"]`),o=t&&t.getAttribute("content");return o?o.trim():null}var Ue={versionId:en("gitmargin-version"),file:en("gitmargin-file"),service:en("gitmargin-service"),key:en("gitmargin-key")};var Ii=new Set(["active","open","selected","current","on","off","show","shown","hidden","visible","disabled","expanded","collapsed","checked","error"]),Lo=e=>window.CSS&&CSS.escape?CSS.escape(e):e.replace(/[^\w-]/g,"\\$&");function Tn(e){try{return document.querySelectorAll(e).length===1}catch{return!1}}function Ao(e){if(!e||!e.id)return null;let t=`#${Lo(e.id)}`;return Tn(t)?t:null}function Fi(e){return Array.from(e.classList).find(t=>/^[a-z][a-z0-9-]*$/i.test(t)&&t.length<=24&&!Ii.has(t.toLowerCase()))}function Di(e){let t=e.localName,o=e.parentElement;if(!o)return t;let d=Array.from(o.children).filter(u=>u.localName===t);if(d.length===1)return t;let c=Fi(e);return c&&d.filter(u=>u.classList.contains(c)).length===1?`${t}.${Lo(c)}`:`${t}:nth-of-type(${d.indexOf(e)+1})`}function Mt(e){if(!e||e.nodeType!==1)return null;let t=Ao(e);if(t)return t;let o=[],d=e,c=null;for(;d&&d.nodeType===1&&d!==document.documentElement;){o.unshift(Di(d));let f=Ao(d.parentElement);if(f){c=f;break}d=d.parentElement}let u=(c?`${c} > `:"")+o.join(" > ");if(Tn(u))return u;for(let f=o.length-1;f>=0;f-=1){let A=o.slice(f).join(" > ");if(Tn(A))return A}return u||null}var st="gitmargin-root",Qe=`#${st}`;function ce(e){return String(e??"").replace(/\s+/g," ").trim()}function qi(e,t){return e.localName==="br"||!(t==="contents"||t===""||t.startsWith("inline"))}function Oo(e,t){for(let o of e.childNodes){if(o.nodeType===3){t.push(o.data);continue}if(o.nodeType!==1)continue;let d=qi(o,getComputedStyle(o).display);d&&t.push(" "),Oo(o,t),d&&t.push(" ")}}function je(e){if(!e||e.nodeType!==1)return"";let t=[];return Oo(e,t),ce(t.join(""))}function Ze(e){if(!e||e.nodeType!==1)return"";let t=je(e);return t||ce(e.getAttribute("aria-label")||e.getAttribute("title")||"")}function To(e,t=40){let o=ce(e);return o.length>t?`${o.slice(0,t-1)}\u2026`:o}var Nn="h1, h2, h3, h4, h5, h6",It=e=>!!e&&e.nodeType===1&&e.getClientRects().length>0;function No(e){let t=e.querySelector(Nn);return t?je(t):""}function zi(e){let t=e&&e.closest?e.closest(Nn):null;if(It(t))return je(t);let o=Array.from(document.querySelectorAll(Nn)).filter(It),d="";for(let c of o){let u=c.compareDocumentPosition(e),f=u&Node.DOCUMENT_POSITION_FOLLOWING,A=u&Node.DOCUMENT_POSITION_CONTAINED_BY;(f||A)&&(d=je(c))}return d}function nn(e){let t=e&&e.closest?e.closest("[data-gm-screen]"):null;if(t)return{name:ce(t.getAttribute("data-gm-screen")),source:"data-gm-screen"};let o=Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).filter(It),d=o.find(R=>e&&R.contains(e))||o.find(R=>R.matches("dialog[open]"));if(d)return{name:No(d)||ce(d.getAttribute("aria-label"))||"Dialog",source:"dialog"};let c=document.querySelector('[aria-current="step"]');if(It(c))return{name:No(c)||Ze(c).slice(0,60),source:"aria-current"};let u=document.querySelector('[role="tab"][aria-selected="true"]');if(It(u))return{name:Ze(u),source:"tab"};let f=e?zi(e):"";if(f)return{name:f,source:"heading"};let A=ce(location.hash);return A?{name:A,source:"hash"}:{name:null,source:"none"}}var Ro=32,Mo=160,Bi=e=>e?e.nodeType===1?e:e.parentElement:null,on=e=>!!e&&e.nodeType===1&&e.getClientRects().length>0,He=e=>String(e??"").replace(/\s+/g,""),_o=e=>typeof e=="string"?e.replace(/\s+/g," ").trim():"";function Pi(e,t){let o=_o(e),d=_o(t);return!o||!d||o===d}function Ui(e,t){let o=He(t);return!o||He(e.textContent).includes(o)}function ji(e,t,o){let d=He(t&&t.prefix),c=He(t&&t.suffix),u=e.parentElement;if(!u||!d&&!c)return 0;let f=He(e.textContent).indexOf(o);if(f<0)return 0;let A=f;for(let B=e.previousSibling;B;B=B.previousSibling)(B.nodeType===1||B.nodeType===3)&&(A+=He(B.textContent).length);let R=He(u.textContent),h=0;return d&&R.slice(0,A).endsWith(d)&&(h+=1),c&&R.slice(A+o.length).startsWith(c)&&(h+=1),h}function Io(e,t){if(!t)return{prefix:"",exact:"",suffix:""};let o=je(e),d=o.indexOf(t);return d<0?{prefix:"",exact:t,suffix:""}:{prefix:o.slice(Math.max(0,d-Ro),d),exact:t,suffix:o.slice(d+t.length,d+t.length+Ro)}}function Hi(e,t){let o=e.getBoundingClientRect();if(!t||!o.width||!o.height)return{x:.5,y:.5};let d=c=>Math.min(1,Math.max(0,Math.round(c*1e3)/1e3));return{x:d((t.clientX-o.left)/o.width),y:d((t.clientY-o.top)/o.height)}}function Fo(e,t){let o=ce(Ze(e)).slice(0,Mo);return{selector:Mt(e),tag:e.localName,quote:Io(e.parentElement||document.body,o),point:Hi(e,t)}}function Do(e){let t=ce(e.toString()).slice(0,Mo),o=e.getRangeAt(0),d=Bi(o.commonAncestorContainer);return{selector:Mt(d),tag:d?d.localName:null,quote:Io(d,t),point:{x:.5,y:.5}}}function Wi(e){let t=e&&e.exact;if(!t)return[];let o=He(t);if(!o)return[];let d=f=>He(f.textContent),c=Array.from(document.querySelectorAll("body *")).filter(f=>!f.closest(Qe)&&d(f).includes(o)),u=f=>d(f)===o;return c.filter(f=>!c.some(A=>A!==f&&f.contains(A))).map(f=>({element:f,exact:u(f),context:ji(f,e,o),size:f.querySelectorAll("*").length})).sort((f,A)=>Number(A.exact)-Number(f.exact)||A.context-f.context||f.size-A.size).map(({element:f,exact:A})=>({element:f,exact:A}))}function Yi(e){if(!e)return null;let t=e.split(">").map(o=>o.trim()).filter(Boolean);for(let o=t.length-1;o>0;o-=1)try{let d=document.querySelector(t.slice(0,o).join(" > "));if(d&&!d.closest(Qe))return d}catch{}return null}function rn(e,t=null){if(!e)return{element:null,status:"orphaned",via:null};let o=[];if(e.selector)try{for(let U of document.querySelectorAll(e.selector))U&&!U.closest(Qe)&&o.push(U)}catch{}let d=o.find(on);if(d)return{element:d,status:"found",via:"selector"};let c=o.find(U=>Ui(U,e.quote&&e.quote.exact));if(c)return{element:c,status:"hidden",via:"selector"};let u=0,f=Wi(e.quote).filter(U=>!on(U.element)||Pi(t,nn(U.element).name)?!0:(u+=1,!1)),R=f.length>1?"quote-loose":"quote",h=f.find(U=>on(U.element));if(h)return{element:h.element,status:"found",via:R};if(u)return{element:null,status:"hidden",via:"screen"};if(o.length)return{element:o[0],status:"hidden",via:"selector"};if(f.length)return{element:f[0].element,status:"hidden",via:R};let B=Yi(e.selector);return B?{element:B,status:on(B)?"found":"hidden",via:"ancestor"}:{element:null,status:"orphaned",via:null}}var Vi=["button","a[href]","input","select","textarea","label","summary",'[role="button"]','[role="tab"]','[role="link"]','[role="menuitem"]','[role="option"]','[role="checkbox"]','[role="radio"]','[role="switch"]','[tabindex]:not([tabindex^="-"])'].join(","),Gi=["h1","h2","h3","h4","h5","h6","p","li","dt","dd","td","th","blockquote","figcaption","legend","img","svg","video","figure","picture"].join(","),Rn=e=>!!e&&(e.localName==="body"||e.localName==="html");function _n(e){if(!e||!e.closest)return null;let t=e.closest(Vi);return t&&!Rn(t)?t:null}function qo(e){if(!e||e.nodeType!==1||!e.closest||Rn(e)||e.closest(Qe))return null;let t=_n(e);if(t)return t;let o=e.closest(Gi);return o&&!Rn(o)?o:e}var Ji=20,Ki=40,sn=[],zo=!0,vt=null;function Bo(e){zo=!!e}function Xi(e){let t=_n(e);if(t)return t;if(e.localName==="body"||e.localName==="html")return null;let o=ce(Ze(e));return o&&o.length<=Ki?e:null}function Qi(e){let t=Ze(e);if(t)return t;if(e.labels&&e.labels.length){let o=ce(Array.from(e.labels,d=>je(d)).join(" "));if(o)return o}return ce(e.getAttribute("placeholder")||e.getAttribute("name")||"")}function Zi(e){if(!zo)return;let t=e.target;if(!t||t.nodeType!==1||t.closest(Qe))return;let o=Xi(t);o&&o!==vt&&(vt&&vt.localName==="label"&&(vt.contains(o)||vt.control===o)||(vt=o,sn.push({at:Date.now(),selector:Mt(o),text:To(Qi(o))}),sn.length>Ji&&sn.shift()))}function Po(){document.addEventListener("click",Zi,!0)}function Mn(e=Date.now()){return sn.map(t=>({seconds_before:Math.max(0,Math.round((e-t.at)/1e3)),selector:t.selector,text:t.text}))}var Dt={};Eo(Dt,{add:()=>pr,applyRemote:()=>gr,comments:()=>Pn,hasExported:()=>nr,hasUnexportedWork:()=>ir,isSeen:()=>lr,load:()=>zn,markExported:()=>or,markSeen:()=>dr,newId:()=>qn,overallNote:()=>Un,remove:()=>mr,reviewer:()=>dn,seed:()=>Bn,setOverallNote:()=>cr,setReviewer:()=>ar,storageOk:()=>tr,subscribe:()=>sr,update:()=>ur});var Uo="gitmargin:";function er(){let e=String(location.pathname||""),t=0;for(let o=0;o<e.length;o+=1)t=Math.imul(t,31)+e.charCodeAt(o)|0;return(t>>>0).toString(36)}function qn(){let e=new Uint8Array(3);return crypto.getRandomValues(e),`c_${Array.from(e,t=>t.toString(16).padStart(2,"0")).join("")}`}var D={comments:[],reviewer:"",overallNote:"",path:"",seen:[]},In=null,tr=()=>In,Fn=`${Uo}unversioned`,an=!1,nr=()=>an,or=()=>{an=!0},ir=()=>(D.comments.length>0||D.overallNote.trim().length>0)&&!an,Dn=new Set;function rr(){try{D.path=location.pathname||"",localStorage.setItem(Fn,JSON.stringify(D)),In=!0}catch{In=!1}}function Ft(){rr(),Dn.forEach(e=>e())}function ln(){an=!1,Ft()}function zn(e){Fn=`${Uo}${e||"unversioned"}:${er()}`;try{let t=JSON.parse(localStorage.getItem(Fn)||"null"),o=!t||!t.path||t.path===(location.pathname||"");t&&o&&Array.isArray(t.comments)&&(D.comments=t.comments,D.reviewer=typeof t.reviewer=="string"?t.reviewer:"",D.overallNote=typeof t.overallNote=="string"?t.overallNote:"",D.seen=Array.isArray(t.seen)?t.seen.filter(d=>typeof d=="string"):[])}catch{}}function Bn(e,t,o){let d=new Set(D.comments.map(u=>u.id)),c=(e||[]).filter(u=>u&&u.id&&!d.has(u.id));c.length&&(D.comments=c.concat(D.comments)),!D.reviewer&&t&&(D.reviewer=t),!D.overallNote&&o&&(D.overallNote=o),(c.length||t||o)&&Ft()}function sr(e){return Dn.add(e),()=>Dn.delete(e)}var Pn=()=>D.comments,dn=()=>D.reviewer,Un=()=>D.overallNote;function ar(e){D.reviewer=String(e||""),Ft()}var lr=e=>D.seen.includes(e);function dr(e){!e||D.seen.includes(e)||(D.seen.push(e),Ft())}function cr(e){D.overallNote=String(e||""),ln()}function pr(e){return D.comments.push(e),ln(),e}function ur(e,t){let o=D.comments.find(d=>d.id===e);return o?(Object.assign(o,t),ln(),o):null}function mr(e){let t=D.comments.findIndex(o=>o.id===e);return t<0?!1:(D.comments.splice(t,1),ln(),!0)}function gr({upsert:e=[],drop:t=[]}){if(!e.length&&!t.length)return;let o=new Set(t),d=new Map(D.comments.filter(c=>!o.has(c.id)).map(c=>[c.id,c]));e.forEach(c=>d.set(c.id,c)),D.comments=[...d.values()].sort((c,u)=>String(c.time||"").localeCompare(String(u.time||""))||String(c.id).localeCompare(String(u.id))),Ft()}var cn=null,jn=null;function fr(){cn=[],jn=[];for(let e=2,t=0;t<64;e+=1){let o=!0;for(let d=2;d*d<=e;d+=1)if(e%d===0){o=!1;break}o&&(t<8&&(jn[t]=Math.pow(e,1/2)*4294967296|0),cn[t]=Math.pow(e,1/3)*4294967296|0,t+=1)}}var Me=(e,t)=>e>>>t|e<<32-t;function jo(e){cn||fr();let t=[];for(let u=0;u<e.length;u+=1)t.push(e.charCodeAt(u)&255);let o=t.length*8;for(t.push(128);t.length%64!==56;)t.push(0);t.push(0,0,0,0,o>>>24&255,o>>>16&255,o>>>8&255,o&255);let d=jn.slice(0),c=[];for(let u=0;u<t.length;u+=64){for(let S=0;S<16;S+=1)c[S]=t[u+4*S]<<24|t[u+4*S+1]<<16|t[u+4*S+2]<<8|t[u+4*S+3];for(let S=16;S<64;S+=1){let le=Me(c[S-15],7)^Me(c[S-15],18)^c[S-15]>>>3,K=Me(c[S-2],17)^Me(c[S-2],19)^c[S-2]>>>10;c[S]=c[S-16]+le+c[S-7]+K|0}let[f,A,R,h,B,U,_,ne]=d;for(let S=0;S<64;S+=1){let le=ne+(Me(B,6)^Me(B,11)^Me(B,25))+(B&U^~B&_)+cn[S]+c[S]|0,K=(Me(f,2)^Me(f,13)^Me(f,22))+(f&A^f&R^A&R)|0;ne=_,_=U,U=B,B=h+le|0,h=R,R=A,A=f,f=le+K|0}[f,A,R,h,B,U,_,ne].forEach((S,le)=>{d[le]=d[le]+S|0})}return d.map(u=>`00000000${(u>>>0).toString(16)}`.slice(-8)).join("")}var Ho=5e3,Wo=3e4,hr=5*6e4,xr=6e4,vr=5e3,wt={full:"This prototype has reached its comment limit. Your comment is saved here but not shared.",replies_full:"This comment has reached its reply limit. Your reply is saved here but not shared.",slow_down:"Too many comments are arriving at once. Yours will be shared in a minute.",too_long:"A comment is too long to share. It is saved here; shorten it to share it.",invalid:"A comment could not be shared. It is saved here.",unknown_version:"The comment service does not know this version of the page. Comments are saved here only.",not_found:"The comment service does not know this prototype. Comments are saved here only."},Hn=e=>{let t=new Uint8Array(e);return crypto.getRandomValues(t),Array.from(t,o=>o.toString(16).padStart(2,"0")).join("")},wr=()=>`r_${Hn(3)}`,br=e=>new Date(e).toISOString().replace(/\.\d{3}Z$/,"Z");function Yo(e){let t=new Map;return{read(o){try{let d=e().getItem(o);return d?JSON.parse(d):t.get(o)??null}catch{return t.get(o)??null}},write(o,d){t.set(o,d);try{e().setItem(o,JSON.stringify(d))}catch{}}}}function yr(){try{let e=/(?:^#|&)gm_claim=([0-9a-f]{32})(?:&|$)/.exec(window.location.hash);if(!e)return null;let t=window.location.hash.replace(/(^#|&)gm_claim=[0-9a-f]{32}/,"$1").replace(/^#&?$/,"");try{window.history.replaceState(null,"",window.location.pathname+window.location.search+t)}catch{}return e[1]}catch{return null}}function kr(e,t){let o=new URL(e.service).origin;try{if(!t||!/^https?:$/.test(t.protocol)||!t.origin||t.origin==="null")return o;let d=/^\/p\/([^/]+)\/(latest|v\d{1,4}-[0-9a-f]{6})$/.exec(t.pathname);if(d&&decodeURIComponent(d[1])===e.key)return t.origin}catch{}return o}function Vo({stamp:e,store:t,fetchImpl:o=(..._)=>fetch(..._),now:d=()=>Date.now(),timers:c={set:(_,ne)=>setTimeout(_,ne),clear:_=>clearTimeout(_)},isHidden:u=()=>typeof document<"u"&&document.visibilityState==="hidden",onVisible:f=_=>typeof document<"u"&&document.addEventListener("visibilitychange",_),storage:A=null,openWindow:R=_=>window.open(_,"gitmargin-signin","popup,width=520,height=680"),takeArrivalCode:h=yr,sharedStorage:B=()=>typeof location<"u"&&location.protocol==="file:",pageLocation:U=()=>typeof location>"u"?null:{protocol:location.protocol,pathname:location.pathname,origin:typeof self<"u"&&typeof self.origin=="string"?self.origin:"null"}}){if(!e||!e.service||!e.key||!e.versionId)return null;let _,ne;try{let a=new URL(e.service);if(!/^https?:$/.test(a.protocol))return null;ne=kr(e,U()),_=`${ne}/api/p/${encodeURIComponent(e.key)}/comments`}catch{return null}let S=Yo(()=>A||localStorage),le=`gitmargin:token:${e.key}`,K=`gitmargin:sync:${e.key}:${e.versionId}`,q=S.read(le);(typeof q!="string"||q.length<16)&&(q=Hn(16),S.write(le,q));let Ee=`gitmargin:pass:${e.key}`,Z={mode:"none",read:"open",members:null},et=B()?Yo(()=>{throw new Error("tab only")}):S,N=et.read(Ee);(!N||typeof N.pass!="string"||!(Date.parse(N.expires)>d()))&&(N=null);let z={state:"idle",code:null,shortCode:null,who:null,timer:null,started:0},J=()=>Z.mode!=="none"&&!N;function V(a){let x={mode:a&&typeof a.identity=="string"?a.identity:"none",read:a&&a.read==="members"?"members":"open",members:a&&typeof a.members=="string"?a.members:null};x.mode===Z.mode&&x.read===Z.read&&x.members===Z.members||(Object.assign(Z,x),be())}function we(){N&&(N=null,et.write(Ee,null),be())}let W=S.read(K)||{},L=Array.isArray(W.ops)?W.ops:[],oe=new Set(Array.isArray(W.synced)?W.synced:[]),ee=new Set(Array.isArray(W.mine)?W.mine:[]),F=W.rejected&&typeof W.rejected=="object"?W.rejected:{},Q=()=>S.write(K,{ops:L,synced:[...oe],mine:[...ee],rejected:F}),Ie=new Set,ie={state:"connecting",problem:null,versions:[],latest:null},be=()=>Ie.forEach(a=>a());function ye(a){let g=JSON.stringify(ie);Object.assign(ie,a),JSON.stringify(ie)!==g&&be()}let Ye=null,I=null,Ae=!1,re=!1,pe=0,Le=d(),de=a=>t.comments().find(g=>g.id===a)||null;function Oe(a){for(let g of t.comments()){if(g.id===a)return g.author||null;let x=(g.replies||[]).find(w=>w.id===a);if(x)return x.author||null}return null}let ue=()=>N?{name:N.identity.name,provider:N.identity.provider,username:N.identity.username,verified:!0}:{name:t.reviewer()||""},Bt=1e3,Pt=600*1e3,lt=20*1e3;function Ve(a,g=null){z.timer!==null&&c.clear(z.timer),Object.assign(z,{timer:null,code:null,state:a,who:g,shortCode:a==="waiting"?z.shortCode:null}),be()}function dt(){let a=z.code;z.timer=c.set(async()=>{if(z.timer=null,z.code!==a)return;if(d()-z.started>Pt)return Ve("failed");let g=null,x=0;try{let w=await o(`${_.replace(/\/comments$/,"")}/auth/claim`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:a})});x=w.status,g=await w.json()}catch{}if(z.code===a){if(x===200&&g&&g.member===!0&&typeof g.pass=="string"){N={pass:g.pass,expires:g.expires,identity:g.identity||{}},et.write(Ee,N),Ve("idle"),$e();return}return x===200&&g&&g.member===!1?Ve("not_member",{...g.identity||{},members:g.members||null}):x===404&&d()-z.started<lt?dt():x===404||x===400?Ve("failed"):dt()}},Bt)}let ct=a=>L.filter(g=>g.id===a),tt=(a,g)=>L.some(x=>x.id===a&&x.op===g);function me(a){L.push(a),Le=d(),Q(),$e()}async function ke(a,g,x){let w=N?N.pass:null,$=await o(g,{method:a,headers:{"content-type":"application/json",...a==="GET"?{}:{"x-gitmargin-token":q},...w?{"x-gitmargin-pass":w}:{}},body:x===void 0?void 0:JSON.stringify(x)}),j=null;try{j=await $.json()}catch{}if(!$.ok&&!(j&&typeof j.error=="string"))throw new Error("unreadable answer");return{ok:$.ok,status:$.status,answer:j,carried:w}}function bt(a){N&&N.pass===a.carried&&we()}function Te(a){return{version_id:e.versionId,author:{name:a.author&&a.author.name||t.reviewer()||""},comment:{id:a.id,time:a.time,intent:a.intent,anchor:a.anchor,state:a.state}}}async function nt(a){let g=de(a.id),x=`${_}/${a.id}`,w;if(a.op==="add"){if(!g)return"drop";w=await ke("POST",_,Te(g))}else if(a.op==="edit"){if(!g)return"drop";w=await ke("PATCH",x,{intent:g.intent})}else if(a.op==="delete")w=await ke("DELETE",x);else if(a.op==="reply-add")w=await ke("POST",`${x}/replies`,a.reply);else if(a.op==="reply-edit"){let O=g&&(g.replies||[]).find(Y=>Y.id===a.rid);if(!O)return"drop";w=await ke("PATCH",`${x}/replies/${a.rid}`,{text:O.text})}else if(a.op==="reply-delete")w=await ke("DELETE",`${x}/replies/${a.rid}`);else return"drop";if(w.ok)return oe.add(a.id),"done";let $=w.answer.error;if($==="sign_in")return V({identity:w.answer.provider,read:Z.read,members:Z.members}),bt(w),"later";if($==="id_taken"&&(a.op==="add"||a.op==="reply-add"))return oe.add(a.id),ee.delete(a.op==="add"?a.id:a.rid),"drop";if($==="slow_down"||$==="service_unavailable")return ye({problem:wt[$]||null}),"later";if($==="not_found"&&a.op!=="add"&&a.op!=="reply-add")return"drop";a.op!=="delete"&&a.op!=="reply-delete"&&(F[a.rid||a.id]=$);let j=a.op==="reply-add"||a.op==="reply-edit";return ye({problem:(j&&$==="full"?wt.replies_full:wt[$])||wt.invalid}),"drop"}async function ot(){if(J())return L.length===0;for(;L.length;){let a=L[0];if(a.tried=!0,await nt(a)==="later")return!1;let x=L.indexOf(a);x>=0&&L.splice(x,1),Q()}return!0}function Fe(a,g){let x=[],w=[],$=new Set;for(let O of a.comments||[]){if(!O||typeof O.id!="string")continue;if($.add(O.id),O.deleted){w.push(O.id),oe.delete(O.id);for(let M=L.length-1;M>=0;M-=1)L[M].id===O.id&&L.splice(M,1);continue}oe.add(O.id);let Y=de(O.id),qe={...O};Y&&(tt(O.id,"edit")||F[O.id])&&(qe.intent=Y.intent);let Se=Array.isArray(O.replies)?[...O.replies]:[];for(let M of ct(O.id)){if(M.op==="reply-add"&&!Se.some(se=>se.id===M.rid)&&Se.push({...M.reply,time:M.time,updated:M.time}),M.op==="reply-delete"){let se=Se.findIndex(Be=>Be.id===M.rid);se>=0&&Se.splice(se,1)}if(M.op==="reply-edit"&&Y){let se=(Y.replies||[]).find(mt=>mt.id===M.rid),Be=Se.find(mt=>mt.id===M.rid);se&&Be&&(Be.text=se.text)}}for(let M of Y&&Y.replies||[]){if(!F[M.id])continue;let se=Se.find(Be=>Be.id===M.id);se?se.text=M.text:Se.push(M)}qe.replies=Se,!(Y&&JSON.stringify(Y)===JSON.stringify(qe))&&!tt(O.id,"delete")&&x.push(qe)}if(g){for(let O of t.comments())oe.has(O.id)&&!$.has(O.id)&&(w.push(O.id),oe.delete(O.id));for(let O of t.comments())$.has(O.id)||oe.has(O.id)||F[O.id]||tt(O.id,"add")||(ee.add(O.id),L.push({op:"add",id:O.id}),re=!0)}(x.length||w.length)&&(Le=d()),t.applyRemote({upsert:x,drop:w});let j=Date.parse(a.server_time);Number.isNaN(j)||(Ye=new Date(j-vr).toISOString()),Q(),V(a.prototype),ye({versions:Array.isArray(a.versions)?a.versions:[],latest:a.latest||null})}async function yt(){if(Ae){re=!0;return}Ae=!0;try{let a=await ot(),g=Ye===null,x=`${_}?version=${encodeURIComponent(e.versionId)}${g?"":`&since=${encodeURIComponent(Ye)}`}`,w=await ke("GET",x);!w.ok&&w.answer.error==="sign_in"?(V({identity:w.answer.provider,read:"members",members:Z.members}),bt(w),Ye=null,pe=0,N||ye({state:"locked",problem:null})):w.ok?(Fe(w.answer,g),pe=0,ye({state:"shared",problem:a?Object.keys(F).length?ie.problem:null:ie.problem})):(pe+=1,ye({state:"offline",problem:wt[w.answer.error]||wt.not_found}))}catch{pe+=1,ye({state:"offline"})}finally{Ae=!1,Ge(),re&&(re=!1,$e())}}function De(){return pe>0?Math.min(Ho*2**pe,xr):ie.state==="locked"||d()-Le>=hr?Wo:Ho}function Ge(){I!==null&&c.clear(I),I=null,!u()&&(I=c.set(()=>{I=null,yt()},De()))}function $e(){I!==null&&c.clear(I),I=null,yt()}f(()=>{u()?(I!==null&&c.clear(I),I=null):$e()});async function pt(a){try{let g=await o(`${_.replace(/\/comments$/,"")}/auth/claim`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:a})}),x=await g.json();g.status===200&&x&&x.member===!0&&typeof x.pass=="string"&&(N={pass:x.pass,expires:x.expires,identity:x.identity||{}},et.write(Ee,N))}catch{}}Q();let ut=h();return ut?pt(ut).then($e):$e(),{subscribe(a){return Ie.add(a),()=>Ie.delete(a)},view:()=>({...ie,unsent:L.length,isLatest:!ie.latest||ie.latest===e.versionId,identity:{...Z},session:N?{...N.identity}:null,signin:{state:z.state,shortCode:z.shortCode,who:z.who}}),isMine(a){let g=Oe(a);return g&&g.verified===!0?ee.has(a)||!!(N&&N.identity.provider===g.provider&&N.identity.username===g.username):ee.has(a)},signIn(){if(Z.mode==="none"||z.state==="waiting")return;let a=Hn(16),g=jo(a),x=R(`${ne}/auth/start?key=${encodeURIComponent(e.key)}&code_hash=${g}`),w=String(parseInt(g.slice(0,8),16)%1e4).padStart(4,"0");Object.assign(z,{code:a,shortCode:`${w.slice(0,2)}-${w.slice(2)}`,who:null,started:d()}),z.state=x?"waiting":"blocked",be(),x&&dt()},cancelSignIn(){Ve("idle")},async signOut(){if(!N)return;let a=N.pass;we();try{await o(`${_.replace(/\/comments$/,"")}/auth/session`,{method:"DELETE",headers:{"x-gitmargin-pass":a}})}catch{}},isUnshared:a=>!!F[a]||L.some(g=>g.op==="add"&&g.id===a||g.op==="reply-add"&&g.rid===a),versionId:e.versionId,async loadVersion(a){try{let g=await ke("GET",`${_}?version=${encodeURIComponent(a)}`);return g.ok?(g.answer.comments||[]).filter(x=>x&&!x.deleted):null}catch{return null}},pageUrl:a=>`${ne}/p/${encodeURIComponent(e.key)}/${encodeURIComponent(a)}`,add(a){let g=t.add({...a,author:ue(),replies:[],version_id:e.versionId});return ee.add(g.id),me({op:"add",id:g.id}),g},update(a,g){let x=t.update(a,g);if(!x)return x;let w=L.find($=>$.op==="add"&&$.id===a);return delete F[a],!w&&!oe.has(a)?me({op:"add",id:a}):!w||w.tried?me({op:"edit",id:a}):Q(),x},remove(a){if(!t.remove(a))return!1;let x=L.find($=>$.op==="add"&&$.id===a),w=!!x&&!x.tried;for(let $=L.length-1;$>=0;$-=1)L[$].id===a&&L.splice($,1);return delete F[a],w?Q():me({op:"delete",id:a}),!0},addReply(a,g){let x=de(a);if(!x)return null;let w=br(d()),$={id:wr(),text:String(g),author:ue()};return t.applyRemote({upsert:[{...x,replies:[...x.replies||[],{...$,time:w,updated:w}]}]}),ee.add($.id),me({op:"reply-add",id:a,rid:$.id,reply:$,time:w}),$},editReply(a,g,x){let w=de(a);if(!w)return!1;let $=(w.replies||[]).map(Y=>Y.id===g?{...Y,text:String(x)}:Y);t.applyRemote({upsert:[{...w,replies:$}]});let j=L.find(Y=>Y.op==="reply-add"&&Y.rid===g),O=!!F[g];if(delete F[g],j&&(j.reply={...j.reply,text:String(x)}),j&&!j.tried)Q(),$e();else if(!j&&O){let Y=$.find(qe=>qe.id===g);me({op:"reply-add",id:a,rid:g,reply:{id:g,text:String(x),author:Y.author},time:Y.time})}else me({op:"reply-edit",id:a,rid:g});return!0},removeReply(a,g){let x=de(a);if(!x)return!1;t.applyRemote({upsert:[{...x,replies:(x.replies||[]).filter(j=>j.id!==g)}]});let w=L.findIndex(j=>j.op==="reply-add"&&j.rid===g),$=!!F[g];return delete F[g],w>=0&&!L[w].tried?(L.splice(w,1),Q()):$&&w<0?Q():(w>=0&&L.splice(w,1),me({op:"reply-delete",id:a,rid:g})),!0},debug:()=>({delay:De(),ops:L.map(a=>({...a})),since:Ye,token:q}),stop(){I!==null&&c.clear(I),I=null}}}var Gn={};Eo(Gn,{FORMAT_VERSION:()=>qt,copy:()=>Er,download:()=>Cr,embeddedComments:()=>Yn,embeddedJson:()=>Xo,embeddedReviewer:()=>Vn,envelope:()=>zt,markdown:()=>pn,nounFor:()=>Ko,reviewedFileName:()=>Wn,reviewedHtml:()=>un});var qt="0.1",$r=(e=new Date)=>e.toISOString().replace(/\.\d{3}Z$/,"Z"),Go=e=>String(e??"").replace(/\r?\n/g," ").trim(),Sr={button:"button",a:"link",input:"field",select:"field",textarea:"field",img:"image",label:"label"};function Ko(e){let o=(String(e||"").split(">").pop().trim().match(/^[a-z][a-z0-9]*/i)||[""])[0].toLowerCase();return/^h[1-6]$/.test(o)?"heading":Sr[o]||"element"}function Yn(){let e=document.getElementById("gitmargin-comments");if(!e)return[];try{let t=JSON.parse(e.textContent||"null");return t&&Array.isArray(t.comments)?t.comments:[]}catch{return[]}}function Vn(){let e=document.getElementById("gitmargin-comments");if(!e)return{name:"",note:""};try{let t=JSON.parse(e.textContent||"null")||{};return{name:t.reviewer&&t.reviewer.name||"",note:t.overall_note||""}}catch{return{name:"",note:""}}}function Jo(e,t){let o=e&&typeof e.name=="string"&&e.name?e.name:t;return e&&e.verified===!0&&typeof e.provider=="string"&&e.provider?{name:o,provider:e.provider,username:typeof e.username=="string"?e.username:"",verified:!0}:{name:o}}function zt(){return{gitmargin:qt,file:Ue.file,version_id:Ue.versionId,exported_at:$r(),reviewer:{name:dn()||null},viewport:{width:window.innerWidth,height:window.innerHeight},overall_note:Un()||null,comments:Pn().map(e=>({id:e.id,time:e.time,intent:{text:e.intent.text,tag:e.intent.tag||null},anchor:e.anchor,state:e.state,status:e.status||"open",replies:(e.replies||[]).map(t=>({id:t.id||null,time:t.time||null,author:Jo(t.author,null),text:String(t.text||"")})),...e.author&&typeof e.author.name=="string"?{author:Jo(e.author,null)}:{}}))}}function Xo(){return JSON.stringify(zt(),null,2).replace(/</g,"\\u003c")}function pn(){let e=zt(),t=`${e.exported_at.slice(0,10)} ${e.exported_at.slice(11,16)} UTC`,o=[`gitmargin batch v${qt} | ${e.file||"unknown file"} | ${e.version_id||"no version id"}`,`Reviewer: ${e.reviewer.name||"not given"}. Viewport ${e.viewport.width}x${e.viewport.height}. Exported ${t}.`],d=e.comments.map((u,f)=>{let A=u.intent.tag?`[${u.intent.tag}] `:"",R=[],h=u.state.screen&&u.state.screen.name,B=h?`On "${h}"${u.state.hash?` (${u.state.hash})`:""}`:"On this page";R.push(B);let U=(u.state.trail||[]).map(Ee=>Ee.text).filter(Boolean);U.length&&R.push(`after clicking ${U.join(", ")}`);let _=u.anchor.quote&&u.anchor.quote.exact,ne=Ko(u.anchor.tag||u.anchor.selector),S=_?`the "${_}" ${ne}`:`the ${ne}`,le=u.anchor.selector?` (${u.anchor.selector})`:"",K=rn(u.anchor,h),q=K.status==="orphaned"?" [orphaned: spot not found]":K.via==="ancestor"||K.via==="quote-loose"?" [nearby: the exact element was not found, this is the closest match]":"";return`${f+1}. ${A}${R.join(", ")}: ${S}${le}${q}.
   "${Go(u.intent.text)}"`}),c=e.overall_note?[`Overall: ${Go(e.overall_note)}`]:[];return[o.join(`
`),d.join(`

`),c.join("")].filter(Boolean).join(`

`)}function un(){let e=tn().replace(/[ \t]*<script\b[^>]*\bid=["']gitmargin-comments["'][^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi,(c,u)=>{try{let f=JSON.parse(u);return f&&Array.isArray(f.comments)?"":c}catch{return c}}),t=`<script type="application/json" id="gitmargin-comments">
${Xo()}
<\/script>
`,o=-1,d=/<\/body\s*>/gi;for(let c=d.exec(e);c;c=d.exec(e))o=c.index;return o<0?e+t:e.slice(0,o)+t+e.slice(o)}function Wn(){let e=(Ue.file||"").replace(/\.x?html?$/i,""),t=String(dn()||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,24).replace(/-+$/,"");return`${e||"prototype"}.reviewed${t?`.${t}`:""}.html`}function Cr(){let e=new Blob([un()],{type:"text/html;charset=utf-8"}),t=URL.createObjectURL(e),o=document.createElement("a");return o.href=t,o.download=Wn(),o.style.display="none",document.body.appendChild(o),o.click(),o.remove(),setTimeout(()=>URL.revokeObjectURL(t),1e4),Wn()}async function Er(){let e=pn();try{return await navigator.clipboard.writeText(e),{ok:!0,text:e}}catch{try{let t=document.createElement("textarea");t.value=e,t.setAttribute("readonly",""),t.style.cssText="position:fixed;top:-1000px;opacity:0",document.body.appendChild(t),t.select();let o=document.execCommand("copy");return t.remove(),{ok:o,text:e}}catch{return{ok:!1,text:e}}}}var Qo=`/* Marker on a light prototype, Graphite on a dark one (issue #21).

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
`;function ti(e){if(typeof e!="string")return null;let t=e.trim(),o=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(t);if(o)return(o[4]===void 0?1:Number(o[4]))>0?[Number(o[1]),Number(o[2]),Number(o[3])]:null;let d=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(t);if(d){if(d[2]!==void 0&&parseInt(d[2],16)===0)return null;let c=parseInt(d[1],16);return[c>>16&255,c>>8&255,c&255]}return null}function Zo(e){let t=ti(e);if(!t)return null;let o=t.map(d=>{let c=d/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)});return .2126*o[0]+.7152*o[1]+.0722*o[2]}var Lr=.4,We=null;function ei(e,t){if(typeof e!="string")return null;if(ti(e)!==null||/^rgba?\(/i.test(e))return e;try{if(!We){let f=t.createElement("canvas");f.width=1,f.height=1,We=f.getContext("2d",{willReadFrequently:!0})}if(!We)return e;if(We.fillStyle="#000000",We.fillStyle=e,We.fillStyle==="#000000"&&!/^#0{6}$|^black$/i.test(e.trim()))return null;We.clearRect(0,0,1,1),We.fillRect(0,0,1,1);let[o,d,c,u]=We.getImageData(0,0,1,1).data;return u===0?null:`rgba(${o}, ${d}, ${c}, ${u/255})`}catch{return e}}var Or=e=>e<Lr?"dark":"light";function ni(e=document,t=null){let o=e.defaultView;if(!o||!e.documentElement)return"light";let d=u=>!!(u&&u.closest&&u.closest(`#${st}`)),c=t;if(!c)try{let u=o.innerWidth/2,f=o.innerHeight/2;c=(e.elementsFromPoint?e.elementsFromPoint(u,f):[e.elementFromPoint(u,f)]).find(R=>R&&!d(R))||null}catch{c=null}d(c)&&(c=null),c||(c=e.body);for(let u=c;u;u=u.parentElement){let f=null;try{f=o.getComputedStyle(u)}catch{f=null}if(!f)continue;let A=Zo(ei(f.backgroundColor,e));if(A!==null)return Or(A);if(f.backgroundImage&&f.backgroundImage!=="none"){let R=Zo(ei(f.color,e));if(R!==null)return R>.5?"dark":"light"}}return"light"}var oi=["#d1242f","#7c3aed","#2563eb","#0f766e","#15803d","#b45309","#be185d","#4338ca"],Tr="#6b7280";function Nr(e){let t=0;for(let o=0;o<e.length;o+=1)t=Math.imul(t,31)+e.charCodeAt(o)|0;return t>>>0}function mn(e){let t=String(e||"").trim().split(/\s+/).filter(Boolean);if(!t.length)return"?";let o=Array.from(t[0])[0]||"",d=t.length>1&&Array.from(t[t.length-1])[0]||"";return(o+d).toUpperCase()}function gn(e){let t=e&&(e.username||e.name),o=String(t||"").trim().toLowerCase();return o?oi[Nr(o)%oi.length]:Tr}var Rr=["change","bug","question","like"],_r=320,G=26,at=300;function s(e,t={},o=[]){let d=document.createElement(e);for(let[c,u]of Object.entries(t))c==="text"?d.textContent=u:c.startsWith("on")?d.addEventListener(c.slice(2).toLowerCase(),u):u!=null&&d.setAttribute(c,u);for(let c of[].concat(o))c&&d.appendChild(c);return d}function ii(e){let t="http://www.w3.org/2000/svg",o=document.createElementNS(t,"svg");o.setAttribute("viewBox","0 0 16 16"),o.setAttribute("aria-hidden","true"),o.setAttribute("class","gm-icon");let d=document.createElementNS(t,"path");return d.setAttribute("d",e),o.appendChild(d),o}var ri="M2 3h12v8H6l-3 3v-3H2z",ve=(e,t,o)=>Math.min(o,Math.max(t,e)),Mr=e=>String(e||"").replace(/\s+/g," ").trim();function si(e){let t=Date.parse(e||"");if(!Number.isFinite(t))return"";let o=Math.max(0,Math.round((Date.now()-t)/1e3));return o<60?"now":o<3600?`${Math.round(o/60)}m`:o<86400?`${Math.round(o/3600)}h`:`${Math.round(o/86400)}d`}function Ir(e,t){if(!e||typeof t!="string"||!t||t.length>200)return null;let o=new RegExp(t.split(/\s+/).map(u=>u.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+")),d=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),c;for(;c=d.nextNode();){let u=o.exec(c.data);if(u){let f=document.createRange();return f.setStart(c,u.index),f.setEnd(c,u.index+u[0].length),f}}return null}function ai(e){let{store:t,batch:o,createComment:d,anchorFromElement:c,anchorFromSelection:u,resolve:f,setRecording:A,targetFor:R}=e,h=e.sync||null,B={gitlab:"GitLab",github:"GitHub"},U=n=>B[n]||String(n||""),_=n=>{let r=n&&n.name&&n.name.trim()||"Someone";if(!n||n.verified!==!0)return r;let l=n.username?` @${n.username}`:"";return`${r}${l} \xB7 ${U(n.provider)}`},ne=n=>n&&n.verified===!0?"gm-author is-verified":"gm-author",S=n=>n.author||(h?null:{name:t.reviewer()}),le=(n,r="gm-avatar")=>s("span",{class:r,style:`--gm-author:${gn(n)}`,text:mn(n&&n.name),"aria-hidden":"true"}),K=s("div",{id:st,popover:"manual"}),q=K.attachShadow({mode:"open"});q.appendChild(s("style",{text:Qo})),document.body.appendChild(K);try{K.showPopover()}catch{K.removeAttribute("popover")}let Ee="light";function Z(){Ee=ni(document),K.classList.toggle("gm-dark",Ee==="dark")}Z();let et=s("div"),N=s("div");q.append(et,N);let z=s("div",{class:"gm-frame gm-target",hidden:"hidden"});q.appendChild(z);let J=!1,V=null,we=null,W=null,L=null,oe="",ee=!1,F=null,Q=null,Ie=null,ie=null,be=!1,ye=!1,Ye="",I=!1,Ae="all",re=!1,pe=null,Le=null,de=null,Oe=!1,ue=null,Bt=!1,Pt="pin",lt="",Ve="",dt="",ct=new Map,tt=new Map,me=s("button",{class:"gm-switch",type:"button",role:"switch","aria-checked":"false",title:"Comment mode. While this is on, clicking marks a spot instead of using the page. C turns it on, Escape off."},[ii(ri),s("span",{class:"label",text:"Comment"})]),ke=s("span",{class:"count",text:"0"}),bt=s("span",{class:"dot",hidden:"hidden"}),Te=s("button",{class:"gm-badge",type:"button","aria-expanded":"false",title:"All comments","data-focus":"badge"},[ii(ri),ke,bt]),nt=s("span",{class:"gm-avatar","aria-hidden":"true"}),ot=s("span",{class:"label",hidden:"hidden"}),Fe=s("button",{class:"gm-id",type:"button","aria-expanded":"false","aria-label":"Your name"},[nt,ot]),yt=s("div",{class:"gm-bar",role:"toolbar","aria-label":"gitmargin"},[me,Te,Fe]),De=s("button",{class:"gm-notice",type:"button","aria-live":"polite",hidden:"hidden"});De.addEventListener("click",()=>fn()),q.append(yt,De);let Ge=s("input",{type:"text",id:"gm-reviewer",placeholder:"optional",maxlength:"80"}),$e=s("div",{class:"gm-who"},[s("label",{for:"gm-reviewer",text:h?"Your name, shown with your comments":"Your name, for the author"}),Ge]),pt=s("span",{class:"gm-identity-says"}),ut=s("span",{class:"gm-identity-code",hidden:"hidden"}),a=s("div",{class:"gm-identity-live",role:"status","aria-live":"polite"},[pt,ut]),g=s("button",{type:"button",class:"gm-identity-btn"}),x=s("button",{type:"button",class:"gm-identity-quiet",hidden:"hidden"}),w=s("div",{class:"gm-identity",hidden:"hidden"},[a,s("div",{class:"gm-identity-actions"},[g,x])]);g.addEventListener("click",()=>h&&h.signIn()),x.addEventListener("click",()=>{h&&(h.view().signin.state==="waiting"?h.cancelSignIn():h.signOut())});let $=s("div",{class:"gm-pop gm-idpop",hidden:"hidden",role:"dialog","aria-label":"Your name"},[...h?[w]:[],$e]);q.appendChild($);let j=s("span",{class:"count",text:"0"}),O=s("div",{class:"gm-section"},[s("span",{text:"Comments"}),j]),Y=s("button",{class:"gm-close",type:"button",title:"Close","aria-label":"Close the comments list",text:"\u2715"}),qe=s("div",{class:"gm-filters",hidden:h?null:"hidden"}),Se=["all","unread","mine"].map(n=>s("button",{type:"button",class:"gm-filter","data-filter":n,"aria-pressed":"false",text:n[0].toUpperCase()+n.slice(1)}));Se.forEach(n=>{qe.appendChild(n),n.addEventListener("click",()=>{Ae=n.dataset.filter,X(!0)})});let ze=s("div",{class:"gm-list"}),M=s("textarea",{placeholder:"Anything that is not about one spot","aria-label":"A note about the whole thing",hidden:"hidden"}),se=s("button",{class:"gm-note-toggle",type:"button",text:"Add a note about the whole thing"}),Be=s("button",{class:"gm-btn primary",type:"button",text:"Send to author"}),mt=s("button",{class:"gm-btn ghost",type:"button",text:"Copy for author"}),Jn=s("div",{class:"gm-said",role:"status","aria-live":"polite"}),Kn=s("div",{class:"gm-keep",role:"status","aria-live":"polite"}),kt=s("button",{class:"gm-version",type:"button","aria-expanded":"false"}),gt=s("div",{class:"gm-versions",hidden:"hidden","aria-live":"polite"}),Ut=s("div",{class:"gm-newer",role:"status"}),Xn=s("div",{class:"gm-shared",hidden:"hidden"},[kt,gt,Ut]),Qn=s("div",{class:"gm-sheet",hidden:"hidden",role:"complementary","aria-label":"gitmargin comments"},[s("div",{class:"gm-sheet-head"},[s("div",{class:"gm-sheet-title"},[O,s("div",{class:"gm-spacer"}),Y]),Kn,...h?[Xn]:[]]),qe,ze,s("div",{class:"gm-foot"},[se,M,s("div",{class:"gm-send"},[Be,mt]),Jn])]);q.appendChild(Qn);let te=s("div",{class:"gm-thread",hidden:"hidden",role:"dialog","aria-label":"Comment"}),Je=s("div",{class:"gm-preview",hidden:"hidden","aria-hidden":"true"});q.append(te,Je),te.addEventListener("click",n=>n.stopPropagation());function $t(){yt.classList.toggle("is-shifted",I),De.classList.toggle("is-shifted",I),$.classList.toggle("is-shifted",I),Qn.hidden=!I,Te.setAttribute("aria-expanded",I?"true":"false"),$.hidden=!re,Fe.setAttribute("aria-expanded",re?"true":"false"),Zn()}function Zn(){De.textContent!==lt&&(De.textContent=lt),De.hidden=!lt||re||I}let fn=()=>{I||(I=!0,Bt=!0,re=!1,$t(),X(!0))},jt=()=>{I&&(I=!1,$t(),X())};function Ht(){re&&(re=!1,$t())}function hn(n,{scroll:r=!1,from:l="pin"}={}){if(V=n,Pt=l,pe=null,Ht(),h&&!h.isMine(n)&&t.markSeen&&t.markSeen(n),X(!0),!r)return;let i=kn.find(p=>p.comment.id===n);i&&i.element&&i.status==="found"&&i.element.scrollIntoView({block:"center",behavior:"smooth"})}function di(){let n=t.comments().find(r=>r.id===we);return n?n.intent.text:""}function eo(){return we!==null&&de!==null&&de!==di()&&!Oe?(Oe=!0,X(!0),!1):(Wt(),!0)}function Wt(){if(V===null)return;let n=V;V=null,we=null,de=null,Oe=!1,ue=null,oe.trim()||(W=null,L=null),X(!0),ci(n)}function ci(n){let r=Xe.get(n),l=I?Xt.get(n):null,i=b=>b&&b.isConnected&&b;((Pt==="card"?i(l)||i(r):i(r)||i(l))||Te).focus()}let Yt=n=>{J=!!n,A(!J),me.classList.toggle("is-on",J),document.documentElement.style.cursor=J?"crosshair":"",K.classList.toggle("gm-armed",J),me.setAttribute("aria-checked",J?"true":"false"),J?Ht():Ke(),!J&&!Ne.value.trim()&&xn()};me.addEventListener("click",()=>Yt(!J)),Te.addEventListener("click",()=>I?jt():fn()),Y.addEventListener("click",()=>{jt(),Te.focus()}),Fe.addEventListener("click",()=>{re=!re,$t(),re&&!$e.hidden&&Ge.focus()});function pi(){M.hidden=!1,se.textContent="A note about the whole thing",M.focus()}se.addEventListener("click",()=>{if(!M.hidden){M.hidden=!0,se.textContent="Add a note about the whole thing";return}pi()}),Ge.addEventListener("input",()=>t.setReviewer(Ge.value)),M.addEventListener("input",()=>t.setOverallNote(M.value));function to(n){Jn.textContent=n}function ui(){let n=o.download();t.markExported(),to(`Saved ${n} to your downloads. Reply to the message you got this file in and attach it.`)}async function mi(){let n=await o.copy();window.__gitmargin&&(window.__gitmargin.lastCopy=n.text,window.__gitmargin.lastCopyOk=n.ok),n.ok&&t.markExported(),to(n.ok?"Copied. Paste it anywhere.":"Could not reach the clipboard. Use Send to author instead.")}Be.addEventListener("click",ui),mt.addEventListener("click",mi);let no=s("div",{class:"where"}),Ne=s("textarea",{placeholder:"What did you expect here?","aria-label":"What did you expect here?"}),Vt=Rr.map(n=>s("button",{class:"gm-chip",type:"button",text:n,"data-tag":n,"aria-pressed":"false"})),St=s("div",{class:"gm-boxwarn"}),oo=s("button",{class:"gm-btn primary",type:"button",text:"Save"}),io=s("button",{class:"gm-btn",type:"button",text:"Cancel"}),ro="Not saved yet. Others will see this, so add your name, or press again to go without one.",Ct=s("input",{type:"text","aria-label":"Your name, shown with your comments","aria-describedby":"gm-box-name-why",placeholder:"Your name",maxlength:"80"}),Gt=s("div",{class:"gm-box-name",hidden:"hidden"},[s("div",{class:"gm-box-name-why",id:"gm-box-name-why",text:ro}),Ct]);function gi(){let n=ae.getBoundingClientRect();ae.style.top=`${ve(n.top,8,Math.max(8,window.innerHeight-n.height-8))}px`}let fi=()=>!!(h&&h.view().identity.mode!=="none"),Jt=!1,so=!1;function ao(n="box"){return!h||so||t.reviewer().trim()||fi()?!1:(so=!0,n==="box"?(Gt.hidden=!1,gi(),Ct.focus()):(Jt=!0,X(!0)),!0)}Ct.addEventListener("input",()=>t.setReviewer(Ct.value));let ae=s("div",{class:"gm-box",hidden:"hidden"},[no,Ne,s("div",{class:"gm-chips"},Vt),Gt,s("div",{class:"gm-box-actions"},[oo,io]),St]);q.appendChild(ae),Vt.forEach(n=>n.addEventListener("click",()=>{let r=n.dataset.tag;Q.tag=Q.tag===r?null:r,Vt.forEach(l=>{let i=l.dataset.tag===Q.tag;l.classList.toggle("is-on",i),l.setAttribute("aria-pressed",i?"true":"false")})}));function xn(){ae.hidden=!0,Q=null,Ke(),Vt.forEach(n=>{n.classList.remove("is-on"),n.setAttribute("aria-pressed","false")}),Ne.value="",St.textContent="",Gt.hidden=!0}function vn(){return Ne.value.trim()&&!St.textContent?(St.textContent="Press again to discard what you typed.",Ne.focus(),!1):(xn(),!0)}function lo(n,r){let l=n.quote&&n.quote.exact;if(l)return`"${l.slice(0,60)}"`;let i=r&&r.nodeType===1?(r.getAttribute("aria-label")||r.getAttribute("title")||"").trim():"",p=r&&r.nodeType===1?r.localName:"",b=o.nounFor(p||n.selector);return i?`the "${i}" ${b}`:`the ${b}`}function co({anchor:n,element:r,x:l,y:i,framed:p=null}){Q={anchor:n,element:r,tag:null},no.textContent=lo(n,r),p?bn(p):Ke(),Wt(),Ne.value="",ae.hidden=!1;let b=300,m=ae.getBoundingClientRect().height||190,v=l,y=i;if(!Number.isFinite(v)||!Number.isFinite(y)||v===0&&y===0){let C=r&&r.getBoundingClientRect?r.getBoundingClientRect():{left:24,bottom:24};v=C.left,y=C.bottom}ae.style.left=`${ve(v+12,8,Et()-b-8)}px`,ae.style.top=`${ve(y+12,8,window.innerHeight-m-8)}px`,Ne.focus()}function wn(){let n=Ne.value.trim();if(!n||!Q||ao())return;Gt.hidden=!0;let r=d({anchor:Q.anchor,element:Q.element,text:n,tag:Q.tag});t.add(r),xn()}oo.addEventListener("click",wn),io.addEventListener("click",vn),Ne.addEventListener("keydown",n=>{n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&wn()}),Ct.addEventListener("keydown",n=>{n.key==="Enter"&&!n.isComposing&&wn()}),Ne.addEventListener("input",()=>{St.textContent=""}),document.addEventListener("keydown",n=>{if(n.key==="Escape"){if(!ae.hidden){n.preventDefault(),vn();return}if(V!==null){n.preventDefault(),eo();return}if(re){n.preventDefault(),Ht();return}if(I){n.preventDefault(),jt(),Te.focus();return}J&&(n.preventDefault(),Yt(!1))}});let Kt=4;function po(){if(!ie)return;let n=ie.isConnected?ie.getBoundingClientRect():null;if(!n||!n.width&&!n.height){Ke();return}let r=Math.max(n.left-3,Kt),l=Math.max(n.top-3,Kt),i=Math.min(n.right+3,window.innerWidth-Kt),p=Math.min(n.bottom+3,window.innerHeight-Kt);if(i<=r||p<=l){z.hidden=!0;return}z.style.left=`${r}px`,z.style.top=`${l}px`,z.style.width=`${i-r}px`,z.style.height=`${p-l}px`,z.hidden=!1}function bn(n){ie=n,po()}function Ke(){ie=null,z.hidden=!0}function uo(){let n=window.getSelection();return!n||n.isCollapsed||!n.toString().trim()?null:ye||n.toString()!==Ye?n:null}function hi(){return be&&!!uo()}function xi(n){if(!J||!ae.hidden)return;if(hi()){Ke();return}let r=R(n);r?bn(r):Ke()}let mo=null,yn=!1;document.addEventListener("pointermove",n=>{J&&(mo=n.target,!yn&&(yn=!0,requestAnimationFrame(()=>{yn=!1,xi(mo)})))},!0),document.addEventListener("pointerdown",()=>{be=!0,ye=!1,Ye=String(window.getSelection()||"")},!0),document.addEventListener("selectionchange",()=>{be&&(ye=!0)}),document.addEventListener("pointerup",()=>{be=!1},!0),document.addEventListener("pointercancel",()=>{be=!1},!0),document.documentElement.addEventListener("pointerleave",()=>{J&&ae.hidden&&Ke()}),document.addEventListener("focusin",n=>{if(!J||!ae.hidden)return;let r=R(n.target);r?bn(r):Ke()},!0),document.addEventListener("mouseup",()=>{J&&(Ie=uo())},!0),document.addEventListener("click",n=>{let r=n.target,l=r&&r.nodeType===1&&r.closest(`#${st}`);if(l||(Ht(),V!==null&&(ae.hidden||J)&&eo()),!J||!r||r.nodeType!==1||l||(n.preventDefault(),n.stopPropagation(),!ae.hidden&&!vn()))return;let i,p,b=null;if(Ie)i=u(Ie),p=Ie.getRangeAt(0).commonAncestorContainer,p=p.nodeType===1?p:p.parentElement,Ie=null;else{let m=R(r);if(!m)return;i=c(m,n),p=m,b=m}co({anchor:i,element:p,x:n.clientX,y:n.clientY,framed:b})},!0),document.addEventListener("keydown",n=>{if(!ae.hidden||n.key!=="c"&&n.key!=="C"||n.metaKey||n.ctrlKey||n.altKey)return;let r=document.activeElement;for(;r&&r.shadowRoot&&r.shadowRoot.activeElement;)r=r.shadowRoot.activeElement;if(r&&(r.isContentEditable||r.matches("input, textarea, select")))return;if(!J){n.preventDefault(),Yt(!0);return}let l=window.getSelection(),i=l&&!l.isCollapsed&&l.toString().trim();if(!i&&r&&r.closest&&r.closest(`#${st}`))return;let p=i?l.getRangeAt(0).commonAncestorContainer.nodeType===1?l.getRangeAt(0).commonAncestorContainer:l.getRangeAt(0).commonAncestorContainer.parentElement:ie||R(r);if(!p)return;n.preventDefault();let b=i?u(l):c(p,null);co({anchor:b,element:p,framed:i?null:p})});let Xe=new Map,Xt=new Map,kn=[],Et=()=>window.innerWidth-(I?_r:0);function vi(n,r,l){let i=n.anchor.quote&&n.anchor.quote.exact;return!!(l&&i&&Mr(r.textContent).length>i.length)}function wi(n){try{let r=document.createRange();r.selectNodeContents(n);let l=Array.from(r.getClientRects()).filter(i=>i.width&&i.height);return l.length?{left:Math.min(...l.map(i=>i.left)),right:Math.max(...l.map(i=>i.right))}:null}catch{return null}}function bi(n,r,l){let p=[[n+G/2,r+G/2],[n+1,r+1],[n+G-1,r+1],[n+1,r+G-1],[n+G-1,r+G-1]];for(let[b,m]of p){let v=null;try{v=document.elementFromPoint(b,m)}catch{return!0}if(!(!v||v===document.body||v===document.documentElement)){if(v===K)return!1;if(!(v===l||v.contains(l)))return!1}}return!0}function yi(n){N.textContent="",ct.clear();let r=new Set,l=[];for(let i of Xe.values())i.style.pointerEvents="none";n.forEach(({comment:i,status:p,element:b},m)=>{if(p!=="found"||!b)return;let v=b.getBoundingClientRect();if(v.bottom<0||v.top>window.innerHeight||v.right<0||v.left>window.innerWidth)return;r.add(i.id);let y=null;try{y=Ir(b,i.anchor.quote&&i.anchor.quote.exact)}catch{}let C=y?Array.from(y.getClientRects()).filter(P=>P.width):[],E=vi(i,b,y)&&C.length>0,k=E?{x:C[C.length-1].right,top:C[C.length-1].top,bottom:C[C.length-1].bottom}:{x:v.left,top:v.top,bottom:v.bottom},T=Xe.get(i.id);T||(T=s("button",{class:"gm-pin",type:"button","data-focus":`pin:${i.id}`},[s("span",{class:"initials"})]),T.addEventListener("click",P=>{P.stopPropagation(),V===i.id?Wt():hn(i.id)}),T.addEventListener("pointerenter",P=>{P.pointerType&&P.pointerType!=="mouse"||V===null&&(pe=i.id,$n())}),T.addEventListener("pointerleave",()=>{pe===i.id&&(pe=null,$n())}),Xe.set(i.id,T),et.appendChild(T));let ge=S(i);T.style.setProperty("--gm-author",gn(ge)),T.firstChild.textContent=mn(ge&&ge.name),T.title=i.intent.text,T.setAttribute("aria-label",`Comment ${m+1}: ${i.intent.text}`),T.classList.toggle("is-selected",V===i.id),T.classList.toggle("is-hot",Le===i.id);let Re=wi(b),xe=Re?{left:Math.max(v.left,Re.left-2),right:Math.min(v.right,Re.right+2)}:{left:v.left,right:v.right};V===i.id&&N.appendChild(s("div",{class:"gm-frame",style:`left:${xe.left-3}px;top:${v.top-3}px;width:${xe.right-xe.left+6}px;height:${v.height+6}px`}));let H=4,_e=G-4,Ce=E?[{left:k.x-2,top:k.top-G-H,cls:"",dir:1,at:[k.x,k.top]},{left:k.x-2,top:k.bottom+H,cls:"is-below",dir:1,at:[k.x,k.bottom]}]:[{left:k.x-G+H,top:k.top-G+H,cls:"is-left",dir:-1,at:[k.x,k.top]},{left:k.x-G+H,top:k.top-H,cls:"is-below is-left",dir:-1,at:[k.x,k.top]},{left:k.x-2,top:k.top-G-H,cls:"",dir:1,at:[k.x,k.top]},{left:k.x-2,top:k.bottom+H,cls:"is-below",dir:1,at:[k.x,k.bottom]},{left:k.x-G+H,top:k.bottom-H,cls:"is-below is-left",dir:-1,at:[k.x,k.bottom]}],rt=Et()-G-2,ft=window.innerHeight-G-2,En=(P,Pe)=>l.some(he=>P<he.right+6&&P+G>he.left-6&&Pe<he.bottom+6&&Pe+G>he.top-6),bo=`${Math.round(k.x)},${Math.round(k.top)},${Math.round(k.bottom)},${rt},${ft},${E?1:0}`,Nt=tt.get(i.id),fe=Nt&&Nt.key===bo&&!En(Nt.pick.left,Nt.pick.top)?Nt.pick:null;for(let P of fe?[]:Ce){for(let Pe=0;Pe<=3&&!fe;Pe+=1){let he=P.left+Pe*_e*P.dir,Rt=P.top;he<2||he>rt||Rt<2||Rt>ft||En(he,Rt)||!bi(he,Rt,b)||(fe={...P,left:he,top:Rt})}if(fe)break}if(!fe){let P=ve(Ce[0].left,2,rt),Pe=ve(Ce[0].top,2,ft);for(let he=0;he<4&&En(P,Pe);he+=1)P=ve(P+_e*Ce[0].dir,2,rt);fe={...Ce[0],left:P,top:Pe}}tt.set(i.id,{key:bo,pick:fe});let ht=fe.left,xt=fe.top,yo=fe.cls.includes("is-left"),An=fe.cls.includes("is-below");T.style.left=`${ht}px`,T.style.top=`${xt}px`,T.style.pointerEvents="",T.classList.toggle("is-left",yo),T.classList.toggle("is-below",An),l.push({left:ht,top:xt,right:ht+G,bottom:xt+G}),ct.set(i.id,{left:ht,top:xt,below:An,rect:v,textRight:xe.right,frameRight:xe.right+3});let ko=yo?ht+G:ht,$o=An?xt:xt+G,So=fe.at[0]-ko,Co=fe.at[1]-$o,Ln=Math.hypot(So,Co);if(Ln>8&&Ln<240){let P=Math.atan2(Co,So)*180/Math.PI;N.appendChild(s("div",{class:"gm-leader",style:`left:${ko}px;top:${$o}px;width:${Ln}px;transform:rotate(${P}deg)`}))}if(E)for(let P of C)N.appendChild(s("div",{class:"gm-underline",style:`left:${P.left}px;top:${P.bottom}px;width:${P.width}px`}))});for(let[i,p]of Xe)r.has(i)||(p.remove(),Xe.delete(i),tt.delete(i))}function $n(){let n=pe!==null?kn.find(m=>m.comment.id===pe):null,r=n&&ct.get(n.comment.id);if(!n||!r){Je.hidden=!0;return}Je.textContent="";let l=S(n.comment);Je.append(s("b",{text:_(l)}),s("span",{text:n.comment.intent.text})),Je.hidden=!1;let i=220,p=Je.offsetHeight||44,b=r.left+G+8;b+i>Et()-8&&(b=r.left-i-8),Je.style.left=`${ve(b,8,Et()-i-8)}px`,Je.style.top=`${ve(r.top,8,window.innerHeight-p-8)}px`}function go(n,{own:r=!1,time:l=""}={}){let i=s("div",{class:"gm-meta"},[s("span",{class:ne(n),text:r?`${_(n)} (you)`:_(n)}),l?s("span",{class:"gm-time",text:si(l)}):null]);return s("div",{class:"gm-who-row"},[le(n),i])}function ki(n){let r=Array.isArray(n.replies)?n.replies:[],l=h&&W===n.id;if(!r.length||l&&L&&r.length===1)return null;let i=s("div",{class:"gm-replies"});return r.forEach(p=>{if(l&&L===p.id)return;let b=h&&h.isMine(p.id),m=s("div",{class:"gm-reply"},[go(p.author,{own:b,time:p.time}),h&&h.isUnshared(p.id)?s("div",{class:"gm-meta",style:"margin-left:28px"},[s("span",{class:"gm-flag",text:"not shared yet"})]):null,s("p",{class:"gm-text",text:String(p.text||"")})]);if(b){let v=s("button",{type:"button",class:"gm-quiet",text:"Edit","data-focus":`redit:${p.id}`}),y=s("button",{type:"button",class:"gm-del gm-quiet",text:"Delete","data-focus":`rdel:${p.id}`});v.addEventListener("click",()=>{W=n.id,L=p.id,oe=String(p.text||""),X(!0)}),ue===`reply:${p.id}`&&(y.textContent="Delete?",y.dataset.armed="yes"),y.addEventListener("click",()=>{if(ue!==`reply:${p.id}`){ue=`reply:${p.id}`,F=`rdel:${p.id}`,X(!0);return}ue=null,h.removeReply(n.id,p.id),F=`reply:${n.id}`,X(!0)}),m.appendChild(s("div",{class:"gm-card-actions"},[v,y]))}i.appendChild(m)}),i}function $i(n){let r=s("div",{class:"gm-reply-write"});{let l=s("input",{type:"text",class:"gm-reply-field","aria-label":"Your reply",placeholder:"Reply",maxlength:"4000"});l.value=oe;let i=Jt&&!t.reviewer().trim(),p=s("input",{type:"text",class:"gm-reply-field gm-reply-name","aria-label":"Your name, shown with your comments","aria-describedby":"gm-reply-name-why",placeholder:"Your name",maxlength:"80"}),b=s("div",{class:"gm-boxwarn",role:"status",text:ee?"Press again to discard what you typed.":""}),m=s("button",{type:"button",class:"gm-reply-send",text:L?"Save":"Send"}),v=s("button",{type:"button",text:"Cancel"}),y=()=>{W=null,L=null,oe="",Jt=!1,ee=!1,F=`reply:${n.id}`,X(!0)},C=()=>{if(l.value.trim()&&!ee){ee=!0,b.textContent="Press again to discard what you typed.";return}y()},E=()=>{let T=l.value.trim();T&&(ao("panel")||(i&&p.value.trim()&&t.setReviewer(p.value),L?h.editReply(n.id,L,T):h.addReply(n.id,T),y()))};l.addEventListener("input",()=>{oe=l.value,ee=!1,b.textContent=""});let k=T=>{T.key==="Enter"&&!T.isComposing&&E(),T.key==="Escape"&&(T.stopPropagation(),C())};l.addEventListener("keydown",k),p.addEventListener("keydown",k),m.addEventListener("click",E),v.addEventListener("click",C),i&&r.appendChild(s("div",{class:"gm-reply-ask"},[s("div",{class:"gm-box-name-why",id:"gm-reply-name-why",text:ro}),p])),r.appendChild(s("div",{class:"gm-reply-row"},[l,m,v])),r.appendChild(b),requestAnimationFrame(()=>{if(W!==n.id)return;let T=i?p:l;q.activeElement!==l&&q.activeElement!==p&&T.focus()})}return r}function Qt(){if(!F)return;let n=F;requestAnimationFrame(()=>{if(F!==n||(F=null,q.activeElement))return;let r=Array.from(q.querySelectorAll("[data-focus]")).find(l=>l.dataset.focus===n);r&&r.focus()})}function fo(n){let{comment:r,status:l,via:i}=n,p=[];return l==="hidden"&&p.push(s("span",{class:"gm-flag",text:"on another screen"})),l==="orphaned"&&p.push(s("span",{class:"gm-flag",text:"orphaned"})),(i==="ancestor"||i==="quote-loose")&&l!=="orphaned"&&p.push(s("span",{class:"gm-flag",text:"nearby"})),h&&h.isUnshared(r.id)&&p.push(s("span",{class:"gm-flag",text:"not shared yet"})),p}function Si(n,r){let l=V!==null?n.find(H=>H.comment.id===V):null;if(!l){V!==null&&(V=null),te.hidden=!0;return}let{comment:i,status:p,element:b}=l,m=!h||h.isMine(i.id),v=i.state.screen&&i.state.screen.name,y=n.indexOf(l),C=we===i.id||W===i.id,E=JSON.stringify([i,p,l.via,m,y,v,we,W,L,Jt,ee,Oe,ue,t.reviewer()]);if(!r&&te.childElementCount&&(C||E===dt))return;dt=E;let k=q.activeElement;!F&&k&&te.contains(k)&&k.dataset.focus&&(F=k.dataset.focus),te.textContent="";let T=s("div",{class:"gm-thread-ctx"},[s("span",{class:"where"},[s("b",{text:`#${y+1}`}),v?s("span",{class:"gm-screen",text:v}):null,s("span",{class:"gm-quote",text:lo(i.anchor,b)})]),...fo(l),i.status&&i.status!=="open"?s("span",{class:"gm-status",text:i.status}):null]),ge=s("div",{class:"gm-thread-body"});if(ge.appendChild(go(i.author||S(i),{own:!!(h&&m),time:i.time})),i.intent.tag&&ge.appendChild(s("div",{class:"gm-meta",style:"margin-left:28px"},[s("span",{class:"gm-tag",text:i.intent.tag})])),we===i.id){let H=s("textarea",{"data-focus":`editing:${i.id}`});H.value=de===null?i.intent.text:de,H.addEventListener("input",()=>{de=H.value,Oe=!1});let _e=s("button",{type:"button",text:"Save"}),Ce=s("button",{type:"button",text:"Cancel"}),rt=()=>{we=null,de=null,Oe=!1,F=`edit:${i.id}`,X(!0)};_e.addEventListener("click",()=>{let ft=H.value.trim();ft&&t.update(i.id,{intent:{...i.intent,text:ft}}),rt()}),Ce.addEventListener("click",rt),ge.append(H,s("div",{class:"gm-card-actions"},[_e,Ce]),s("div",{class:"gm-boxwarn",role:"status",text:Oe?"Press again to discard what you typed.":""}))}else{let H=s("button",{type:"button",class:"gm-quiet",text:"Edit","data-focus":`edit:${i.id}`}),_e=s("button",{type:"button",class:"gm-del gm-quiet",text:"Delete","data-focus":`del:${i.id}`});H.addEventListener("click",()=>{we=i.id,de=i.intent.text,Oe=!1,F=`editing:${i.id}`,X(!0)}),ue===i.id&&(_e.textContent="Delete?",_e.dataset.armed="yes"),_e.addEventListener("click",()=>{if(ue!==i.id){ue=i.id,F=`del:${i.id}`,X(!0);return}ue=null,t.remove(i.id),X(!0),Te.focus()});let Ce=m?[H,_e]:[];ge.append(s("p",{class:"gm-text",text:i.intent.text}),...Ce.length?[s("div",{class:"gm-card-actions"},Ce)]:[])}let Re=ki(i);Re&&ge.appendChild(Re);let xe=s("div",{class:"gm-thread-foot"});if(h&&W===i.id)xe.appendChild($i(i));else if(h){let H=s("button",{type:"button",class:"gm-reply-btn",text:"Reply","data-focus":`reply:${i.id}`});H.addEventListener("click",()=>{if(W&&W!==i.id&&oe.trim()&&!ee){ee=!0,X(!0);return}ee=!1,W=i.id,L=null,oe="",X(!0)}),xe.appendChild(H),W&&W!==i.id&&ee&&xe.appendChild(s("div",{class:"gm-boxwarn",role:"status",text:"Press again to discard the reply you were writing elsewhere."}))}te.append(T,ge,xe),te.hidden=!1,te.dataset.id=i.id,te.dataset.status=p,Qt()}function Ci(){if(te.hidden)return;let n=ct.get(V),r=te.offsetHeight||200,l=Et();if(!n){te.style.left=`${Math.max(8,l-at-16)}px`,te.style.top="52px";return}let{rect:i,textRight:p,frameRight:b}=n,m,v=n.top-8,y=!1;i.right+12+at<=l-8?(m=i.right+12,y=!0):p+14+at<=l-8?(m=p+14,y=!0):i.left-14-at>=8?m=i.left-14-at:(m=n.left,v=i.bottom+10);let C=ve(v,8,Math.max(8,window.innerHeight-r-8));te.style.left=`${ve(m,8,Math.max(8,l-at-8))}px`,te.style.top=`${C}px`,te.classList.toggle("is-beside",y);let E=(i.top+i.bottom)/2;te.style.setProperty("--gm-caret",`${ve(E-C,12,Math.max(12,r-12))}px`);let k=ve(m,8,Math.max(8,l-at-8));y&&k-6-b>12&&E>C&&E<C+r&&N.appendChild(s("div",{class:"gm-tie",style:`left:${b+1}px;top:${E}px;width:${k-6-b-1}px`}))}let it=!1,Sn="",ho=null,At=new Set,Lt=new Map;kt.addEventListener("click",()=>{it=!it,Sn="",Zt()});function Ei(n){let r=n.state&&n.state.screen&&n.state.screen.name,l=n.anchor&&n.anchor.quote&&n.anchor.quote.exact;return s("div",{class:"gm-older"},[s("div",{class:"gm-meta"},[s("span",{class:ne(n.author),text:_(n.author)}),r?s("span",{text:r}):null,n.status&&n.status!=="open"?s("span",{class:"gm-status",text:n.status}):null]),l?s("div",{class:"gm-older-quote",text:`"${l}"`}):null,s("p",{class:"gm-text",text:String(n.intent&&n.intent.text||"")})])}let xo="";function Ai(n){let r=n.identity.mode!=="none",l=U(n.identity.mode),i=n.unsent,p=n.identity.read==="members",b=i?`to send ${i} comment${i===1?"":"s"}`:p?"to see comments":"to comment",m="",v="",y="",C="",E=!1;if(r&&n.session)m=`Commenting as ${n.session.name||"you"}${n.session.username?` @${n.session.username}`:""} \xB7 ${U(n.session.provider)}`,C="Sign out";else if(r&&n.signin.state==="waiting")m=`Waiting for ${l}... Finish in the small window, and check it shows this code:`,v=n.signin.shortCode||"",C="Cancel",E=!0;else if(r&&n.signin.state==="blocked")m="Your browser blocked the sign-in window. Allow pop-ups for this page, then try again.",y=`Sign in with ${l}`,E=!0;else if(r&&n.signin.state==="not_member"){let ge=n.signin.who||{},Re=n.identity.mode==="github",xe=ge.members||n.identity.members||(Re?"the repository":"the group");m=`Your account ${Re?"has no access to":"is not in"} ${xe}. You are signed in to ${l} as ${ge.name||"someone"}, and only ${Re?"people who can open it":"members"} can ${p?"open this prototype":"comment here"}. Ask the author for access, or sign out of ${l} and sign in here with another account.`,y=`Sign in with ${l} again`,E=!0}else r&&n.signin.state==="failed"?(m="Sign-in did not finish.",y=`Sign in with ${l} ${b}`,E=!0):r&&(m=i?"Saved here. Not shared until you sign in.":"",y=`Sign in with ${l} ${b}`,E=i>0);let k=[r,m,v,y,C].join("|");if(k===xo)return;let T=q.activeElement===g||q.activeElement===x;xo=k,w.hidden=!r,w.classList.toggle("is-row",!!(m&&C&&!y&&!v)),$e.hidden=r,pt.textContent=m,pt.title=m,pt.hidden=!m,ut.textContent=v,ut.hidden=!v,a.hidden=!m&&!v,g.textContent=y,g.hidden=!y,x.textContent=C,x.hidden=!C,r&&n.session?vo(n.session):r&&(nt.hidden=!0,ot.hidden=!1,ot.textContent="Sign in",Fe.classList.add("is-text"),Fe.setAttribute("aria-label",`Sign in with ${l}`)),E&&!re&&(re=!0,$t()),T&&(y?g:C?x:g).focus()}function vo(n){let r=n&&n.name&&n.name.trim()||"";nt.hidden=!r,ot.hidden=!!r,ot.textContent=r?"":"Your name",Fe.classList.toggle("is-text",!r),nt.style.setProperty("--gm-author",gn(n)),nt.textContent=mn(r),Fe.setAttribute("aria-label",r?`Your name: ${r}`:"Your name")}function Zt(){if(!h)return;let n=h.view();Ai(n);let r=n.versions.find(m=>m.version_id===h.versionId)||null,l=r?n.versions.filter(m=>m.version_id!==h.versionId):[];if(Xn.hidden=!r||l.length===0&&n.isLatest,!r)return;kt.textContent=`Version ${r.round}${n.isLatest?" (current)":""}`,kt.disabled=l.length===0,l.length||(it=!1),kt.setAttribute("aria-expanded",it?"true":"false"),gt.hidden=!it;let i=n.versions.find(m=>m.version_id===n.latest)||null,p=!n.isLatest&&i?`${i.round}|${i.has_page}`:"";p!==ho&&(ho=p,Ut.textContent="",p&&(Ut.appendChild(s("span",{text:`A newer version exists (Version ${i.round}). `})),Ut.appendChild(i.has_page?s("a",{href:h.pageUrl(i.version_id),target:"_blank",rel:"noopener",text:`Open version ${i.round}`,"aria-label":`Open version ${i.round} in a new tab`}):s("span",{text:"Ask whoever sent you this page for the new one."}))));let b=JSON.stringify([it,n.versions,[...At],[...Lt.entries()].map(([m,v])=>[m,Array.isArray(v)?v.length:v])]);!it||b===Sn||(Sn=b,gt.textContent="",l.forEach(m=>{let v=`Version ${m.round} \xB7 ${m.comments} comment${m.comments===1?"":"s"}`;if(m.has_page){gt.appendChild(s("a",{class:"gm-vrow",href:h.pageUrl(m.version_id),target:"_blank",rel:"noopener",text:`${v} \xB7 open`,"aria-label":`${v}, opens in a new tab`}));return}let y=At.has(m.version_id),C=s("button",{class:"gm-vrow",type:"button","aria-expanded":y?"true":"false","data-focus":`version:${m.version_id}`,text:`${v} \xB7 ${y?"hide":"read"}`});if(C.addEventListener("click",async()=>{F=`version:${m.version_id}`,At.has(m.version_id)?At.delete(m.version_id):(At.add(m.version_id),Array.isArray(Lt.get(m.version_id))||(Lt.set(m.version_id,"loading"),Zt(),Lt.set(m.version_id,await h.loadVersion(m.version_id)||"failed"),F=`version:${m.version_id}`)),Zt()}),gt.appendChild(C),y){let E=Lt.get(m.version_id),k=s("div",{class:"gm-older-list"});E==="loading"?k.appendChild(s("div",{class:"gm-older-note",text:"Loading..."})):Array.isArray(E)?E.length?E.forEach(T=>k.appendChild(Ei(T))):k.appendChild(s("div",{class:"gm-older-note",text:"No comments on that version."})):k.appendChild(s("div",{class:"gm-older-note",text:"Could not reach the comment service."})),gt.appendChild(k)}}),Qt())}function wo(){let n=h.view();return n.problem?n.problem:n.state==="locked"?"Comments on this prototype are for members only. Sign in to see the latest.":n.state==="offline"?t.storageOk()===!1?"Working locally. Comments will be shared when the service is back; keep this tab open until then.":"Working locally. Comments will be shared when the service is back.":n.state==="connecting"||n.unsent>0?"Sharing...":n.identity.read==="members"?"Shared. Signed-in members see these comments.":"Shared. Everyone with this page sees these comments."}let Ot=n=>!!(h&&!h.isMine(n.id)&&t.isSeen&&!t.isSeen(n.id));function Li(n,r){let{comment:l,status:i}=n,p=!h||h.isMine(l.id),b=S(l),m=s("div",{class:"gm-meta"});h&&m.appendChild(s("span",{class:ne(l.author),text:p?`${_(l.author)} (you)`:_(l.author)})),l.intent.tag&&m.appendChild(s("span",{class:"gm-tag",text:l.intent.tag})),fo(n).forEach(E=>m.appendChild(E)),l.status&&l.status!=="open"&&m.appendChild(s("span",{class:"gm-status",text:l.status}));let v=si(l.time);v&&m.appendChild(s("span",{class:"gm-time",text:v}));let y=s("div",{class:"gm-card",role:"button",tabindex:"0","data-focus":`card:${l.id}`,"aria-label":`Comment ${r+1}${i==="found"?"":i==="hidden"?", on another screen":", orphaned"}${Ot(l)?", unread":""}: ${l.intent.text}`},[s("div",{class:"num",text:String(r+1)}),le(b),s("div",{class:"body"},[m,s("p",{class:"gm-text",text:l.intent.text})]),Ot(l)?s("span",{class:"dot","aria-hidden":"true"}):null]);y.classList.toggle("is-selected",V===l.id),y.classList.toggle("is-hot",Le===l.id);let C=()=>{V===l.id?Wt():hn(l.id,{scroll:!0,from:"card"})};return y.addEventListener("click",C),y.addEventListener("keydown",E=>{E.key!=="Enter"&&E.key!==" "||(E.preventDefault(),C())}),y.addEventListener("pointerenter",()=>{Le=l.id;let E=Xe.get(l.id);E&&E.classList.add("is-hot")}),y.addEventListener("pointerleave",()=>{Le===l.id&&(Le=null);let E=Xe.get(l.id);E&&E.classList.remove("is-hot")}),y}function Oi(n){return JSON.stringify([Ae,h?t.reviewer():"",n.map(r=>[r.comment.id,r.status,r.via,r.comment.intent,r.comment.author,r.comment.status,r.comment.state.screen,Ot(r.comment),h&&h.isUnshared(r.comment.id),r.comment.time])])}function Ti(n){let r=q.activeElement;!F&&r&&ze.contains(r)&&r.dataset.focus&&(F=r.dataset.focus),ze.textContent="",Xt.clear();let l=n.filter(m=>Ae==="unread"?Ot(m.comment):Ae==="mine"?!h||h.isMine(m.comment.id):!0);n.length?l.length||ze.appendChild(s("div",{class:"gm-empty",text:Ae==="unread"?"Nothing unread.":"None of these are yours."})):ze.appendChild(s("div",{class:"gm-empty",text:"No comments yet. To leave one, press C or the Comment button, then click anything on the page."}));let i=new Map;l.forEach(m=>{let v=m.comment.state.screen&&m.comment.state.screen.name||"",y=m.status!=="hidden",C=`${y?"here":"there"}:${v}`;i.has(C)||i.set(C,{screen:v,here:y,entries:[]}),i.get(C).entries.push(m)});let p=[...i.values()].sort((m,v)=>Number(v.here)-Number(m.here)),b=p.length===1&&p[0].here;p.forEach(m=>{if(!b){let v=m.screen?`${m.screen}${m.here?"":" \xB7 another screen"}`:m.here?"This screen":"Elsewhere";ze.appendChild(s("div",{class:"gm-group",text:v}))}m.entries.forEach(v=>{let y=Li(v,n.indexOf(v));Xt.set(v.comment.id,y),ze.appendChild(y)})}),Qt()}function Ni(n){let r=n.length;ke.textContent=String(r),j.textContent=String(r);let l=n.filter(p=>Ot(p.comment)).length;Te.title=`${r===1?"1 comment":`${r} comments`}${l?`, ${l} unread`:""}`,bt.hidden=!l;let i="";if(!I&&h){let p=h.view();p.problem||p.state==="offline"||p.state==="locked"?i=wo():!p.isLatest&&p.versions.some(b=>b.version_id===p.latest)&&(i="A newer version of this page exists. Open the comments to see it.")}else!I&&!h&&r&&!Bt&&t.hasUnexportedWork()&&(i=t.storageOk()===!1?"Not saved in this browser. Send to author is under the count.":"Kept in this browser. Send to author is under the count.");lt=i,Zn(),Se.forEach(p=>{let b=p.dataset.filter===Ae;p.classList.toggle("is-on",b),p.setAttribute("aria-pressed",b?"true":"false")}),(!h||h.view().identity.mode==="none")&&vo({name:t.reviewer()})}function Ri(n,r){let l=Oi(n);r||l!==Ve||!ze.childElementCount?(Ve=l,Ti(n)):Xt.forEach((p,b)=>{p.classList.toggle("is-selected",V===b),p.classList.toggle("is-hot",Le===b)}),Si(n,r),Zt(),Ni(n);let i=t.storageOk();Kn.textContent=h?wo():i===!1?"Not saved in this browser. Send or copy before you close this tab.":i===!0?"Kept in this browser until you send it.":"",q.activeElement!==Ge&&(Ge.value=t.reviewer()),q.activeElement!==M&&(M.value=t.overallNote()),t.overallNote()&&M.hidden&&(M.hidden=!1,se.textContent="A note about the whole thing")}function X(n){let r=t.comments().map(l=>{let i=l.state&&l.state.screen?l.state.screen.name:null,{element:p,status:b,via:m}=f(l.anchor,i);return{comment:l,element:p,status:b,via:m}});kn=r,Ri(r,n),yi(r),Ci(),$n(),po(),Qt()}let Cn=!1;function Tt(){Cn||(Cn=!0,requestAnimationFrame(()=>{Cn=!1,X()}))}new MutationObserver(n=>{n.every(r=>r.target===K||K.contains(r.target))||(Z(),Tt())}).observe(document.body,{childList:!0,subtree:!0,attributes:!0,characterData:!0}),window.addEventListener("beforeunload",n=>{(h?h.view().unsent===0:!t.hasUnexportedWork())||(n.preventDefault(),n.returnValue="")}),window.addEventListener("scroll",Tt,!0),window.addEventListener("resize",()=>{Z(),Tt()}),window.addEventListener("scroll",()=>{Z(),Tt()},{once:!0,capture:!0}),document.addEventListener("transitionend",Z,!0),document.addEventListener("animationend",Z,!0);try{let n=window.matchMedia("(prefers-color-scheme: dark)");n&&n.addEventListener&&n.addEventListener("change",Z)}catch{}return t.subscribe(Tt),X(),{setCommentMode:Yt,isCommentMode:()=>J,openPanel:fn,closePanel:jt,openThread:hn,render:X,isBoxOpen:()=>!ae.hidden,target:()=>ie,theme:()=>Ee,shadow:q}}var Fr=()=>new Date().toISOString().replace(/\.\d{3}Z$/,"Z");function Dr({anchor:e,element:t,text:o,tag:d}){return{id:qn(),time:Fr(),intent:{text:String(o||"").trim(),tag:d||null},anchor:e,state:{hash:location.hash||null,title:document.title||null,screen:nn(t),trail:Mn(),scroll:{x:Math.round(window.scrollX),y:Math.round(window.scrollY)},viewport:{width:window.innerWidth,height:window.innerHeight},screenshot:null},status:"open"}}function li(){zn(Ue.versionId);let e=Vn();Bn(Yn(),e.name,e.note),Po();let t=Vo({stamp:Ue,store:Dt}),o=t?{...Dt,add:t.add,update:t.update,remove:t.remove}:Dt,d=ai({store:o,sync:t,batch:Gn,createComment:Dr,anchorFromElement:Fo,anchorFromSelection:Do,resolve:rn,setRecording:Bo,targetFor:qo});window.__gitmargin={format:qt,versionId:Ue.versionId,file:Ue.file,export:zt,markdown:pn,reviewedHtml:un,originalLength:tn().length,trail:()=>Mn(),lastCopy:null,lastCopyOk:null,ui:d,sync:t},t&&t.subscribe(()=>d.render())}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",li,{once:!0}):li();})();
