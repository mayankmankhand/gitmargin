(()=>{var Fi=Object.defineProperty;var Ao=(e,t)=>{for(var o in t)Fi(e,o,{get:t[o],enumerable:!0})};function qi(e){if(!e)return"";let t=e.publicId?` PUBLIC "${e.publicId}"`:"",o=e.systemId?`${e.publicId?"":" SYSTEM"} "${e.systemId}"`:"";return`<!DOCTYPE ${e.name}${t}${o}>
`}var _t=null;function On(){return _t===null&&(_t=qi(document.doctype)+document.documentElement.outerHTML),_t}function tn(){return _t===null?On():_t}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",On,{once:!0}):On();function en(e){let t=document.querySelector(`meta[name="${e}"]`),o=t&&t.getAttribute("content");return o?o.trim():null}var Ue={versionId:en("gitmargin-version"),file:en("gitmargin-file"),service:en("gitmargin-service"),key:en("gitmargin-key")};var zi=new Set(["active","open","selected","current","on","off","show","shown","hidden","visible","disabled","expanded","collapsed","checked","error"]),Oo=e=>window.CSS&&CSS.escape?CSS.escape(e):e.replace(/[^\w-]/g,"\\$&");function Tn(e){try{return document.querySelectorAll(e).length===1}catch{return!1}}function Lo(e){if(!e||!e.id)return null;let t=`#${Oo(e.id)}`;return Tn(t)?t:null}function Bi(e){return Array.from(e.classList).find(t=>/^[a-z][a-z0-9-]*$/i.test(t)&&t.length<=24&&!zi.has(t.toLowerCase()))}function Pi(e){let t=e.localName,o=e.parentElement;if(!o)return t;let l=Array.from(o.children).filter(u=>u.localName===t);if(l.length===1)return t;let c=Bi(e);return c&&l.filter(u=>u.classList.contains(c)).length===1?`${t}.${Oo(c)}`:`${t}:nth-of-type(${l.indexOf(e)+1})`}function Mt(e){if(!e||e.nodeType!==1)return null;let t=Lo(e);if(t)return t;let o=[],l=e,c=null;for(;l&&l.nodeType===1&&l!==document.documentElement;){o.unshift(Pi(l));let f=Lo(l.parentElement);if(f){c=f;break}l=l.parentElement}let u=(c?`${c} > `:"")+o.join(" > ");if(Tn(u))return u;for(let f=o.length-1;f>=0;f-=1){let $=o.slice(f).join(" > ");if(Tn($))return $}return u||null}var st="gitmargin-root",Xe=`#${st}`;function ce(e){return String(e??"").replace(/\s+/g," ").trim()}function Ui(e,t){return e.localName==="br"||!(t==="contents"||t===""||t.startsWith("inline"))}function To(e,t){for(let o of e.childNodes){if(o.nodeType===3){t.push(o.data);continue}if(o.nodeType!==1)continue;let l=Ui(o,getComputedStyle(o).display);l&&t.push(" "),To(o,t),l&&t.push(" ")}}function Qe(e){if(!e||e.nodeType!==1)return"";let t=[];return To(e,t),ce(t.join(""))}function Ze(e){if(!e||e.nodeType!==1)return"";let t=Qe(e);return t||ce(e.getAttribute("aria-label")||e.getAttribute("title")||"")}function No(e,t=40){let o=ce(e);return o.length>t?`${o.slice(0,t-1)}\u2026`:o}var Nn="h1, h2, h3, h4, h5, h6",ji=new Set(["h1","h2","h3","h4","h5","h6","hgroup","p","span","small","strong","b","em","i","br","img","svg"]),It=e=>!!e&&e.nodeType===1&&e.getClientRects().length>0;function Ro(e){let t=e.querySelector(Nn);return t?Qe(t):""}function Hi(e){let t=e&&e.closest?e.closest(Nn):null;if(It(t))return{heading:t,own:!0};let o=Array.from(document.querySelectorAll(Nn)).filter(It),l=null;for(let c of o){let u=c.compareDocumentPosition(e),f=u&Node.DOCUMENT_POSITION_FOLLOWING,$=u&Node.DOCUMENT_POSITION_CONTAINED_BY;(f||$)&&(l=c)}return l?{heading:l,own:!1}:null}function Wi(e){let t=l=>l.children.length<=3&&Array.from(l.children).every(c=>ji.has(c.localName)),o=e.parentElement;for(;o&&t(o)&&o.parentElement&&o.parentElement!==document.body;)o=o.parentElement;return o&&o!==document.body&&o!==document.documentElement?o:null}function _o(e){let t=e&&e.closest?e.closest("[data-gm-screen]"):null;if(t)return{name:ce(t.getAttribute("data-gm-screen")),source:"data-gm-screen",box:t};let o=Array.from(document.querySelectorAll('dialog[open], [role="dialog"]')).filter(It),l=o.find(q=>e&&q.contains(e)),c=l||o.find(q=>q.matches("dialog[open]"));if(c)return{name:Ro(c)||ce(c.getAttribute("aria-label"))||"Dialog",source:"dialog",box:l||null};let u=document.querySelector('[aria-current="step"]');if(It(u))return{name:Ro(u)||Ze(u).slice(0,60),source:"aria-current",box:null};let f=document.querySelector('[role="tab"][aria-selected="true"]');if(It(f))return{name:Ze(f),source:"tab",box:null};let $=e?Hi(e):null,_=$?Qe($.heading):"";if(_)return{name:_,source:"heading",box:$.own?null:Wi($.heading)};let h=ce(location.hash);return h?{name:h,source:"hash",box:null}:{name:null,source:"none",box:null}}function nn(e){let{name:t,source:o}=_o(e);return{name:t,source:o}}function Mo(e){return _o(e)}var Io=32,Do=160,Yi=e=>e?e.nodeType===1?e:e.parentElement:null,on=e=>!!e&&e.nodeType===1&&e.getClientRects().length>0,je=e=>String(e??"").replace(/\s+/g,""),Rn=e=>typeof e=="string"?e.replace(/\s+/g," ").trim():"";function Fo(e,t){let o=Rn(e),l=Rn(t);return!o||!l||o===l}function qo(e,t){let o=je(t);return!o||je(e.textContent).includes(o)}var Gi=new Set(["data-gm-screen","heading"]);function Vi(e){return typeof e=="string"?{name:e,source:null}:!e||typeof e!="object"||typeof e.name!="string"?{name:null,source:null}:{name:e.name,source:typeof e.source=="string"?e.source:null}}function Ji(e,t,o){if(!Rn(t.name))return!0;let l=Mo(e);return Fo(t.name,l.name)?!0:Gi.has(t.source)&&l.box&&l.box.contains(e)?!1:qo(e,o)}function Ki(e,t,o){let l=je(t&&t.prefix),c=je(t&&t.suffix),u=e.parentElement;if(!u||!l&&!c)return 0;let f=je(e.textContent).indexOf(o);if(f<0)return 0;let $=f;for(let q=e.previousSibling;q;q=q.previousSibling)(q.nodeType===1||q.nodeType===3)&&($+=je(q.textContent).length);let _=je(u.textContent),h=0;return l&&_.slice(0,$).endsWith(l)&&(h+=1),c&&_.slice($+o.length).startsWith(c)&&(h+=1),h}function zo(e,t){if(!t)return{prefix:"",exact:"",suffix:""};let o=Qe(e),l=o.indexOf(t);return l<0?{prefix:"",exact:t,suffix:""}:{prefix:o.slice(Math.max(0,l-Io),l),exact:t,suffix:o.slice(l+t.length,l+t.length+Io)}}function Xi(e,t){let o=e.getBoundingClientRect();if(!t||!o.width||!o.height)return{x:.5,y:.5};let l=c=>Math.min(1,Math.max(0,Math.round(c*1e3)/1e3));return{x:l((t.clientX-o.left)/o.width),y:l((t.clientY-o.top)/o.height)}}function Bo(e,t){let o=ce(Ze(e)).slice(0,Do);return{selector:Mt(e),tag:e.localName,quote:zo(e.parentElement||document.body,o),point:Xi(e,t)}}function Po(e){let t=ce(e.toString()).slice(0,Do),o=e.getRangeAt(0),l=Yi(o.commonAncestorContainer);return{selector:Mt(l),tag:l?l.localName:null,quote:zo(l,t),point:{x:.5,y:.5}}}function Qi(e){let t=e&&e.exact;if(!t)return[];let o=je(t);if(!o)return[];let l=f=>je(f.textContent),c=Array.from(document.querySelectorAll("body *")).filter(f=>!f.closest(Xe)&&l(f).includes(o)),u=f=>l(f)===o;return c.filter(f=>!c.some($=>$!==f&&f.contains($))).map(f=>({element:f,exact:u(f),context:Ki(f,e,o),size:f.querySelectorAll("*").length})).sort((f,$)=>Number($.exact)-Number(f.exact)||$.context-f.context||f.size-$.size).map(({element:f,exact:$})=>({element:f,exact:$}))}function Zi(e){if(!e)return null;let t=e.split(">").map(o=>o.trim()).filter(Boolean);for(let o=t.length-1;o>0;o-=1)try{let l=document.querySelector(t.slice(0,o).join(" > "));if(l&&!l.closest(Xe))return l}catch{}return null}function rn(e,t=null){if(!e)return{element:null,status:"orphaned",via:null};let o=Vi(t),l=e.quote&&e.quote.exact,c=[];if(e.selector)try{for(let M of document.querySelectorAll(e.selector))M&&!M.closest(Xe)&&c.push(M)}catch{}let u=0,f=[];for(let M of c)if(!on(M))f.push(M);else{if(Ji(M,o,l))return{element:M,status:"found",via:"selector"};u+=1}let $=f.find(M=>qo(M,l));if($)return{element:$,status:"hidden",via:"selector"};let _=Qi(e.quote).filter(M=>!on(M.element)||Fo(o.name,nn(M.element).name)?!0:(u+=1,!1)),q=_.length>1?"quote-loose":"quote",re=_.find(M=>on(M.element));if(re)return{element:re.element,status:"found",via:q};if(u)return{element:null,status:"hidden",via:"screen"};if(f.length)return{element:f[0],status:"hidden",via:"selector"};if(_.length)return{element:_[0].element,status:"hidden",via:q};let L=Zi(e.selector);return L?{element:L,status:on(L)?"found":"hidden",via:"ancestor"}:{element:null,status:"orphaned",via:null}}var er=["button","a[href]","input","select","textarea","label","summary",'[role="button"]','[role="tab"]','[role="link"]','[role="menuitem"]','[role="option"]','[role="checkbox"]','[role="radio"]','[role="switch"]','[tabindex]:not([tabindex^="-"])'].join(","),tr=["h1","h2","h3","h4","h5","h6","p","li","dt","dd","td","th","blockquote","figcaption","legend","img","svg","video","figure","picture"].join(","),_n=e=>!!e&&(e.localName==="body"||e.localName==="html");function Mn(e){if(!e||!e.closest)return null;let t=e.closest(er);return t&&!_n(t)?t:null}function Uo(e){if(!e||e.nodeType!==1||!e.closest||_n(e)||e.closest(Xe))return null;let t=Mn(e);if(t)return t;let o=e.closest(tr);return o&&!_n(o)?o:e}var nr=20,or=40,sn=[],jo=!0,vt=null;function Ho(e){jo=!!e}function ir(e){let t=Mn(e);if(t)return t;if(e.localName==="body"||e.localName==="html")return null;let o=ce(Ze(e));return o&&o.length<=or?e:null}function rr(e){let t=Ze(e);if(t)return t;if(e.labels&&e.labels.length){let o=ce(Array.from(e.labels,l=>Qe(l)).join(" "));if(o)return o}return ce(e.getAttribute("placeholder")||e.getAttribute("name")||"")}function sr(e){if(!jo)return;let t=e.target;if(!t||t.nodeType!==1||t.closest(Xe))return;let o=ir(t);o&&o!==vt&&(vt&&vt.localName==="label"&&(vt.contains(o)||vt.control===o)||(vt=o,sn.push({at:Date.now(),selector:Mt(o),text:No(rr(o))}),sn.length>nr&&sn.shift()))}function Wo(){document.addEventListener("click",sr,!0)}function In(e=Date.now()){return sn.map(t=>({seconds_before:Math.max(0,Math.round((e-t.at)/1e3)),selector:t.selector,text:t.text}))}var Ft={};Ao(Ft,{add:()=>vr,applyRemote:()=>yr,comments:()=>Un,hasExported:()=>dr,hasUnexportedWork:()=>ur,isSeen:()=>fr,load:()=>Bn,markExported:()=>cr,markSeen:()=>hr,newId:()=>zn,overallNote:()=>jn,remove:()=>wr,reviewer:()=>dn,seed:()=>Pn,setOverallNote:()=>xr,setReviewer:()=>gr,storageOk:()=>lr,subscribe:()=>mr,update:()=>br});var Yo="gitmargin:";function ar(){let e=String(location.pathname||""),t=0;for(let o=0;o<e.length;o+=1)t=Math.imul(t,31)+e.charCodeAt(o)|0;return(t>>>0).toString(36)}function zn(){let e=new Uint8Array(3);return crypto.getRandomValues(e),`c_${Array.from(e,t=>t.toString(16).padStart(2,"0")).join("")}`}var z={comments:[],reviewer:"",overallNote:"",path:"",seen:[]},Dn=null,lr=()=>Dn,Fn=`${Yo}unversioned`,an=!1,dr=()=>an,cr=()=>{an=!0},ur=()=>(z.comments.length>0||z.overallNote.trim().length>0)&&!an,qn=new Set;function pr(){try{z.path=location.pathname||"",localStorage.setItem(Fn,JSON.stringify(z)),Dn=!0}catch{Dn=!1}}function Dt(){pr(),qn.forEach(e=>e())}function ln(){an=!1,Dt()}function Bn(e){Fn=`${Yo}${e||"unversioned"}:${ar()}`;try{let t=JSON.parse(localStorage.getItem(Fn)||"null"),o=!t||!t.path||t.path===(location.pathname||"");t&&o&&Array.isArray(t.comments)&&(z.comments=t.comments,z.reviewer=typeof t.reviewer=="string"?t.reviewer:"",z.overallNote=typeof t.overallNote=="string"?t.overallNote:"",z.seen=Array.isArray(t.seen)?t.seen.filter(l=>typeof l=="string"):[])}catch{}}function Pn(e,t,o){let l=new Set(z.comments.map(u=>u.id)),c=(e||[]).filter(u=>u&&u.id&&!l.has(u.id));c.length&&(z.comments=c.concat(z.comments)),!z.reviewer&&t&&(z.reviewer=t),!z.overallNote&&o&&(z.overallNote=o),(c.length||t||o)&&Dt()}function mr(e){return qn.add(e),()=>qn.delete(e)}var Un=()=>z.comments,dn=()=>z.reviewer,jn=()=>z.overallNote;function gr(e){z.reviewer=String(e||""),Dt()}var fr=e=>z.seen.includes(e);function hr(e){!e||z.seen.includes(e)||(z.seen.push(e),Dt())}function xr(e){z.overallNote=String(e||""),ln()}function vr(e){return z.comments.push(e),ln(),e}function br(e,t){let o=z.comments.find(l=>l.id===e);return o?(Object.assign(o,t),ln(),o):null}function wr(e){let t=z.comments.findIndex(o=>o.id===e);return t<0?!1:(z.comments.splice(t,1),ln(),!0)}function yr({upsert:e=[],drop:t=[]}){if(!e.length&&!t.length)return;let o=new Set(t),l=new Map(z.comments.filter(c=>!o.has(c.id)).map(c=>[c.id,c]));e.forEach(c=>l.set(c.id,c)),z.comments=[...l.values()].sort((c,u)=>String(c.time||"").localeCompare(String(u.time||""))||String(c.id).localeCompare(String(u.id))),Dt()}var cn=null,Hn=null;function kr(){cn=[],Hn=[];for(let e=2,t=0;t<64;e+=1){let o=!0;for(let l=2;l*l<=e;l+=1)if(e%l===0){o=!1;break}o&&(t<8&&(Hn[t]=Math.pow(e,1/2)*4294967296|0),cn[t]=Math.pow(e,1/3)*4294967296|0,t+=1)}}var Me=(e,t)=>e>>>t|e<<32-t;function Go(e){cn||kr();let t=[];for(let u=0;u<e.length;u+=1)t.push(e.charCodeAt(u)&255);let o=t.length*8;for(t.push(128);t.length%64!==56;)t.push(0);t.push(0,0,0,0,o>>>24&255,o>>>16&255,o>>>8&255,o&255);let l=Hn.slice(0),c=[];for(let u=0;u<t.length;u+=64){for(let C=0;C<16;C+=1)c[C]=t[u+4*C]<<24|t[u+4*C+1]<<16|t[u+4*C+2]<<8|t[u+4*C+3];for(let C=16;C<64;C+=1){let le=Me(c[C-15],7)^Me(c[C-15],18)^c[C-15]>>>3,K=Me(c[C-2],17)^Me(c[C-2],19)^c[C-2]>>>10;c[C]=c[C-16]+le+c[C-7]+K|0}let[f,$,_,h,q,re,L,M]=l;for(let C=0;C<64;C+=1){let le=M+(Me(q,6)^Me(q,11)^Me(q,25))+(q&re^~q&L)+cn[C]+c[C]|0,K=(Me(f,2)^Me(f,13)^Me(f,22))+(f&$^f&_^$&_)|0;M=L,L=re,re=q,q=h+le|0,h=_,_=$,$=f,f=le+K|0}[f,$,_,h,q,re,L,M].forEach((C,le)=>{l[le]=l[le]+C|0})}return l.map(u=>`00000000${(u>>>0).toString(16)}`.slice(-8)).join("")}var Vo=5e3,Jo=3e4,Sr=5*6e4,$r=6e4,Cr=5e3,bt={full:"This prototype has reached its comment limit. Your comment is saved here but not shared.",replies_full:"This comment has reached its reply limit. Your reply is saved here but not shared.",slow_down:"Too many comments are arriving at once. Yours will be shared in a minute.",too_long:"A comment is too long to share. It is saved here; shorten it to share it.",invalid:"A comment could not be shared. It is saved here.",unknown_version:"The comment service does not know this version of the page. Comments are saved here only.",not_found:"The comment service does not know this prototype. Comments are saved here only."},Wn=e=>{let t=new Uint8Array(e);return crypto.getRandomValues(t),Array.from(t,o=>o.toString(16).padStart(2,"0")).join("")},Er=()=>`r_${Wn(3)}`,Ar=e=>new Date(e).toISOString().replace(/\.\d{3}Z$/,"Z");function Ko(e){let t=new Map;return{read(o){try{let l=e().getItem(o);return l?JSON.parse(l):t.get(o)??null}catch{return t.get(o)??null}},write(o,l){t.set(o,l);try{e().setItem(o,JSON.stringify(l))}catch{}}}}function Lr(){try{let e=/(?:^#|&)gm_claim=([0-9a-f]{32})(?:&|$)/.exec(window.location.hash);if(!e)return null;let t=window.location.hash.replace(/(^#|&)gm_claim=[0-9a-f]{32}/,"$1").replace(/^#&?$/,"");try{window.history.replaceState(null,"",window.location.pathname+window.location.search+t)}catch{}return e[1]}catch{return null}}function Or(e,t){let o=new URL(e.service).origin;try{if(!t||!/^https?:$/.test(t.protocol)||!t.origin||t.origin==="null")return o;let l=/^\/p\/([^/]+)\/(latest|v\d{1,4}-[0-9a-f]{6})$/.exec(t.pathname);if(l&&decodeURIComponent(l[1])===e.key)return t.origin}catch{}return o}function Xo({stamp:e,store:t,fetchImpl:o=(...L)=>fetch(...L),now:l=()=>Date.now(),timers:c={set:(L,M)=>setTimeout(L,M),clear:L=>clearTimeout(L)},isHidden:u=()=>typeof document<"u"&&document.visibilityState==="hidden",onVisible:f=L=>typeof document<"u"&&document.addEventListener("visibilitychange",L),storage:$=null,openWindow:_=L=>window.open(L,"gitmargin-signin","popup,width=520,height=680"),takeArrivalCode:h=Lr,sharedStorage:q=()=>typeof location<"u"&&location.protocol==="file:",pageLocation:re=()=>typeof location>"u"?null:{protocol:location.protocol,pathname:location.pathname,origin:typeof self<"u"&&typeof self.origin=="string"?self.origin:"null"}}){if(!e||!e.service||!e.key||!e.versionId)return null;let L,M;try{let a=new URL(e.service);if(!/^https?:$/.test(a.protocol))return null;M=Or(e,re()),L=`${M}/api/p/${encodeURIComponent(e.key)}/comments`}catch{return null}let C=Ko(()=>$||localStorage),le=`gitmargin:token:${e.key}`,K=`gitmargin:sync:${e.key}:${e.versionId}`,B=C.read(le);(typeof B!="string"||B.length<16)&&(B=Wn(16),C.write(le,B));let Ee=`gitmargin:pass:${e.key}`,Z={mode:"none",read:"open",members:null},et=q()?Ko(()=>{throw new Error("tab only")}):C,R=et.read(Ee);(!R||typeof R.pass!="string"||!(Date.parse(R.expires)>l()))&&(R=null);let P={state:"idle",code:null,shortCode:null,who:null,timer:null,started:0},J=()=>Z.mode!=="none"&&!R;function G(a){let x={mode:a&&typeof a.identity=="string"?a.identity:"none",read:a&&a.read==="members"?"members":"open",members:a&&typeof a.members=="string"?a.members:null};x.mode===Z.mode&&x.read===Z.read&&x.members===Z.members||(Object.assign(Z,x),we())}function be(){R&&(R=null,et.write(Ee,null),we())}let W=C.read(K)||{},O=Array.isArray(W.ops)?W.ops:[],ne=new Set(Array.isArray(W.synced)?W.synced:[]),ee=new Set(Array.isArray(W.mine)?W.mine:[]),F=W.rejected&&typeof W.rejected=="object"?W.rejected:{},Q=()=>C.write(K,{ops:O,synced:[...ne],mine:[...ee],rejected:F}),Ie=new Set,oe={state:"connecting",problem:null,versions:[],latest:null},we=()=>Ie.forEach(a=>a());function ye(a){let m=JSON.stringify(oe);Object.assign(oe,a),JSON.stringify(oe)!==m&&we()}let We=null,D=null,Ae=!1,ie=!1,ue=0,Le=l(),de=a=>t.comments().find(m=>m.id===a)||null;function Oe(a){for(let m of t.comments()){if(m.id===a)return m.author||null;let x=(m.replies||[]).find(b=>b.id===a);if(x)return x.author||null}return null}let pe=()=>R?{name:R.identity.name,provider:R.identity.provider,username:R.identity.username,verified:!0}:{name:t.reviewer()||""},Bt=1e3,Pt=600*1e3,lt=20*1e3;function Ye(a,m=null){P.timer!==null&&c.clear(P.timer),Object.assign(P,{timer:null,code:null,state:a,who:m,shortCode:a==="waiting"?P.shortCode:null}),we()}function dt(){let a=P.code;P.timer=c.set(async()=>{if(P.timer=null,P.code!==a)return;if(l()-P.started>Pt)return Ye("failed");let m=null,x=0;try{let b=await o(`${L.replace(/\/comments$/,"")}/auth/claim`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:a})});x=b.status,m=await b.json()}catch{}if(P.code===a){if(x===200&&m&&m.member===!0&&typeof m.pass=="string"){R={pass:m.pass,expires:m.expires,identity:m.identity||{}},et.write(Ee,R),Ye("idle"),Se();return}return x===200&&m&&m.member===!1?Ye("not_member",{...m.identity||{},members:m.members||null}):x===404&&l()-P.started<lt?dt():x===404||x===400?Ye("failed"):dt()}},Bt)}let ct=a=>O.filter(m=>m.id===a),tt=(a,m)=>O.some(x=>x.id===a&&x.op===m);function me(a){O.push(a),Le=l(),Q(),Se()}async function ke(a,m,x){let b=R?R.pass:null,S=await o(m,{method:a,headers:{"content-type":"application/json",...a==="GET"?{}:{"x-gitmargin-token":B},...b?{"x-gitmargin-pass":b}:{}},body:x===void 0?void 0:JSON.stringify(x)}),j=null;try{j=await S.json()}catch{}if(!S.ok&&!(j&&typeof j.error=="string"))throw new Error("unreadable answer");return{ok:S.ok,status:S.status,answer:j,carried:b}}function wt(a){R&&R.pass===a.carried&&be()}function Te(a){return{version_id:e.versionId,author:{name:a.author&&a.author.name||t.reviewer()||""},comment:{id:a.id,time:a.time,intent:a.intent,anchor:a.anchor,state:a.state}}}async function nt(a){let m=de(a.id),x=`${L}/${a.id}`,b;if(a.op==="add"){if(!m)return"drop";b=await ke("POST",L,Te(m))}else if(a.op==="edit"){if(!m)return"drop";b=await ke("PATCH",x,{intent:m.intent})}else if(a.op==="delete")b=await ke("DELETE",x);else if(a.op==="reply-add")b=await ke("POST",`${x}/replies`,a.reply);else if(a.op==="reply-edit"){let T=m&&(m.replies||[]).find(Y=>Y.id===a.rid);if(!T)return"drop";b=await ke("PATCH",`${x}/replies/${a.rid}`,{text:T.text})}else if(a.op==="reply-delete")b=await ke("DELETE",`${x}/replies/${a.rid}`);else return"drop";if(b.ok)return ne.add(a.id),"done";let S=b.answer.error;if(S==="sign_in")return G({identity:b.answer.provider,read:Z.read,members:Z.members}),wt(b),"later";if(S==="id_taken"&&(a.op==="add"||a.op==="reply-add"))return ne.add(a.id),ee.delete(a.op==="add"?a.id:a.rid),"drop";if(S==="slow_down"||S==="service_unavailable")return ye({problem:bt[S]||null}),"later";if(S==="not_found"&&a.op!=="add"&&a.op!=="reply-add")return"drop";a.op!=="delete"&&a.op!=="reply-delete"&&(F[a.rid||a.id]=S);let j=a.op==="reply-add"||a.op==="reply-edit";return ye({problem:(j&&S==="full"?bt.replies_full:bt[S])||bt.invalid}),"drop"}async function ot(){if(J())return O.length===0;for(;O.length;){let a=O[0];if(a.tried=!0,await nt(a)==="later")return!1;let x=O.indexOf(a);x>=0&&O.splice(x,1),Q()}return!0}function De(a,m){let x=[],b=[],S=new Set;for(let T of a.comments||[]){if(!T||typeof T.id!="string")continue;if(S.add(T.id),T.deleted){b.push(T.id),ne.delete(T.id);for(let I=O.length-1;I>=0;I-=1)O[I].id===T.id&&O.splice(I,1);continue}ne.add(T.id);let Y=de(T.id),qe={...T};Y&&(tt(T.id,"edit")||F[T.id])&&(qe.intent=Y.intent);let $e=Array.isArray(T.replies)?[...T.replies]:[];for(let I of ct(T.id)){if(I.op==="reply-add"&&!$e.some(se=>se.id===I.rid)&&$e.push({...I.reply,time:I.time,updated:I.time}),I.op==="reply-delete"){let se=$e.findIndex(Be=>Be.id===I.rid);se>=0&&$e.splice(se,1)}if(I.op==="reply-edit"&&Y){let se=(Y.replies||[]).find(mt=>mt.id===I.rid),Be=$e.find(mt=>mt.id===I.rid);se&&Be&&(Be.text=se.text)}}for(let I of Y&&Y.replies||[]){if(!F[I.id])continue;let se=$e.find(Be=>Be.id===I.id);se?se.text=I.text:$e.push(I)}qe.replies=$e,!(Y&&JSON.stringify(Y)===JSON.stringify(qe))&&!tt(T.id,"delete")&&x.push(qe)}if(m){for(let T of t.comments())ne.has(T.id)&&!S.has(T.id)&&(b.push(T.id),ne.delete(T.id));for(let T of t.comments())S.has(T.id)||ne.has(T.id)||F[T.id]||tt(T.id,"add")||(ee.add(T.id),O.push({op:"add",id:T.id}),ie=!0)}(x.length||b.length)&&(Le=l()),t.applyRemote({upsert:x,drop:b});let j=Date.parse(a.server_time);Number.isNaN(j)||(We=new Date(j-Cr).toISOString()),Q(),G(a.prototype),ye({versions:Array.isArray(a.versions)?a.versions:[],latest:a.latest||null})}async function yt(){if(Ae){ie=!0;return}Ae=!0;try{let a=await ot(),m=We===null,x=`${L}?version=${encodeURIComponent(e.versionId)}${m?"":`&since=${encodeURIComponent(We)}`}`,b=await ke("GET",x);!b.ok&&b.answer.error==="sign_in"?(G({identity:b.answer.provider,read:"members",members:Z.members}),wt(b),We=null,ue=0,R||ye({state:"locked",problem:null})):b.ok?(De(b.answer,m),ue=0,ye({state:"shared",problem:a?Object.keys(F).length?oe.problem:null:oe.problem})):(ue+=1,ye({state:"offline",problem:bt[b.answer.error]||bt.not_found}))}catch{ue+=1,ye({state:"offline"})}finally{Ae=!1,Ge(),ie&&(ie=!1,Se())}}function Fe(){return ue>0?Math.min(Vo*2**ue,$r):oe.state==="locked"||l()-Le>=Sr?Jo:Vo}function Ge(){D!==null&&c.clear(D),D=null,!u()&&(D=c.set(()=>{D=null,yt()},Fe()))}function Se(){D!==null&&c.clear(D),D=null,yt()}f(()=>{u()?(D!==null&&c.clear(D),D=null):Se()});async function ut(a){try{let m=await o(`${L.replace(/\/comments$/,"")}/auth/claim`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:a})}),x=await m.json();m.status===200&&x&&x.member===!0&&typeof x.pass=="string"&&(R={pass:x.pass,expires:x.expires,identity:x.identity||{}},et.write(Ee,R))}catch{}}Q();let pt=h();return pt?ut(pt).then(Se):Se(),{subscribe(a){return Ie.add(a),()=>Ie.delete(a)},view:()=>({...oe,unsent:O.length,isLatest:!oe.latest||oe.latest===e.versionId,identity:{...Z},session:R?{...R.identity}:null,signin:{state:P.state,shortCode:P.shortCode,who:P.who}}),isMine(a){let m=Oe(a);return m&&m.verified===!0?ee.has(a)||!!(R&&R.identity.provider===m.provider&&R.identity.username===m.username):ee.has(a)},signIn(){if(Z.mode==="none"||P.state==="waiting")return;let a=Wn(16),m=Go(a),x=_(`${M}/auth/start?key=${encodeURIComponent(e.key)}&code_hash=${m}`),b=String(parseInt(m.slice(0,8),16)%1e4).padStart(4,"0");Object.assign(P,{code:a,shortCode:`${b.slice(0,2)}-${b.slice(2)}`,who:null,started:l()}),P.state=x?"waiting":"blocked",we(),x&&dt()},cancelSignIn(){Ye("idle")},async signOut(){if(!R)return;let a=R.pass;be();try{await o(`${L.replace(/\/comments$/,"")}/auth/session`,{method:"DELETE",headers:{"x-gitmargin-pass":a}})}catch{}},isUnshared:a=>!!F[a]||O.some(m=>m.op==="add"&&m.id===a||m.op==="reply-add"&&m.rid===a),versionId:e.versionId,async loadVersion(a){try{let m=await ke("GET",`${L}?version=${encodeURIComponent(a)}`);return m.ok?(m.answer.comments||[]).filter(x=>x&&!x.deleted):null}catch{return null}},pageUrl:a=>`${M}/p/${encodeURIComponent(e.key)}/${encodeURIComponent(a)}`,add(a){let m=t.add({...a,author:pe(),replies:[],version_id:e.versionId});return ee.add(m.id),me({op:"add",id:m.id}),m},update(a,m){let x=t.update(a,m);if(!x)return x;let b=O.find(S=>S.op==="add"&&S.id===a);return delete F[a],!b&&!ne.has(a)?me({op:"add",id:a}):!b||b.tried?me({op:"edit",id:a}):Q(),x},remove(a){if(!t.remove(a))return!1;let x=O.find(S=>S.op==="add"&&S.id===a),b=!!x&&!x.tried;for(let S=O.length-1;S>=0;S-=1)O[S].id===a&&O.splice(S,1);return delete F[a],b?Q():me({op:"delete",id:a}),!0},addReply(a,m){let x=de(a);if(!x)return null;let b=Ar(l()),S={id:Er(),text:String(m),author:pe()};return t.applyRemote({upsert:[{...x,replies:[...x.replies||[],{...S,time:b,updated:b}]}]}),ee.add(S.id),me({op:"reply-add",id:a,rid:S.id,reply:S,time:b}),S},editReply(a,m,x){let b=de(a);if(!b)return!1;let S=(b.replies||[]).map(Y=>Y.id===m?{...Y,text:String(x)}:Y);t.applyRemote({upsert:[{...b,replies:S}]});let j=O.find(Y=>Y.op==="reply-add"&&Y.rid===m),T=!!F[m];if(delete F[m],j&&(j.reply={...j.reply,text:String(x)}),j&&!j.tried)Q(),Se();else if(!j&&T){let Y=S.find(qe=>qe.id===m);me({op:"reply-add",id:a,rid:m,reply:{id:m,text:String(x),author:Y.author},time:Y.time})}else me({op:"reply-edit",id:a,rid:m});return!0},removeReply(a,m){let x=de(a);if(!x)return!1;t.applyRemote({upsert:[{...x,replies:(x.replies||[]).filter(j=>j.id!==m)}]});let b=O.findIndex(j=>j.op==="reply-add"&&j.rid===m),S=!!F[m];return delete F[m],b>=0&&!O[b].tried?(O.splice(b,1),Q()):S&&b<0?Q():(b>=0&&O.splice(b,1),me({op:"reply-delete",id:a,rid:m})),!0},debug:()=>({delay:Fe(),ops:O.map(a=>({...a})),since:We,token:B}),stop(){D!==null&&c.clear(D),D=null}}}var Jn={};Ao(Jn,{FORMAT_VERSION:()=>qt,copy:()=>_r,download:()=>Rr,embeddedComments:()=>Gn,embeddedJson:()=>ti,embeddedReviewer:()=>Vn,envelope:()=>zt,markdown:()=>un,nounFor:()=>ei,reviewedFileName:()=>Yn,reviewedHtml:()=>pn});var qt="0.1",Tr=(e=new Date)=>e.toISOString().replace(/\.\d{3}Z$/,"Z"),Qo=e=>String(e??"").replace(/\r?\n/g," ").trim(),Nr={button:"button",a:"link",input:"field",select:"field",textarea:"field",img:"image",label:"label"};function ei(e){let o=(String(e||"").split(">").pop().trim().match(/^[a-z][a-z0-9]*/i)||[""])[0].toLowerCase();return/^h[1-6]$/.test(o)?"heading":Nr[o]||"element"}function Gn(){let e=document.getElementById("gitmargin-comments");if(!e)return[];try{let t=JSON.parse(e.textContent||"null");return t&&Array.isArray(t.comments)?t.comments:[]}catch{return[]}}function Vn(){let e=document.getElementById("gitmargin-comments");if(!e)return{name:"",note:""};try{let t=JSON.parse(e.textContent||"null")||{};return{name:t.reviewer&&t.reviewer.name||"",note:t.overall_note||""}}catch{return{name:"",note:""}}}function Zo(e,t){let o=e&&typeof e.name=="string"&&e.name?e.name:t;return e&&e.verified===!0&&typeof e.provider=="string"&&e.provider?{name:o,provider:e.provider,username:typeof e.username=="string"?e.username:"",verified:!0}:{name:o}}function zt(){return{gitmargin:qt,file:Ue.file,version_id:Ue.versionId,exported_at:Tr(),reviewer:{name:dn()||null},viewport:{width:window.innerWidth,height:window.innerHeight},overall_note:jn()||null,comments:Un().map(e=>({id:e.id,time:e.time,intent:{text:e.intent.text,tag:e.intent.tag||null},anchor:e.anchor,state:e.state,status:e.status||"open",replies:(e.replies||[]).map(t=>({id:t.id||null,time:t.time||null,author:Zo(t.author,null),text:String(t.text||"")})),...e.author&&typeof e.author.name=="string"?{author:Zo(e.author,null)}:{}}))}}function ti(){return JSON.stringify(zt(),null,2).replace(/</g,"\\u003c")}function un(){let e=zt(),t=`${e.exported_at.slice(0,10)} ${e.exported_at.slice(11,16)} UTC`,o=[`gitmargin batch v${qt} | ${e.file||"unknown file"} | ${e.version_id||"no version id"}`,`Reviewer: ${e.reviewer.name||"not given"}. Viewport ${e.viewport.width}x${e.viewport.height}. Exported ${t}.`],l=e.comments.map((u,f)=>{let $=u.intent.tag?`[${u.intent.tag}] `:"",_=[],h=u.state.screen&&u.state.screen.name,q=h?`On "${h}"${u.state.hash?` (${u.state.hash})`:""}`:"On this page";_.push(q);let re=(u.state.trail||[]).map(Ee=>Ee.text).filter(Boolean);re.length&&_.push(`after clicking ${re.join(", ")}`);let L=u.anchor.quote&&u.anchor.quote.exact,M=ei(u.anchor.tag||u.anchor.selector),C=L?`the "${L}" ${M}`:`the ${M}`,le=u.anchor.selector?` (${u.anchor.selector})`:"",K=rn(u.anchor,u.state.screen),B=K.status==="orphaned"?" [orphaned: spot not found]":K.via==="ancestor"||K.via==="quote-loose"?" [nearby: the exact element was not found, this is the closest match]":"";return`${f+1}. ${$}${_.join(", ")}: ${C}${le}${B}.
   "${Qo(u.intent.text)}"`}),c=e.overall_note?[`Overall: ${Qo(e.overall_note)}`]:[];return[o.join(`
`),l.join(`

`),c.join("")].filter(Boolean).join(`

`)}function pn(){let e=tn().replace(/[ \t]*<script\b[^>]*\bid=["']gitmargin-comments["'][^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi,(c,u)=>{try{let f=JSON.parse(u);return f&&Array.isArray(f.comments)?"":c}catch{return c}}),t=`<script type="application/json" id="gitmargin-comments">
${ti()}
<\/script>
`,o=-1,l=/<\/body\s*>/gi;for(let c=l.exec(e);c;c=l.exec(e))o=c.index;return o<0?e+t:e.slice(0,o)+t+e.slice(o)}function Yn(){let e=(Ue.file||"").replace(/\.x?html?$/i,""),t=String(dn()||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,24).replace(/-+$/,"");return`${e||"prototype"}.reviewed${t?`.${t}`:""}.html`}function Rr(){let e=new Blob([pn()],{type:"text/html;charset=utf-8"}),t=URL.createObjectURL(e),o=document.createElement("a");return o.href=t,o.download=Yn(),o.style.display="none",document.body.appendChild(o),o.click(),o.remove(),setTimeout(()=>URL.revokeObjectURL(t),1e4),Yn()}async function _r(){let e=un();try{return await navigator.clipboard.writeText(e),{ok:!0,text:e}}catch{try{let t=document.createElement("textarea");t.value=e,t.setAttribute("readonly",""),t.style.cssText="position:fixed;top:-1000px;opacity:0",document.body.appendChild(t),t.select();let o=document.execCommand("copy");return t.remove(),{ok:o,text:e}}catch{return{ok:!1,text:e}}}}var ni=`/* Marker on a light prototype, Graphite on a dark one (issue #21).

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
`;function ri(e){if(typeof e!="string")return null;let t=e.trim(),o=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(t);if(o)return(o[4]===void 0?1:Number(o[4]))>0?[Number(o[1]),Number(o[2]),Number(o[3])]:null;let l=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(t);if(l){if(l[2]!==void 0&&parseInt(l[2],16)===0)return null;let c=parseInt(l[1],16);return[c>>16&255,c>>8&255,c&255]}return null}function oi(e){let t=ri(e);if(!t)return null;let o=t.map(l=>{let c=l/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)});return .2126*o[0]+.7152*o[1]+.0722*o[2]}var Ir=.4,He=null;function ii(e,t){if(typeof e!="string")return null;if(ri(e)!==null||/^rgba?\(/i.test(e))return e;try{if(!He){let f=t.createElement("canvas");f.width=1,f.height=1,He=f.getContext("2d",{willReadFrequently:!0})}if(!He)return e;if(He.fillStyle="#000000",He.fillStyle=e,He.fillStyle==="#000000"&&!/^#0{6}$|^black$/i.test(e.trim()))return null;He.clearRect(0,0,1,1),He.fillRect(0,0,1,1);let[o,l,c,u]=He.getImageData(0,0,1,1).data;return u===0?null:`rgba(${o}, ${l}, ${c}, ${u/255})`}catch{return e}}var Dr=e=>e<Ir?"dark":"light";function si(e=document,t=null){let o=e.defaultView;if(!o||!e.documentElement)return"light";let l=u=>!!(u&&u.closest&&u.closest(`#${st}`)),c=t;if(!c)try{let u=o.innerWidth/2,f=o.innerHeight/2;c=(e.elementsFromPoint?e.elementsFromPoint(u,f):[e.elementFromPoint(u,f)]).find(_=>_&&!l(_))||null}catch{c=null}l(c)&&(c=null),c||(c=e.body);for(let u=c;u;u=u.parentElement){let f=null;try{f=o.getComputedStyle(u)}catch{f=null}if(!f)continue;let $=oi(ii(f.backgroundColor,e));if($!==null)return Dr($);if(f.backgroundImage&&f.backgroundImage!=="none"){let _=oi(ii(f.color,e));if(_!==null)return _>.5?"dark":"light"}}return"light"}var ai=["#d1242f","#7c3aed","#2563eb","#0f766e","#15803d","#b45309","#be185d","#4338ca"],Fr="#6b7280";function qr(e){let t=0;for(let o=0;o<e.length;o+=1)t=Math.imul(t,31)+e.charCodeAt(o)|0;return t>>>0}function mn(e){let t=String(e||"").trim().split(/\s+/).filter(Boolean);if(!t.length)return"?";let o=Array.from(t[0])[0]||"",l=t.length>1&&Array.from(t[t.length-1])[0]||"";return(o+l).toUpperCase()}function gn(e){let t=e&&(e.username||e.name),o=String(t||"").trim().toLowerCase();return o?ai[qr(o)%ai.length]:Fr}var zr=["change","bug","question","like"],Br=320,V=26,at=300;function s(e,t={},o=[]){let l=document.createElement(e);for(let[c,u]of Object.entries(t))c==="text"?l.textContent=u:c.startsWith("on")?l.addEventListener(c.slice(2).toLowerCase(),u):u!=null&&l.setAttribute(c,u);for(let c of[].concat(o))c&&l.appendChild(c);return l}function li(e){let t="http://www.w3.org/2000/svg",o=document.createElementNS(t,"svg");o.setAttribute("viewBox","0 0 16 16"),o.setAttribute("aria-hidden","true"),o.setAttribute("class","gm-icon");let l=document.createElementNS(t,"path");return l.setAttribute("d",e),o.appendChild(l),o}var di="M2 3h12v8H6l-3 3v-3H2z",ve=(e,t,o)=>Math.min(o,Math.max(t,e)),Pr=e=>String(e||"").replace(/\s+/g," ").trim();function ci(e){let t=Date.parse(e||"");if(!Number.isFinite(t))return"";let o=Math.max(0,Math.round((Date.now()-t)/1e3));return o<60?"now":o<3600?`${Math.round(o/60)}m`:o<86400?`${Math.round(o/3600)}h`:`${Math.round(o/86400)}d`}function Ur(e,t){if(!e||typeof t!="string"||!t||t.length>200)return null;let o=new RegExp(t.split(/\s+/).map(u=>u.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("\\s+")),l=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),c;for(;c=l.nextNode();){let u=o.exec(c.data);if(u){let f=document.createRange();return f.setStart(c,u.index),f.setEnd(c,u.index+u[0].length),f}}return null}function ui(e){let{store:t,batch:o,createComment:l,anchorFromElement:c,anchorFromSelection:u,resolve:f,setRecording:$,targetFor:_}=e,h=e.sync||null,q={gitlab:"GitLab",github:"GitHub"},re=n=>q[n]||String(n||""),L=n=>{let r=n&&n.name&&n.name.trim()||"Someone";if(!n||n.verified!==!0)return r;let d=n.username?` @${n.username}`:"";return`${r}${d} \xB7 ${re(n.provider)}`},M=n=>n&&n.verified===!0?"gm-author is-verified":"gm-author",C=n=>n.author||(h?null:{name:t.reviewer()}),le=(n,r="gm-avatar")=>s("span",{class:r,style:`--gm-author:${gn(n)}`,text:mn(n&&n.name),"aria-hidden":"true"}),K=s("div",{id:st,popover:"manual"}),B=K.attachShadow({mode:"open"});B.appendChild(s("style",{text:ni})),document.body.appendChild(K);try{K.showPopover()}catch{K.removeAttribute("popover")}let Ee="light";function Z(){Ee=si(document),K.classList.toggle("gm-dark",Ee==="dark")}Z();let et=s("div"),R=s("div");B.append(et,R);let P=s("div",{class:"gm-frame gm-target",hidden:"hidden"});B.appendChild(P);let J=!1,G=null,be=null,W=null,O=null,ne="",ee=!1,F=null,Q=null,Ie=null,oe=null,we=!1,ye=!1,We="",D=!1,Ae="all",ie=!1,ue=null,Le=null,de=null,Oe=!1,pe=null,Bt=!1,Pt="pin",lt="",Ye="",dt="",ct=new Map,tt=new Map,me=s("button",{class:"gm-switch",type:"button",role:"switch","aria-checked":"false",title:"Comment mode. While this is on, clicking marks a spot instead of using the page. C turns it on, Escape off."},[li(di),s("span",{class:"label",text:"Comment"})]),ke=s("span",{class:"count",text:"0"}),wt=s("span",{class:"dot",hidden:"hidden"}),Te=s("button",{class:"gm-badge",type:"button","aria-expanded":"false",title:"All comments","data-focus":"badge"},[li(di),ke,wt]),nt=s("span",{class:"gm-avatar","aria-hidden":"true"}),ot=s("span",{class:"label",hidden:"hidden"}),De=s("button",{class:"gm-id",type:"button","aria-expanded":"false","aria-label":"Your name"},[nt,ot]),yt=s("div",{class:"gm-bar",role:"toolbar","aria-label":"gitmargin"},[me,Te,De]),Fe=s("button",{class:"gm-notice",type:"button","aria-live":"polite",hidden:"hidden"});Fe.addEventListener("click",()=>fn()),B.append(yt,Fe);let Ge=s("input",{type:"text",id:"gm-reviewer",placeholder:"optional",maxlength:"80"}),Se=s("div",{class:"gm-who"},[s("label",{for:"gm-reviewer",text:h?"Your name, shown with your comments":"Your name, for the author"}),Ge]),ut=s("span",{class:"gm-identity-says"}),pt=s("span",{class:"gm-identity-code",hidden:"hidden"}),a=s("div",{class:"gm-identity-live",role:"status","aria-live":"polite"},[ut,pt]),m=s("button",{type:"button",class:"gm-identity-btn"}),x=s("button",{type:"button",class:"gm-identity-quiet",hidden:"hidden"}),b=s("div",{class:"gm-identity",hidden:"hidden"},[a,s("div",{class:"gm-identity-actions"},[m,x])]);m.addEventListener("click",()=>h&&h.signIn()),x.addEventListener("click",()=>{h&&(h.view().signin.state==="waiting"?h.cancelSignIn():h.signOut())});let S=s("div",{class:"gm-pop gm-idpop",hidden:"hidden",role:"dialog","aria-label":"Your name"},[...h?[b]:[],Se]);B.appendChild(S);let j=s("span",{class:"count",text:"0"}),T=s("div",{class:"gm-section"},[s("span",{text:"Comments"}),j]),Y=s("button",{class:"gm-close",type:"button",title:"Close","aria-label":"Close the comments list",text:"\u2715"}),qe=s("div",{class:"gm-filters",hidden:h?null:"hidden"}),$e=["all","unread","mine"].map(n=>s("button",{type:"button",class:"gm-filter","data-filter":n,"aria-pressed":"false",text:n[0].toUpperCase()+n.slice(1)}));$e.forEach(n=>{qe.appendChild(n),n.addEventListener("click",()=>{Ae=n.dataset.filter,X(!0)})});let ze=s("div",{class:"gm-list"}),I=s("textarea",{placeholder:"Anything that is not about one spot","aria-label":"A note about the whole thing",hidden:"hidden"}),se=s("button",{class:"gm-note-toggle",type:"button",text:"Add a note about the whole thing"}),Be=s("button",{class:"gm-btn primary",type:"button",text:"Send to author"}),mt=s("button",{class:"gm-btn ghost",type:"button",text:"Copy for author"}),Kn=s("div",{class:"gm-said",role:"status","aria-live":"polite"}),Xn=s("div",{class:"gm-keep",role:"status","aria-live":"polite"}),kt=s("button",{class:"gm-version",type:"button","aria-expanded":"false"}),gt=s("div",{class:"gm-versions",hidden:"hidden","aria-live":"polite"}),Ut=s("div",{class:"gm-newer",role:"status"}),Qn=s("div",{class:"gm-shared",hidden:"hidden"},[kt,gt,Ut]),Zn=s("div",{class:"gm-sheet",hidden:"hidden",role:"complementary","aria-label":"gitmargin comments"},[s("div",{class:"gm-sheet-head"},[s("div",{class:"gm-sheet-title"},[T,s("div",{class:"gm-spacer"}),Y]),Xn,...h?[Qn]:[]]),qe,ze,s("div",{class:"gm-foot"},[se,I,s("div",{class:"gm-send"},[Be,mt]),Kn])]);B.appendChild(Zn);let te=s("div",{class:"gm-thread",hidden:"hidden",role:"dialog","aria-label":"Comment"}),Ve=s("div",{class:"gm-preview",hidden:"hidden","aria-hidden":"true"});B.append(te,Ve),te.addEventListener("click",n=>n.stopPropagation());function St(){yt.classList.toggle("is-shifted",D),Fe.classList.toggle("is-shifted",D),S.classList.toggle("is-shifted",D),Zn.hidden=!D,Te.setAttribute("aria-expanded",D?"true":"false"),S.hidden=!ie,De.setAttribute("aria-expanded",ie?"true":"false"),eo()}function eo(){Fe.textContent!==lt&&(Fe.textContent=lt),Fe.hidden=!lt||ie||D}let fn=()=>{D||(D=!0,Bt=!0,ie=!1,St(),X(!0))},jt=()=>{D&&(D=!1,St(),X())};function Ht(){ie&&(ie=!1,St())}function hn(n,{scroll:r=!1,from:d="pin"}={}){if(G=n,Pt=d,ue=null,Ht(),h&&!h.isMine(n)&&t.markSeen&&t.markSeen(n),X(!0),!r)return;let i=kn.find(p=>p.comment.id===n);i&&i.element&&i.status==="found"&&i.element.scrollIntoView({block:"center",behavior:"smooth"})}function mi(){let n=t.comments().find(r=>r.id===be);return n?n.intent.text:""}function to(){return be!==null&&de!==null&&de!==mi()&&!Oe?(Oe=!0,X(!0),!1):(Wt(),!0)}function Wt(){if(G===null)return;let n=G;G=null,be=null,de=null,Oe=!1,pe=null,ne.trim()||(W=null,O=null),X(!0),gi(n)}function gi(n){let r=Ke.get(n),d=D?Xt.get(n):null,i=w=>w&&w.isConnected&&w;((Pt==="card"?i(d)||i(r):i(r)||i(d))||Te).focus()}let Yt=n=>{J=!!n,$(!J),me.classList.toggle("is-on",J),document.documentElement.style.cursor=J?"crosshair":"",K.classList.toggle("gm-armed",J),me.setAttribute("aria-checked",J?"true":"false"),J?Ht():Je(),!J&&!Ne.value.trim()&&xn()};me.addEventListener("click",()=>Yt(!J)),Te.addEventListener("click",()=>D?jt():fn()),Y.addEventListener("click",()=>{jt(),Te.focus()}),De.addEventListener("click",()=>{ie=!ie,St(),ie&&!Se.hidden&&Ge.focus()});function fi(){I.hidden=!1,se.textContent="A note about the whole thing",I.focus()}se.addEventListener("click",()=>{if(!I.hidden){I.hidden=!0,se.textContent="Add a note about the whole thing";return}fi()}),Ge.addEventListener("input",()=>t.setReviewer(Ge.value)),I.addEventListener("input",()=>t.setOverallNote(I.value));function no(n){Kn.textContent=n}function hi(){let n=o.download();t.markExported(),no(`Saved ${n} to your downloads. Reply to the message you got this file in and attach it.`)}async function xi(){let n=await o.copy();window.__gitmargin&&(window.__gitmargin.lastCopy=n.text,window.__gitmargin.lastCopyOk=n.ok),n.ok&&t.markExported(),no(n.ok?"Copied. Paste it anywhere.":"Could not reach the clipboard. Use Send to author instead.")}Be.addEventListener("click",hi),mt.addEventListener("click",xi);let oo=s("div",{class:"where"}),Ne=s("textarea",{placeholder:"What did you expect here?","aria-label":"What did you expect here?"}),Gt=zr.map(n=>s("button",{class:"gm-chip",type:"button",text:n,"data-tag":n,"aria-pressed":"false"})),$t=s("div",{class:"gm-boxwarn"}),io=s("button",{class:"gm-btn primary",type:"button",text:"Save"}),ro=s("button",{class:"gm-btn",type:"button",text:"Cancel"}),so="Not saved yet. Others will see this, so add your name, or press again to go without one.",Ct=s("input",{type:"text","aria-label":"Your name, shown with your comments","aria-describedby":"gm-box-name-why",placeholder:"Your name",maxlength:"80"}),Vt=s("div",{class:"gm-box-name",hidden:"hidden"},[s("div",{class:"gm-box-name-why",id:"gm-box-name-why",text:so}),Ct]);function vi(){let n=ae.getBoundingClientRect();ae.style.top=`${ve(n.top,8,Math.max(8,window.innerHeight-n.height-8))}px`}let bi=()=>!!(h&&h.view().identity.mode!=="none"),Jt=!1,ao=!1;function lo(n="box"){return!h||ao||t.reviewer().trim()||bi()?!1:(ao=!0,n==="box"?(Vt.hidden=!1,vi(),Ct.focus()):(Jt=!0,X(!0)),!0)}Ct.addEventListener("input",()=>t.setReviewer(Ct.value));let ae=s("div",{class:"gm-box",hidden:"hidden"},[oo,Ne,s("div",{class:"gm-chips"},Gt),Vt,s("div",{class:"gm-box-actions"},[io,ro]),$t]);B.appendChild(ae),Gt.forEach(n=>n.addEventListener("click",()=>{let r=n.dataset.tag;Q.tag=Q.tag===r?null:r,Gt.forEach(d=>{let i=d.dataset.tag===Q.tag;d.classList.toggle("is-on",i),d.setAttribute("aria-pressed",i?"true":"false")})}));function xn(){ae.hidden=!0,Q=null,Je(),Gt.forEach(n=>{n.classList.remove("is-on"),n.setAttribute("aria-pressed","false")}),Ne.value="",$t.textContent="",Vt.hidden=!0}function vn(){return Ne.value.trim()&&!$t.textContent?($t.textContent="Press again to discard what you typed.",Ne.focus(),!1):(xn(),!0)}function co(n,r){let d=n.quote&&n.quote.exact;if(d)return`"${d.slice(0,60)}"`;let i=r&&r.nodeType===1?(r.getAttribute("aria-label")||r.getAttribute("title")||"").trim():"",p=r&&r.nodeType===1?r.localName:"",w=o.nounFor(p||n.selector);return i?`the "${i}" ${w}`:`the ${w}`}function uo({anchor:n,element:r,x:d,y:i,framed:p=null}){Q={anchor:n,element:r,tag:null},oo.textContent=co(n,r),p?wn(p):Je(),Wt(),Ne.value="",ae.hidden=!1;let w=300,g=ae.getBoundingClientRect().height||190,v=d,y=i;if(!Number.isFinite(v)||!Number.isFinite(y)||v===0&&y===0){let E=r&&r.getBoundingClientRect?r.getBoundingClientRect():{left:24,bottom:24};v=E.left,y=E.bottom}ae.style.left=`${ve(v+12,8,Et()-w-8)}px`,ae.style.top=`${ve(y+12,8,window.innerHeight-g-8)}px`,Ne.focus()}function bn(){let n=Ne.value.trim();if(!n||!Q||lo())return;Vt.hidden=!0;let r=l({anchor:Q.anchor,element:Q.element,text:n,tag:Q.tag});t.add(r),xn()}io.addEventListener("click",bn),ro.addEventListener("click",vn),Ne.addEventListener("keydown",n=>{n.key==="Enter"&&(n.metaKey||n.ctrlKey)&&bn()}),Ct.addEventListener("keydown",n=>{n.key==="Enter"&&!n.isComposing&&bn()}),Ne.addEventListener("input",()=>{$t.textContent=""}),document.addEventListener("keydown",n=>{if(n.key==="Escape"){if(!ae.hidden){n.preventDefault(),vn();return}if(G!==null){n.preventDefault(),to();return}if(ie){n.preventDefault(),Ht();return}if(D){n.preventDefault(),jt(),Te.focus();return}J&&(n.preventDefault(),Yt(!1))}});let Kt=4;function po(){if(!oe)return;let n=oe.isConnected?oe.getBoundingClientRect():null;if(!n||!n.width&&!n.height){Je();return}let r=Math.max(n.left-3,Kt),d=Math.max(n.top-3,Kt),i=Math.min(n.right+3,window.innerWidth-Kt),p=Math.min(n.bottom+3,window.innerHeight-Kt);if(i<=r||p<=d){P.hidden=!0;return}P.style.left=`${r}px`,P.style.top=`${d}px`,P.style.width=`${i-r}px`,P.style.height=`${p-d}px`,P.hidden=!1}function wn(n){oe=n,po()}function Je(){oe=null,P.hidden=!0}function mo(){let n=window.getSelection();return!n||n.isCollapsed||!n.toString().trim()?null:ye||n.toString()!==We?n:null}function wi(){return we&&!!mo()}function yi(n){if(!J||!ae.hidden)return;if(wi()){Je();return}let r=_(n);r?wn(r):Je()}let go=null,yn=!1;document.addEventListener("pointermove",n=>{J&&(go=n.target,!yn&&(yn=!0,requestAnimationFrame(()=>{yn=!1,yi(go)})))},!0),document.addEventListener("pointerdown",()=>{we=!0,ye=!1,We=String(window.getSelection()||"")},!0),document.addEventListener("selectionchange",()=>{we&&(ye=!0)}),document.addEventListener("pointerup",()=>{we=!1},!0),document.addEventListener("pointercancel",()=>{we=!1},!0),document.documentElement.addEventListener("pointerleave",()=>{J&&ae.hidden&&Je()}),document.addEventListener("focusin",n=>{if(!J||!ae.hidden)return;let r=_(n.target);r?wn(r):Je()},!0),document.addEventListener("mouseup",()=>{J&&(Ie=mo())},!0),document.addEventListener("click",n=>{let r=n.target,d=r&&r.nodeType===1&&r.closest(`#${st}`);if(d||(Ht(),G!==null&&(ae.hidden||J)&&to()),!J||!r||r.nodeType!==1||d||(n.preventDefault(),n.stopPropagation(),!ae.hidden&&!vn()))return;let i,p,w=null;if(Ie)i=u(Ie),p=Ie.getRangeAt(0).commonAncestorContainer,p=p.nodeType===1?p:p.parentElement,Ie=null;else{let g=_(r);if(!g)return;i=c(g,n),p=g,w=g}uo({anchor:i,element:p,x:n.clientX,y:n.clientY,framed:w})},!0),document.addEventListener("keydown",n=>{if(!ae.hidden||n.key!=="c"&&n.key!=="C"||n.metaKey||n.ctrlKey||n.altKey)return;let r=document.activeElement;for(;r&&r.shadowRoot&&r.shadowRoot.activeElement;)r=r.shadowRoot.activeElement;if(r&&(r.isContentEditable||r.matches("input, textarea, select")))return;if(!J){n.preventDefault(),Yt(!0);return}let d=window.getSelection(),i=d&&!d.isCollapsed&&d.toString().trim();if(!i&&r&&r.closest&&r.closest(`#${st}`))return;let p=i?d.getRangeAt(0).commonAncestorContainer.nodeType===1?d.getRangeAt(0).commonAncestorContainer:d.getRangeAt(0).commonAncestorContainer.parentElement:oe||_(r);if(!p)return;n.preventDefault();let w=i?u(d):c(p,null);uo({anchor:w,element:p,framed:i?null:p})});let Ke=new Map,Xt=new Map,kn=[],Et=()=>window.innerWidth-(D?Br:0);function ki(n,r,d){let i=n.anchor.quote&&n.anchor.quote.exact;return!!(d&&i&&Pr(r.textContent).length>i.length)}function Si(n){try{let r=document.createRange();r.selectNodeContents(n);let d=Array.from(r.getClientRects()).filter(i=>i.width&&i.height);return d.length?{left:Math.min(...d.map(i=>i.left)),right:Math.max(...d.map(i=>i.right))}:null}catch{return null}}function $i(n,r,d){let p=[[n+V/2,r+V/2],[n+1,r+1],[n+V-1,r+1],[n+1,r+V-1],[n+V-1,r+V-1]];for(let[w,g]of p){let v=null;try{v=document.elementFromPoint(w,g)}catch{return!0}if(!(!v||v===document.body||v===document.documentElement)){if(v===K)return!1;if(!(v===d||v.contains(d)))return!1}}return!0}function Ci(n){R.textContent="",ct.clear();let r=new Set,d=[];for(let i of Ke.values())i.style.pointerEvents="none";n.forEach(({comment:i,status:p,element:w},g)=>{if(p!=="found"||!w)return;let v=w.getBoundingClientRect();if(v.bottom<0||v.top>window.innerHeight||v.right<0||v.left>window.innerWidth)return;r.add(i.id);let y=null;try{y=Ur(w,i.anchor.quote&&i.anchor.quote.exact)}catch{}let E=y?Array.from(y.getClientRects()).filter(U=>U.width):[],A=ki(i,w,y)&&E.length>0,k=A?{x:E[E.length-1].right,top:E[E.length-1].top,bottom:E[E.length-1].bottom}:{x:v.left,top:v.top,bottom:v.bottom},N=Ke.get(i.id);N||(N=s("button",{class:"gm-pin",type:"button","data-focus":`pin:${i.id}`},[s("span",{class:"initials"})]),N.addEventListener("click",U=>{U.stopPropagation(),G===i.id?Wt():hn(i.id)}),N.addEventListener("pointerenter",U=>{U.pointerType&&U.pointerType!=="mouse"||G===null&&(ue=i.id,Sn())}),N.addEventListener("pointerleave",()=>{ue===i.id&&(ue=null,Sn())}),Ke.set(i.id,N),et.appendChild(N));let ge=C(i);N.style.setProperty("--gm-author",gn(ge)),N.firstChild.textContent=mn(ge&&ge.name),N.title=i.intent.text,N.setAttribute("aria-label",`Comment ${g+1}: ${i.intent.text}`),N.classList.toggle("is-selected",G===i.id),N.classList.toggle("is-hot",Le===i.id);let Re=Si(w),xe=Re?{left:Math.max(v.left,Re.left-2),right:Math.min(v.right,Re.right+2)}:{left:v.left,right:v.right};G===i.id&&R.appendChild(s("div",{class:"gm-frame",style:`left:${xe.left-3}px;top:${v.top-3}px;width:${xe.right-xe.left+6}px;height:${v.height+6}px`}));let H=4,_e=V-4,Ce=A?[{left:k.x-2,top:k.top-V-H,cls:"",dir:1,at:[k.x,k.top]},{left:k.x-2,top:k.bottom+H,cls:"is-below",dir:1,at:[k.x,k.bottom]}]:[{left:k.x-V+H,top:k.top-V+H,cls:"is-left",dir:-1,at:[k.x,k.top]},{left:k.x-V+H,top:k.top-H,cls:"is-below is-left",dir:-1,at:[k.x,k.top]},{left:k.x-2,top:k.top-V-H,cls:"",dir:1,at:[k.x,k.top]},{left:k.x-2,top:k.bottom+H,cls:"is-below",dir:1,at:[k.x,k.bottom]},{left:k.x-V+H,top:k.bottom-H,cls:"is-below is-left",dir:-1,at:[k.x,k.bottom]}],rt=Et()-V-2,ft=window.innerHeight-V-2,En=(U,Pe)=>d.some(he=>U<he.right+6&&U+V>he.left-6&&Pe<he.bottom+6&&Pe+V>he.top-6),yo=`${Math.round(k.x)},${Math.round(k.top)},${Math.round(k.bottom)},${rt},${ft},${A?1:0}`,Nt=tt.get(i.id),fe=Nt&&Nt.key===yo&&!En(Nt.pick.left,Nt.pick.top)?Nt.pick:null;for(let U of fe?[]:Ce){for(let Pe=0;Pe<=3&&!fe;Pe+=1){let he=U.left+Pe*_e*U.dir,Rt=U.top;he<2||he>rt||Rt<2||Rt>ft||En(he,Rt)||!$i(he,Rt,w)||(fe={...U,left:he,top:Rt})}if(fe)break}if(!fe){let U=ve(Ce[0].left,2,rt),Pe=ve(Ce[0].top,2,ft);for(let he=0;he<4&&En(U,Pe);he+=1)U=ve(U+_e*Ce[0].dir,2,rt);fe={...Ce[0],left:U,top:Pe}}tt.set(i.id,{key:yo,pick:fe});let ht=fe.left,xt=fe.top,ko=fe.cls.includes("is-left"),An=fe.cls.includes("is-below");N.style.left=`${ht}px`,N.style.top=`${xt}px`,N.style.pointerEvents="",N.classList.toggle("is-left",ko),N.classList.toggle("is-below",An),d.push({left:ht,top:xt,right:ht+V,bottom:xt+V}),ct.set(i.id,{left:ht,top:xt,below:An,rect:v,textRight:xe.right,frameRight:xe.right+3});let So=ko?ht+V:ht,$o=An?xt:xt+V,Co=fe.at[0]-So,Eo=fe.at[1]-$o,Ln=Math.hypot(Co,Eo);if(Ln>8&&Ln<240){let U=Math.atan2(Eo,Co)*180/Math.PI;R.appendChild(s("div",{class:"gm-leader",style:`left:${So}px;top:${$o}px;width:${Ln}px;transform:rotate(${U}deg)`}))}if(A)for(let U of E)R.appendChild(s("div",{class:"gm-underline",style:`left:${U.left}px;top:${U.bottom}px;width:${U.width}px`}))});for(let[i,p]of Ke)r.has(i)||(p.remove(),Ke.delete(i),tt.delete(i))}function Sn(){let n=ue!==null?kn.find(g=>g.comment.id===ue):null,r=n&&ct.get(n.comment.id);if(!n||!r){Ve.hidden=!0;return}Ve.textContent="";let d=C(n.comment);Ve.append(s("b",{text:L(d)}),s("span",{text:n.comment.intent.text})),Ve.hidden=!1;let i=220,p=Ve.offsetHeight||44,w=r.left+V+8;w+i>Et()-8&&(w=r.left-i-8),Ve.style.left=`${ve(w,8,Et()-i-8)}px`,Ve.style.top=`${ve(r.top,8,window.innerHeight-p-8)}px`}function fo(n,{own:r=!1,time:d=""}={}){let i=s("div",{class:"gm-meta"},[s("span",{class:M(n),text:r?`${L(n)} (you)`:L(n)}),d?s("span",{class:"gm-time",text:ci(d)}):null]);return s("div",{class:"gm-who-row"},[le(n),i])}function Ei(n){let r=Array.isArray(n.replies)?n.replies:[],d=h&&W===n.id;if(!r.length||d&&O&&r.length===1)return null;let i=s("div",{class:"gm-replies"});return r.forEach(p=>{if(d&&O===p.id)return;let w=h&&h.isMine(p.id),g=s("div",{class:"gm-reply"},[fo(p.author,{own:w,time:p.time}),h&&h.isUnshared(p.id)?s("div",{class:"gm-meta",style:"margin-left:28px"},[s("span",{class:"gm-flag",text:"not shared yet"})]):null,s("p",{class:"gm-text",text:String(p.text||"")})]);if(w){let v=s("button",{type:"button",class:"gm-quiet",text:"Edit","data-focus":`redit:${p.id}`}),y=s("button",{type:"button",class:"gm-del gm-quiet",text:"Delete","data-focus":`rdel:${p.id}`});v.addEventListener("click",()=>{W=n.id,O=p.id,ne=String(p.text||""),X(!0)}),pe===`reply:${p.id}`&&(y.textContent="Delete?",y.dataset.armed="yes"),y.addEventListener("click",()=>{if(pe!==`reply:${p.id}`){pe=`reply:${p.id}`,F=`rdel:${p.id}`,X(!0);return}pe=null,h.removeReply(n.id,p.id),F=`reply:${n.id}`,X(!0)}),g.appendChild(s("div",{class:"gm-card-actions"},[v,y]))}i.appendChild(g)}),i}function Ai(n){let r=s("div",{class:"gm-reply-write"});{let d=s("input",{type:"text",class:"gm-reply-field","aria-label":"Your reply",placeholder:"Reply",maxlength:"4000"});d.value=ne;let i=Jt&&!t.reviewer().trim(),p=s("input",{type:"text",class:"gm-reply-field gm-reply-name","aria-label":"Your name, shown with your comments","aria-describedby":"gm-reply-name-why",placeholder:"Your name",maxlength:"80"}),w=s("div",{class:"gm-boxwarn",role:"status",text:ee?"Press again to discard what you typed.":""}),g=s("button",{type:"button",class:"gm-reply-send",text:O?"Save":"Send"}),v=s("button",{type:"button",text:"Cancel"}),y=()=>{W=null,O=null,ne="",Jt=!1,ee=!1,F=`reply:${n.id}`,X(!0)},E=()=>{if(d.value.trim()&&!ee){ee=!0,w.textContent="Press again to discard what you typed.";return}y()},A=()=>{let N=d.value.trim();N&&(lo("panel")||(i&&p.value.trim()&&t.setReviewer(p.value),O?h.editReply(n.id,O,N):h.addReply(n.id,N),y()))};d.addEventListener("input",()=>{ne=d.value,ee=!1,w.textContent=""});let k=N=>{N.key==="Enter"&&!N.isComposing&&A(),N.key==="Escape"&&(N.stopPropagation(),E())};d.addEventListener("keydown",k),p.addEventListener("keydown",k),g.addEventListener("click",A),v.addEventListener("click",E),i&&r.appendChild(s("div",{class:"gm-reply-ask"},[s("div",{class:"gm-box-name-why",id:"gm-reply-name-why",text:so}),p])),r.appendChild(s("div",{class:"gm-reply-row"},[d,g,v])),r.appendChild(w),requestAnimationFrame(()=>{if(W!==n.id)return;let N=i?p:d;B.activeElement!==d&&B.activeElement!==p&&N.focus()})}return r}function Qt(){if(!F)return;let n=F;requestAnimationFrame(()=>{if(F!==n||(F=null,B.activeElement))return;let r=Array.from(B.querySelectorAll("[data-focus]")).find(d=>d.dataset.focus===n);r&&r.focus()})}function ho(n){let{comment:r,status:d,via:i}=n,p=[];return d==="hidden"&&p.push(s("span",{class:"gm-flag",text:"on another screen"})),d==="orphaned"&&p.push(s("span",{class:"gm-flag",text:"orphaned"})),(i==="ancestor"||i==="quote-loose")&&d!=="orphaned"&&p.push(s("span",{class:"gm-flag",text:"nearby"})),h&&h.isUnshared(r.id)&&p.push(s("span",{class:"gm-flag",text:"not shared yet"})),p}function Li(n,r){let d=G!==null?n.find(H=>H.comment.id===G):null;if(!d){G!==null&&(G=null),te.hidden=!0;return}let{comment:i,status:p,element:w}=d,g=!h||h.isMine(i.id),v=i.state.screen&&i.state.screen.name,y=n.indexOf(d),E=be===i.id||W===i.id,A=JSON.stringify([i,p,d.via,g,y,v,be,W,O,Jt,ee,Oe,pe,t.reviewer()]);if(!r&&te.childElementCount&&(E||A===dt))return;dt=A;let k=B.activeElement;!F&&k&&te.contains(k)&&k.dataset.focus&&(F=k.dataset.focus),te.textContent="";let N=s("div",{class:"gm-thread-ctx"},[s("span",{class:"where"},[s("b",{text:`#${y+1}`}),v?s("span",{class:"gm-screen",text:v}):null,s("span",{class:"gm-quote",text:co(i.anchor,w)})]),...ho(d),i.status&&i.status!=="open"?s("span",{class:"gm-status",text:i.status}):null]),ge=s("div",{class:"gm-thread-body"});if(ge.appendChild(fo(i.author||C(i),{own:!!(h&&g),time:i.time})),i.intent.tag&&ge.appendChild(s("div",{class:"gm-meta",style:"margin-left:28px"},[s("span",{class:"gm-tag",text:i.intent.tag})])),be===i.id){let H=s("textarea",{"data-focus":`editing:${i.id}`});H.value=de===null?i.intent.text:de,H.addEventListener("input",()=>{de=H.value,Oe=!1});let _e=s("button",{type:"button",text:"Save"}),Ce=s("button",{type:"button",text:"Cancel"}),rt=()=>{be=null,de=null,Oe=!1,F=`edit:${i.id}`,X(!0)};_e.addEventListener("click",()=>{let ft=H.value.trim();ft&&t.update(i.id,{intent:{...i.intent,text:ft}}),rt()}),Ce.addEventListener("click",rt),ge.append(H,s("div",{class:"gm-card-actions"},[_e,Ce]),s("div",{class:"gm-boxwarn",role:"status",text:Oe?"Press again to discard what you typed.":""}))}else{let H=s("button",{type:"button",class:"gm-quiet",text:"Edit","data-focus":`edit:${i.id}`}),_e=s("button",{type:"button",class:"gm-del gm-quiet",text:"Delete","data-focus":`del:${i.id}`});H.addEventListener("click",()=>{be=i.id,de=i.intent.text,Oe=!1,F=`editing:${i.id}`,X(!0)}),pe===i.id&&(_e.textContent="Delete?",_e.dataset.armed="yes"),_e.addEventListener("click",()=>{if(pe!==i.id){pe=i.id,F=`del:${i.id}`,X(!0);return}pe=null,t.remove(i.id),X(!0),Te.focus()});let Ce=g?[H,_e]:[];ge.append(s("p",{class:"gm-text",text:i.intent.text}),...Ce.length?[s("div",{class:"gm-card-actions"},Ce)]:[])}let Re=Ei(i);Re&&ge.appendChild(Re);let xe=s("div",{class:"gm-thread-foot"});if(h&&W===i.id)xe.appendChild(Ai(i));else if(h){let H=s("button",{type:"button",class:"gm-reply-btn",text:"Reply","data-focus":`reply:${i.id}`});H.addEventListener("click",()=>{if(W&&W!==i.id&&ne.trim()&&!ee){ee=!0,X(!0);return}ee=!1,W=i.id,O=null,ne="",X(!0)}),xe.appendChild(H),W&&W!==i.id&&ee&&xe.appendChild(s("div",{class:"gm-boxwarn",role:"status",text:"Press again to discard the reply you were writing elsewhere."}))}te.append(N,ge,xe),te.hidden=!1,te.dataset.id=i.id,te.dataset.status=p,Qt()}function Oi(){if(te.hidden)return;let n=ct.get(G),r=te.offsetHeight||200,d=Et();if(!n){te.style.left=`${Math.max(8,d-at-16)}px`,te.style.top="52px";return}let{rect:i,textRight:p,frameRight:w}=n,g,v=n.top-8,y=!1;i.right+12+at<=d-8?(g=i.right+12,y=!0):p+14+at<=d-8?(g=p+14,y=!0):i.left-14-at>=8?g=i.left-14-at:(g=n.left,v=i.bottom+10);let E=ve(v,8,Math.max(8,window.innerHeight-r-8));te.style.left=`${ve(g,8,Math.max(8,d-at-8))}px`,te.style.top=`${E}px`,te.classList.toggle("is-beside",y);let A=(i.top+i.bottom)/2;te.style.setProperty("--gm-caret",`${ve(A-E,12,Math.max(12,r-12))}px`);let k=ve(g,8,Math.max(8,d-at-8));y&&k-6-w>12&&A>E&&A<E+r&&R.appendChild(s("div",{class:"gm-tie",style:`left:${w+1}px;top:${A}px;width:${k-6-w-1}px`}))}let it=!1,$n="",xo=null,At=new Set,Lt=new Map;kt.addEventListener("click",()=>{it=!it,$n="",Zt()});function Ti(n){let r=n.state&&n.state.screen&&n.state.screen.name,d=n.anchor&&n.anchor.quote&&n.anchor.quote.exact;return s("div",{class:"gm-older"},[s("div",{class:"gm-meta"},[s("span",{class:M(n.author),text:L(n.author)}),r?s("span",{text:r}):null,n.status&&n.status!=="open"?s("span",{class:"gm-status",text:n.status}):null]),d?s("div",{class:"gm-older-quote",text:`"${d}"`}):null,s("p",{class:"gm-text",text:String(n.intent&&n.intent.text||"")})])}let vo="";function Ni(n){let r=n.identity.mode!=="none",d=re(n.identity.mode),i=n.unsent,p=n.identity.read==="members",w=i?`to send ${i} comment${i===1?"":"s"}`:p?"to see comments":"to comment",g="",v="",y="",E="",A=!1;if(r&&n.session)g=`Commenting as ${n.session.name||"you"}${n.session.username?` @${n.session.username}`:""} \xB7 ${re(n.session.provider)}`,E="Sign out";else if(r&&n.signin.state==="waiting")g=`Waiting for ${d}... Finish in the small window, and check it shows this code:`,v=n.signin.shortCode||"",E="Cancel",A=!0;else if(r&&n.signin.state==="blocked")g="Your browser blocked the sign-in window. Allow pop-ups for this page, then try again.",y=`Sign in with ${d}`,A=!0;else if(r&&n.signin.state==="not_member"){let ge=n.signin.who||{},Re=n.identity.mode==="github",xe=ge.members||n.identity.members||(Re?"the repository":"the group");g=`Your account ${Re?"has no access to":"is not in"} ${xe}. You are signed in to ${d} as ${ge.name||"someone"}, and only ${Re?"people who can open it":"members"} can ${p?"open this prototype":"comment here"}. Ask the author for access, or sign out of ${d} and sign in here with another account.`,y=`Sign in with ${d} again`,A=!0}else r&&n.signin.state==="failed"?(g="Sign-in did not finish.",y=`Sign in with ${d} ${w}`,A=!0):r&&(g=i?"Saved here. Not shared until you sign in.":"",y=`Sign in with ${d} ${w}`,A=i>0);let k=[r,g,v,y,E].join("|");if(k===vo)return;let N=B.activeElement===m||B.activeElement===x;vo=k,b.hidden=!r,b.classList.toggle("is-row",!!(g&&E&&!y&&!v)),Se.hidden=r,ut.textContent=g,ut.title=g,ut.hidden=!g,pt.textContent=v,pt.hidden=!v,a.hidden=!g&&!v,m.textContent=y,m.hidden=!y,x.textContent=E,x.hidden=!E,r&&n.session?bo(n.session):r&&(nt.hidden=!0,ot.hidden=!1,ot.textContent="Sign in",De.classList.add("is-text"),De.setAttribute("aria-label",`Sign in with ${d}`)),A&&!ie&&(ie=!0,St()),N&&(y?m:E?x:m).focus()}function bo(n){let r=n&&n.name&&n.name.trim()||"";nt.hidden=!r,ot.hidden=!!r,ot.textContent=r?"":"Your name",De.classList.toggle("is-text",!r),nt.style.setProperty("--gm-author",gn(n)),nt.textContent=mn(r),De.setAttribute("aria-label",r?`Your name: ${r}`:"Your name")}function Zt(){if(!h)return;let n=h.view();Ni(n);let r=n.versions.find(g=>g.version_id===h.versionId)||null,d=r?n.versions.filter(g=>g.version_id!==h.versionId):[];if(Qn.hidden=!r||d.length===0&&n.isLatest,!r)return;kt.textContent=`Version ${r.round}${n.isLatest?" (current)":""}`,kt.disabled=d.length===0,d.length||(it=!1),kt.setAttribute("aria-expanded",it?"true":"false"),gt.hidden=!it;let i=n.versions.find(g=>g.version_id===n.latest)||null,p=!n.isLatest&&i?`${i.round}|${i.has_page}`:"";p!==xo&&(xo=p,Ut.textContent="",p&&(Ut.appendChild(s("span",{text:`A newer version exists (Version ${i.round}). `})),Ut.appendChild(i.has_page?s("a",{href:h.pageUrl(i.version_id),target:"_blank",rel:"noopener",text:`Open version ${i.round}`,"aria-label":`Open version ${i.round} in a new tab`}):s("span",{text:"Ask whoever sent you this page for the new one."}))));let w=JSON.stringify([it,n.versions,[...At],[...Lt.entries()].map(([g,v])=>[g,Array.isArray(v)?v.length:v])]);!it||w===$n||($n=w,gt.textContent="",d.forEach(g=>{let v=`Version ${g.round} \xB7 ${g.comments} comment${g.comments===1?"":"s"}`;if(g.has_page){gt.appendChild(s("a",{class:"gm-vrow",href:h.pageUrl(g.version_id),target:"_blank",rel:"noopener",text:`${v} \xB7 open`,"aria-label":`${v}, opens in a new tab`}));return}let y=At.has(g.version_id),E=s("button",{class:"gm-vrow",type:"button","aria-expanded":y?"true":"false","data-focus":`version:${g.version_id}`,text:`${v} \xB7 ${y?"hide":"read"}`});if(E.addEventListener("click",async()=>{F=`version:${g.version_id}`,At.has(g.version_id)?At.delete(g.version_id):(At.add(g.version_id),Array.isArray(Lt.get(g.version_id))||(Lt.set(g.version_id,"loading"),Zt(),Lt.set(g.version_id,await h.loadVersion(g.version_id)||"failed"),F=`version:${g.version_id}`)),Zt()}),gt.appendChild(E),y){let A=Lt.get(g.version_id),k=s("div",{class:"gm-older-list"});A==="loading"?k.appendChild(s("div",{class:"gm-older-note",text:"Loading..."})):Array.isArray(A)?A.length?A.forEach(N=>k.appendChild(Ti(N))):k.appendChild(s("div",{class:"gm-older-note",text:"No comments on that version."})):k.appendChild(s("div",{class:"gm-older-note",text:"Could not reach the comment service."})),gt.appendChild(k)}}),Qt())}function wo(){let n=h.view();return n.problem?n.problem:n.state==="locked"?"Comments on this prototype are for members only. Sign in to see the latest.":n.state==="offline"?t.storageOk()===!1?"Working locally. Comments will be shared when the service is back; keep this tab open until then.":"Working locally. Comments will be shared when the service is back.":n.state==="connecting"||n.unsent>0?"Sharing...":n.identity.read==="members"?"Shared. Signed-in members see these comments.":"Shared. Everyone with this page sees these comments."}let Ot=n=>!!(h&&!h.isMine(n.id)&&t.isSeen&&!t.isSeen(n.id));function Ri(n,r){let{comment:d,status:i}=n,p=!h||h.isMine(d.id),w=C(d),g=s("div",{class:"gm-meta"});h&&g.appendChild(s("span",{class:M(d.author),text:p?`${L(d.author)} (you)`:L(d.author)})),d.intent.tag&&g.appendChild(s("span",{class:"gm-tag",text:d.intent.tag})),ho(n).forEach(A=>g.appendChild(A)),d.status&&d.status!=="open"&&g.appendChild(s("span",{class:"gm-status",text:d.status}));let v=ci(d.time);v&&g.appendChild(s("span",{class:"gm-time",text:v}));let y=s("div",{class:"gm-card",role:"button",tabindex:"0","data-focus":`card:${d.id}`,"aria-label":`Comment ${r+1}${i==="found"?"":i==="hidden"?", on another screen":", orphaned"}${Ot(d)?", unread":""}: ${d.intent.text}`},[s("div",{class:"num",text:String(r+1)}),le(w),s("div",{class:"body"},[g,s("p",{class:"gm-text",text:d.intent.text})]),Ot(d)?s("span",{class:"dot","aria-hidden":"true"}):null]);y.classList.toggle("is-selected",G===d.id),y.classList.toggle("is-hot",Le===d.id);let E=()=>{G===d.id?Wt():hn(d.id,{scroll:!0,from:"card"})};return y.addEventListener("click",E),y.addEventListener("keydown",A=>{A.key!=="Enter"&&A.key!==" "||(A.preventDefault(),E())}),y.addEventListener("pointerenter",()=>{Le=d.id;let A=Ke.get(d.id);A&&A.classList.add("is-hot")}),y.addEventListener("pointerleave",()=>{Le===d.id&&(Le=null);let A=Ke.get(d.id);A&&A.classList.remove("is-hot")}),y}function _i(n){return JSON.stringify([Ae,h?t.reviewer():"",n.map(r=>[r.comment.id,r.status,r.via,r.comment.intent,r.comment.author,r.comment.status,r.comment.state.screen,Ot(r.comment),h&&h.isUnshared(r.comment.id),r.comment.time])])}function Mi(n){let r=B.activeElement;!F&&r&&ze.contains(r)&&r.dataset.focus&&(F=r.dataset.focus),ze.textContent="",Xt.clear();let d=n.filter(g=>Ae==="unread"?Ot(g.comment):Ae==="mine"?!h||h.isMine(g.comment.id):!0);n.length?d.length||ze.appendChild(s("div",{class:"gm-empty",text:Ae==="unread"?"Nothing unread.":"None of these are yours."})):ze.appendChild(s("div",{class:"gm-empty",text:"No comments yet. To leave one, press C or the Comment button, then click anything on the page."}));let i=new Map;d.forEach(g=>{let v=g.comment.state.screen&&g.comment.state.screen.name||"",y=g.status!=="hidden",E=`${y?"here":"there"}:${v}`;i.has(E)||i.set(E,{screen:v,here:y,entries:[]}),i.get(E).entries.push(g)});let p=[...i.values()].sort((g,v)=>Number(v.here)-Number(g.here)),w=p.length===1&&p[0].here;p.forEach(g=>{if(!w){let v=g.screen?`${g.screen}${g.here?"":" \xB7 another screen"}`:g.here?"This screen":"Elsewhere";ze.appendChild(s("div",{class:"gm-group",text:v}))}g.entries.forEach(v=>{let y=Ri(v,n.indexOf(v));Xt.set(v.comment.id,y),ze.appendChild(y)})}),Qt()}function Ii(n){let r=n.length;ke.textContent=String(r),j.textContent=String(r);let d=n.filter(p=>Ot(p.comment)).length;Te.title=`${r===1?"1 comment":`${r} comments`}${d?`, ${d} unread`:""}`,wt.hidden=!d;let i="";if(!D&&h){let p=h.view();p.problem||p.state==="offline"||p.state==="locked"?i=wo():!p.isLatest&&p.versions.some(w=>w.version_id===p.latest)&&(i="A newer version of this page exists. Open the comments to see it.")}else!D&&!h&&r&&!Bt&&t.hasUnexportedWork()&&(i=t.storageOk()===!1?"Not saved in this browser. Send to author is under the count.":"Kept in this browser. Send to author is under the count.");lt=i,eo(),$e.forEach(p=>{let w=p.dataset.filter===Ae;p.classList.toggle("is-on",w),p.setAttribute("aria-pressed",w?"true":"false")}),(!h||h.view().identity.mode==="none")&&bo({name:t.reviewer()})}function Di(n,r){let d=_i(n);r||d!==Ye||!ze.childElementCount?(Ye=d,Mi(n)):Xt.forEach((p,w)=>{p.classList.toggle("is-selected",G===w),p.classList.toggle("is-hot",Le===w)}),Li(n,r),Zt(),Ii(n);let i=t.storageOk();Xn.textContent=h?wo():i===!1?"Not saved in this browser. Send or copy before you close this tab.":i===!0?"Kept in this browser until you send it.":"",B.activeElement!==Ge&&(Ge.value=t.reviewer()),B.activeElement!==I&&(I.value=t.overallNote()),t.overallNote()&&I.hidden&&(I.hidden=!1,se.textContent="A note about the whole thing")}function X(n){let r=t.comments().map(d=>{let{element:i,status:p,via:w}=f(d.anchor,d.state&&d.state.screen);return{comment:d,element:i,status:p,via:w}});kn=r,Di(r,n),Ci(r),Oi(),Sn(),po(),Qt()}let Cn=!1;function Tt(){Cn||(Cn=!0,requestAnimationFrame(()=>{Cn=!1,X()}))}new MutationObserver(n=>{n.every(r=>r.target===K||K.contains(r.target))||(Z(),Tt())}).observe(document.body,{childList:!0,subtree:!0,attributes:!0,characterData:!0}),window.addEventListener("beforeunload",n=>{(h?h.view().unsent===0:!t.hasUnexportedWork())||(n.preventDefault(),n.returnValue="")}),window.addEventListener("scroll",Tt,!0),window.addEventListener("resize",()=>{Z(),Tt()}),window.addEventListener("scroll",()=>{Z(),Tt()},{once:!0,capture:!0}),document.addEventListener("transitionend",Z,!0),document.addEventListener("animationend",Z,!0);try{let n=window.matchMedia("(prefers-color-scheme: dark)");n&&n.addEventListener&&n.addEventListener("change",Z)}catch{}return t.subscribe(Tt),X(),{setCommentMode:Yt,isCommentMode:()=>J,openPanel:fn,closePanel:jt,openThread:hn,render:X,isBoxOpen:()=>!ae.hidden,target:()=>oe,theme:()=>Ee,shadow:B}}var jr=()=>new Date().toISOString().replace(/\.\d{3}Z$/,"Z");function Hr({anchor:e,element:t,text:o,tag:l}){return{id:zn(),time:jr(),intent:{text:String(o||"").trim(),tag:l||null},anchor:e,state:{hash:location.hash||null,title:document.title||null,screen:nn(t),trail:In(),scroll:{x:Math.round(window.scrollX),y:Math.round(window.scrollY)},viewport:{width:window.innerWidth,height:window.innerHeight},screenshot:null},status:"open"}}function pi(){Bn(Ue.versionId);let e=Vn();Pn(Gn(),e.name,e.note),Wo();let t=Xo({stamp:Ue,store:Ft}),o=t?{...Ft,add:t.add,update:t.update,remove:t.remove}:Ft,l=ui({store:o,sync:t,batch:Jn,createComment:Hr,anchorFromElement:Bo,anchorFromSelection:Po,resolve:rn,setRecording:Ho,targetFor:Uo});window.__gitmargin={format:qt,versionId:Ue.versionId,file:Ue.file,export:zt,markdown:un,reviewedHtml:pn,originalLength:tn().length,trail:()=>In(),lastCopy:null,lastCopyOk:null,ui:l,sync:t},t&&t.subscribe(()=>l.render())}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",pi,{once:!0}):pi();})();
