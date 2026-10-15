(()=>{
const B={step:1,transport:null,live:null,chat:null,lb:null,alg:null,dns:null,hc:null,region:null,api:null,pay:null,bo:null,cb:null,touchedCfg:false,
  cfg:{timeout:30000,retries:3,backoff:'fixed',jitter:false,cb:false}};
const STEPS=['Start','Driver on the map','Driver accepted','Driver app','Driver search','New pod','Brazil','Ride screen','Ride payment','Retries after a failure','When dispatch is down','Incident'];
const NAMES={tcp:'TCP',udp:'UDP',poll:'Polling',sse:'SSE',ws:'WebSockets',ssepost:'SSE + POST',pollpost:'Polling + POST',l4:'L4',l7:'L7 proxy',client:'Client-side',one:'Everything in Frankfurt',cdn:'Frankfurt + CDN',region:'Region in São Paulo',hctcp:'TCP',hchttp:'HTTP /health',hcdeep:'Deep /health',rest:'REST',bff:'Screen-specific REST',gql:'GraphQL',rr:'round robin',lc:'least conn',iph:'IP hash',ttl3600:'TTL 1 h',ttl60:'TTL 60 s',retry:'TTL 60 s + retry'};

// ---------- navigation ----------
function renderSteps(){
  $b('bSteps').innerHTML=STEPS.map((s,i)=>{
    const done=(i===1&&B.transport)||(i===2&&B.live)||(i===3&&B.chat)||(i===4&&B.lb)||(i===5&&B.alg)||(i===6&&B.region)||(i===7&&B.api)||(i===8&&B.pay)||(i===9&&B.bo)||(i===10&&B.cb)||(i===0&&B.step>0);
    return `<li><button data-i="${i}" class="${done&&i!==B.step?'done':''}" ${i===B.step?'aria-current="step"':''}><span class="n">${i}</span><span class="t">${s}</span></button></li>`;}).slice(1).join('');
}
function launchIncident(){t9.stop();t1.stop();t2.stop();t3c.stop();t5.stop();tA.stop();$b('buildApp').hidden=true;$b('incidentApp').hidden=false;window.scrollTo({top:0});window.startIncident({...B.cfg});}
function go(i){
  if(i>=STEPS.length-1){launchIncident();return;}
  B.step=Math.max(1,Math.min(STEPS.length-2,i));
  document.querySelectorAll('.b-step').forEach(s=>s.hidden=+s.dataset.step!==B.step);
  $b('bPrev').hidden=B.step===1;
  $b('bNext').hidden=false;
  $b('bNext').textContent=B.step===STEPS.length-2?'To the incident':'Next';
  if(B.step===1)t1.start(); else t1.stop();
  if(B.step===2)t2.start(); else t2.stop();
  if(B.step===3)t3c.start(); else t3c.stop();
  if(B.step===4)t5.start(); else t5.stop();
  if(B.step===5)tA.start(); else tA.stop();
  if(B.step===7&&t8.mode)t8.render();
  if(B.step===8)t9.start(); else t9.stop();
  if(B.step===9&&tB.mode)tB.draw(tB.k??1);
  if(B.step===10&&tC.mode)tC.draw(tC.k??1);
  renderSteps(); renderArch();
  window.scrollTo({top:0});
}
$b('bSteps').addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(b)go(+b.dataset.i);});
$b('bPrev').addEventListener('click',()=>go(B.step-1));
$b('bNext').addEventListener('click',()=>go(B.step+1));
$b('bTheme').addEventListener('click',()=>{const r=document.documentElement;const dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=dark?'light':'dark';renderArch();t1.draw();t2.redraw();if(tB.mode)tB.draw(tB.k??1);if(tC.mode)tC.draw(tC.k??1);});


// ---------- architecture ----------
const NODES={
  driver:{x:4,y:20,t:'driver-app',s:'driver app'},
  location:{x:452,y:20,t:'location-service'},
  gateway:{x:228,y:130,t:'realtime-gateway'},
  rider:{x:4,y:240,t:'rider-app',s:'rider app'},
  dispatch:{x:452,y:330,t:'dispatch-service'},
  ride:{x:228,y:420,t:'ride-service'},
  db:{x:452,y:420,t:'dispatch-db',s:'PostgreSQL'},
  payments:{x:452,y:510,t:'payments'}
};
const NW=164,NH=50;
function cfgShort(){const c=B.cfg;return `${c.timeout/1000}s · ${c.retries} retry${c.jitter?' · jitter':''}${c.cb?' · CB':''}`;}
function edges(){
  const chatL=B.chat?NAMES[B.chat]:'?';
  return [
    {a:'driver',b:'location',l:B.transport?NAMES[B.transport]:'?',todo:!B.transport,step:1},
    {a:'location',b:'gateway',l:'',step:-1},
    {a:'gateway',b:'rider',l:B.live?NAMES[B.live]:'?',todo:!B.live,step:2},
    {a:'gateway',b:'driver',l:chatL,todo:!B.chat,step:3},
    {a:'rider',b:'ride',l:B.api?NAMES[B.api]:'HTTPS',todo:false,step:7},
    {a:'ride',b:'dispatch',l:['HTTP',B.bo==='jit'?'backoff + jitter':B.bo==='exp'?'backoff':'',B.cb&&B.cb!=='none'?'CB':''].filter(Boolean).join(' · '),todo:false,step:B.step===10?10:9},
    {a:'dispatch',b:'location',l:B.lb?NAMES[B.lb]:'?',todo:!B.lb,step:4},
    {a:'dispatch',b:'db',l:'SQL',step:-1},
    {a:'ride',b:'payments',l:B.pay==='idem'?'POST /hold + key':'POST /hold',todo:!B.pay,step:8}
  ];
}
function clip(n,tx,ty){const cx=n.x+NW/2,cy=n.y+NH/2,dx=tx-cx,dy=ty-cy;
  const s=Math.min(Math.abs((NW/2+3)/(dx||1e-9)),Math.abs((NH/2+3)/(dy||1e-9)));return [cx+dx*s,cy+dy*s];}
const INFO={
  driver:['Driver app','The mobile app in the car. Constantly sends GPS coordinates, receives new ride requests (15 seconds to accept) and shows the route to the rider.'],
  rider:['Rider app','The rider’s mobile app. Requests a ride, shows the car on the map, the ride status and chat with the driver.'],
  location:['location-service','Knows where every driver is right now. Takes the stream of coordinates from drivers, keeps fresh positions in memory and answers “which drivers are near this point”.'],
  gateway:['realtime-gateway','Holds open connections to rider and driver phones. Pushes ride status to riders (driver accepted, on the way, arrived) and new ride requests to drivers. Has no business logic of its own, it only delivers.'],
  ride:['ride-service','The main ride service. Creates the ride request, asks dispatch to find a driver, holds the fare on the card via payments and tracks the ride from “Finding a driver” to “completed”.'],
  dispatch:['dispatch-service','Matches a driver to a ride request. Gets nearby drivers from location-service, weighs distance, rating and load, and offers the request to the best one.'],
  db:['dispatch-db','PostgreSQL for dispatch: city zones, fares, history of offers to drivers and their responses. This is where the index will vanish in the final incident.'],
  payments:['payments','Payments. Holds the fare on the rider’s card when the ride is requested and charges it after the ride ends. A retried request without an idempotency key can hold the money twice.']
};
function showInfo(k){const el=$b('bInfo');if(!k||B.info===k){B.info=null;el.hidden=true;renderArch();return;}
  B.info=k;const [t,d]=INFO[k];el.innerHTML=`<b>${t}</b><p>${d}</p>`;el.hidden=false;renderArch();}
function renderArch(){
  const svg=$b('bArch');let h=`<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
  const E=edges(), hlNodes=new Set();
  E.forEach(e=>{if(e.step===B.step){hlNodes.add(e.a);hlNodes.add(e.b);}});
  let labels='';
  for(const e of E){const A=NODES[e.a],Bn=NODES[e.b];
    const [x1,y1]=clip(A,Bn.x+NW/2,Bn.y+NH/2),[x2,y2]=clip(Bn,A.x+NW/2,A.y+NH/2);
    const cls=`ae${e.todo?' todo':''}${e.step===B.step?' hl':''}`;
    h+=`<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arr)"/>`;
    if(e.l){const mx=(x1+x2)/2,my=(y1+y2)/2+(Math.abs(y2-y1)<4?-8:5);
      labels+=`<text class="al${e.todo?' todo':''}${e.step===B.step?' hl':''}" x="${mx}" y="${my}" text-anchor="middle">${e.l}</text>`;}
  }
  NODES.ride.s=cfgShort();NODES.gateway.s=B.alg?NAMES[B.alg]:undefined;
  for(const [k,n] of Object.entries(NODES)){
    h+=`<g class="an${hlNodes.has(k)?' hl':''}${B.info===k?' sel':''}" data-node="${k}" tabindex="0" role="button" aria-label="What is ${n.t}"><rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="7"/>
      <circle class="ai" cx="${n.x+NW-1}" cy="${n.y+1}" r="8"/><text class="ait" x="${n.x+NW-1}" y="${n.y+5}" text-anchor="middle">i</text>
      <text x="${n.x+NW/2}" y="${n.y+(n.s?22:30)}" text-anchor="middle">${n.t}</text>${n.s?`<text class="sub" x="${n.x+NW/2}" y="${n.y+40}" text-anchor="middle">${n.s}</text>`:''}</g>`;
  }
  svg.innerHTML=h+labels;
  const dec=[
    ['Driver coordinates',B.transport?NAMES[B.transport]:null],
    ['Status for the rider',B.live?NAMES[B.live]:null],
    ['Driver app',B.chat?NAMES[B.chat]:null],
    ['dispatch → location',B.lb?NAMES[B.lb]:null],
    ['Brazil',B.region?NAMES[B.region]:null],
    ['Screen API',B.api?NAMES[B.api]:null],
    ['Client to dispatch',B.touchedCfg?cfgShort():null],
    ['Payments',B.touchedCfg?'idempotencyKey: '+B.cfg.idem:null]];
}

// ---------- step 1: TCP vs UDP ----------
const ROUTE=[[.08,.2],[.5,.2],[.5,.48],[.9,.48],[.9,.85],[.3,.85],[.3,.6],[.08,.6]];
const SEGS=(()=>{const s=[];let L=0;for(let i=0;i<ROUTE.length;i++){const a=ROUTE[i],b=ROUTE[(i+1)%ROUTE.length];const l=Math.hypot(b[0]-a[0],(b[1]-a[1])*0.6);s.push({a,b,l,L});L+=l;}s.total=L;return s;})();
function posAt(t){let d=((t*0.045)%1)*SEGS.total;for(const s of SEGS){if(d<=s.l){const k=d/s.l;return [s.a[0]+(s.b[0]-s.a[0])*k,s.a[1]+(s.b[1]-s.a[1])*k];}d-=s.l;}return ROUTE[0];}
const RATE=0.25, TUN=4;
const t1={proto:null,lossy:false,raf:null,last:0,
  reset(){Object.assign(this,{t:0,seq:0,nextSend:0,inflight:[],buf:new Map(),next:0,shown:null,trail:[],stale:[],lost:0,lastSeq:-1,sampleT:0,tunnel:null,recAt:null,log:[],payAt:null});this.renderLog();},
  down(t){return !!(this.tunnel&&t>=this.tunnel.a&&t<this.tunnel.b);},
  drop(t){return this.down(t)||(this.lossy&&Math.random()<0.03);},
  send(kind){const p={seq:this.seq++,sentT:this.t,pos:posAt(this.t),kind};const d=0.08+Math.random()*0.06;
    if(kind==='pay'){p.entry={sentT:this.t,status:'pending'};this.log.unshift(p.entry);}
    if(this.proto==='udp'){ if(this.drop(this.t)){ if(kind==='gps')this.lost++; else p.entry.status='lost'; this.renderLog(); return; } p.arr=this.t+d; }
    else { let tt=this.t,rto=1; while(this.drop(tt)){tt+=rto;rto=Math.min(rto*2,16);} p.arr=tt+d; }
    this.inflight.push(p); this.renderLog();},
  deliver(p){if(p.kind==='pay'){p.entry.status='ok';p.entry.after=this.t-p.entry.sentT;this.renderLog();return;}
    this.shown=p;this.trail.push(p.pos);if(this.trail.length>24)this.trail.shift();},
  startTunnel(){if(this.down(this.t))return;this.tunnel={a:this.t,b:this.t+TUN};this.recAt=null;},
  tick(dt){this.t+=dt;
    while(this.t>=this.nextSend){this.send('gps');this.nextSend+=RATE;}
    if(this.payAt!==null&&this.t>=this.payAt){this.payAt=null;this.send('pay');}
    const ready=this.inflight.filter(p=>p.arr<=this.t).sort((a,b)=>a.arr-b.arr);
    this.inflight=this.inflight.filter(p=>p.arr>this.t);
    for(const p of ready){
      if(this.proto==='udp'){ if(p.kind==='pay'){this.deliver(p);continue;} if(p.seq>this.lastSeq){this.lastSeq=p.seq;this.deliver(p);} }
      else {this.buf.set(p.seq,p);while(this.buf.has(this.next)){const q=this.buf.get(this.next);this.buf.delete(this.next);this.next++;this.deliver(q);}}
    }
    if(this.tunnel&&this.recAt===null&&this.t>=this.tunnel.b&&this.shown&&this.shown.sentT>=this.tunnel.b)this.recAt=this.t-this.tunnel.b;
    if(this.t-this.sampleT>=0.1){this.sampleT=this.t;const s=this.shown?this.t-this.shown.sentT:0;this.stale.push([this.t,s]);
      while(this.stale.length&&this.stale[0][0]<this.t-30)this.stale.shift();}
  },
  renderLog(){const el=$b('t1Log');if(!el)return;
    el.innerHTML=this.log.slice(0,4).map(e=>{const txt=e.status==='ok'?`<span class="s-ok">delivered after ${e.after.toFixed(1)} s</span>`:
      e.status==='lost'?`<span class="s-bad">lost. The ride never started in the system, so the fare isn’t counted</span>`:'<span class="s-warn">in transit…</span>';
      return `<li><span>Ride start</span>${txt}</li>`;}).join('');},
  frame(ts){if(!this.raf)return;const dt=this.last?Math.min(0.1,(ts-this.last)/1000):0;this.last=ts;
    if(this.proto)this.tick(dt);this.draw();this.raf=requestAnimationFrame(x=>this.frame(x));},
  start(){if(this.raf||!this.proto)return;this.last=0;this.raf=requestAnimationFrame(x=>this.frame(x));},
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;},
  draw(){if(!this.proto)return;const cv=$b('t1Map');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);
    const line=css('--line'),mu=css('--muted'),bl=css('--blue'),tx=css('--text'),pn=css('--panel'),rd=css('--red');
    g.clearRect(0,0,w,h);g.strokeStyle=line;g.lineWidth=1;g.globalAlpha=.6;
    for(let x=0;x<w;x+=36){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
    for(let y=0;y<h;y+=36){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
    g.globalAlpha=1;g.lineWidth=7;g.lineJoin='round';g.strokeStyle=line;g.beginPath();
    ROUTE.forEach((p,i)=>{const X=p[0]*w,Y=p[1]*h;i?g.lineTo(X,Y):g.moveTo(X,Y);});g.closePath();g.stroke();
    const P=p=>[p[0]*w,p[1]*h];
    this.trail.forEach((p,i)=>{const [x,y]=P(p);g.fillStyle=mu;g.globalAlpha=.12+.3*i/this.trail.length;g.beginPath();g.arc(x,y,3,0,7);g.fill();});
    g.globalAlpha=1;
    const [rx,ry]=P(posAt(this.t));
    if(this.shown){const [sx,sy]=P(this.shown.pos);const s=this.t-this.shown.sentT;
      if(s>0.9){g.setLineDash([4,4]);g.strokeStyle=mu;g.lineWidth=1.5;g.beginPath();g.moveTo(sx,sy);g.lineTo(rx,ry);g.stroke();g.setLineDash([]);
        g.font='600 12px '+css('--mono');g.lineWidth=4;g.strokeStyle=pn;g.fillStyle=rd;const lab='behind by '+s.toFixed(1)+' s';
        g.strokeText(lab,sx+12,sy-12);g.fillText(lab,sx+12,sy-12);}
      g.fillStyle=bl;g.beginPath();g.arc(sx,sy,8,0,7);g.fill();g.strokeStyle=pn;g.lineWidth=2;g.stroke();}
    g.strokeStyle=tx;g.lineWidth=2;g.beginPath();g.arc(rx,ry,11,0,7);g.stroke();
    if(this.down(this.t)){g.font='600 13px '+css('--sans');const lab=`Tunnel: no signal for ${(this.tunnel.b-this.t).toFixed(1)} s`;
      const tw=g.measureText(lab).width;g.fillStyle=css('--red-bg');g.fillRect(10,h-38,tw+20,28);g.fillStyle=rd;g.fillText(lab,20,h-19);}
    else if(this.tunnel&&this.recAt===null){g.font='600 13px '+css('--sans');const lab=`Signal back for ${(this.t-this.tunnel.b).toFixed(1)} s, map still stale`;
      const tw=g.measureText(lab).width;g.fillStyle=css('--amber-bg');g.fillRect(10,h-38,tw+20,28);g.fillStyle=css('--amber');g.fillText(lab,20,h-19);}
    const now=this.shown?this.t-this.shown.sentT:0;
    $b('t1Now').textContent=now.toFixed(1)+' s';$b('t1Now').className=now>1.5?'s-bad':'';
    const rec=$b('t1Rec');
    if(!this.tunnel){rec.textContent='not yet';rec.className='';}
    else if(this.down(this.t)){rec.textContent='in tunnel';rec.className='s-warn';}
    else if(this.recAt===null){rec.textContent='waiting '+(this.t-this.tunnel.b).toFixed(1)+' s';rec.className='s-warn';}
    else {rec.textContent=this.recAt.toFixed(1)+' s';rec.className=this.recAt>1?'s-bad':'s-ok';}
    $b('t1Lost').textContent=this.proto==='tcp'?'0':String(this.lost);
  }
};
optsInit('t1Opts',v=>{t1.proto=v;B.transport=v;t1.reset();$b('t1Empty').hidden=true;$b('t1Body').hidden=false;t1.start();renderArch();renderSteps();});
$b('t1Tunnel').addEventListener('click',()=>t1.startTunnel());
$b('t1TakeBtn').addEventListener('click',()=>{$b('t1Take').hidden=false;$b('t1TakeBtn').hidden=true;});

// ---------- step 2: polling / SSE / WebSockets ----------
const API_CAP=40000, GW_CAP=15000, UPD_PER_H=30, SCALE=100000;
const FLY=1.0, SLOW=0.55;
const STAT=['Finding a driver','Driver accepted','Driver on the way','Driver has arrived','On the trip'];
const t2={mode:null,interval:3,rec:'fixed',raf:null,last:0,dep:null,anim:null,
  reset(){Object.assign(this,{t:0,srv:0,cli:0,nextChange:2.5,changedAt:null,dots:[],nextPoll:0.4,req:0,empty:0,useful:0,lastDelay:null,nextHb:3});},
  tick(dt){this.t+=dt;
    if(this.t>=this.nextChange){this.srv=(this.srv+1)%STAT.length;this.changedAt=this.t;this.nextChange=this.t+6+Math.random()*2;
      if(this.mode!=='poll')this.dots.push({dir:-1,t0:this.t,kind:'upd',val:this.srv});}
    if(this.mode==='poll'&&this.t>=this.nextPoll){this.nextPoll+=this.interval;this.req++;this.dots.push({dir:1,t0:this.t,kind:'req'});}
    if(this.mode==='ws'&&this.t>=this.nextHb){this.nextHb+=4;this.dots.push({dir:1,t0:this.t,kind:'hb'});}
    const D=FLY;
    for(const d of this.dots.slice()){ if(d.done||this.t<d.t0+D)continue; d.done=true;
      if(d.kind==='req'){const fresh=this.srv!==this.cli;this.dots.push({dir:-1,t0:this.t,kind:fresh?'upd':'empty',val:this.srv});}
      else if(d.kind==='upd'){ if(this.cli!==d.val){this.cli=d.val;this.lastDelay=this.mode==='poll'?Math.max(0.1,this.t-this.changedAt-2*FLY+0.1):this.t-this.changedAt-FLY+0.05;} if(this.mode==='poll')this.useful++; }
      else if(d.kind==='empty'){this.empty++;}
      else if(d.kind==='hb'){this.dots.push({dir:-1,t0:this.t,kind:'hbr'});}
    }
    this.dots=this.dots.filter(d=>!d.done);
  },
  frame(ts){if(!this.raf)return;const dt=this.last?Math.min(0.1,(ts-this.last)/1000):0;this.last=ts;
    if(this.mode)this.tick(dt*SLOW);this.draw();this.raf=requestAnimationFrame(x=>this.frame(x));},
  start(){if(this.raf||!this.mode)return;this.last=0;this.raf=requestAnimationFrame(x=>this.frame(x));},
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;},
  box(g,x,y,w,h,title,status,stale){
    g.fillStyle=css('--panel');g.strokeStyle=stale?css('--amber'):css('--line');g.lineWidth=stale?2:1.2;
    g.beginPath();g.roundRect(x,y,w,h,10);g.fill();g.stroke();
    g.textAlign='center';g.fillStyle=css('--muted');fitFont(g,title,w-12,12,'');g.fillText(title,x+w/2,y+24);
    g.fillStyle=css('--text');fitFont(g,status,w-12,15,'600 ');g.fillText(status,x+w/2,y+h/2+6);
    if(stale){g.fillStyle=css('--amber');g.font='600 12px '+css('--sans');g.fillText('stale status',x+w/2,y+h-16);}
  },
  draw(){if(!this.mode)return;const cv=$b('t2Flow');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const bw=Math.min(170,w*0.3),bh=120,by=(h-bh)/2,x1=bw+8,x2=w-bw-8,mid=h/2;
    const mu=css('--muted'),bl=css('--blue');g._lo=x1;g._hi=x2;
    // channel
    g.textAlign='center';g.font='12px '+css('--sans');
    if(this.mode==='poll'){g.strokeStyle=css('--line');g.setLineDash([3,5]);g.lineWidth=1.5;g.beginPath();g.moveTo(x1,mid);g.lineTo(x2,mid);g.stroke();g.setLineDash([]);
      g.fillStyle=mu;fitFont(g,'a new HTTP request every time',w-8,12,'');g.fillText('a new HTTP request every time',(x1+x2)/2,by-6);}
    else {g.strokeStyle=bl;g.globalAlpha=.45;g.lineWidth=4;g.beginPath();g.moveTo(x1,mid);g.lineTo(x2,mid);g.stroke();g.globalAlpha=1;
      g.fillStyle=mu;{const c=this.mode==='sse'?'one open connection, server → phone':'one open connection, both directions';fitFont(g,c,w-8,12,'');g.fillText(c,w/2,by-6);}}
    this.box(g,0,by,bw,bh,'Rider’s phone',STAT[this.cli],this.cli!==this.srv);
    this.box(g,w-bw,by,bw,bh,'Server',STAT[this.srv],false);
    for(const d of this.dots){const k=Math.min(1,(this.t-d.t0)/FLY);const x=d.dir===1?x1+(x2-x1)*k:x2-(x2-x1)*k;
      const y=this.mode==='poll'?mid+(d.dir===1?-14:14):mid;
      if(d.kind==='upd'){g.fillStyle=bl;g.beginPath();g.arc(x,y,8,0,7);g.fill();lbl(g,'new status: '+STAT[d.val],x,y+(this.mode==='poll'?28:-16),bl,true);}
      else if(d.kind==='empty'){g.strokeStyle=mu;g.lineWidth=2;g.beginPath();g.arc(x,y,6,0,7);g.stroke();lbl(g,'response: no changes',x,y+26,mu);}
      else if(d.kind==='req'){g.fillStyle=mu;g.beginPath();g.arc(x,y,6,0,7);g.fill();lbl(g,'request: anything new?',x,y-16,mu);}
      else {g.fillStyle=mu;g.globalAlpha=.6;g.beginPath();g.arc(x,y,4,0,7);g.fill();g.globalAlpha=1;lbl(g,d.kind==='hb'?'ping':'pong',x,y+(d.kind==='hb'?-12:22),mu);}
    }
    this.stats();
  },
  stats(){let rows;const dl=this.lastDelay===null?'—':this.lastDelay.toFixed(1)+' s';
    if(this.mode==='poll')rows=[['Requests made',this.req,''],['“No changes” responses',this.empty,this.empty>this.useful?'s-warn':''],['Rider saw the change after',dl,this.lastDelay>1?'s-warn':'s-ok']];
    else rows=[['Requests made','0',''],['Open connections','1',''],['Rider saw the change after',dl,'s-ok']];
    const html=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    if(this._sh!==html){this._sh=html;$b('t2Stats').innerHTML=html;}},
  scale(){this.cmp();$b('t2IntBox').hidden=this.mode!=='poll';},
  cmp(){const T=this.interval,N=SCALE,ev=N*UPD_PER_H/3600;
    const pollRps=N/T, pollMB=pollRps*1.1/1024, sseMB=(ev*0.2+N/15*0.02)/1024, wsMB=(ev*0.15+N/30*0.012)/1024;
    const f=x=>x>=10?Math.round(x)+' MB/s':x>=1?x.toFixed(1)+' MB/s':Math.round(x*1024)+' KB/s';
    const cols=[{k:'poll',n:`Polling (every ${T} s)`},{k:'sse',n:'SSE'},{k:'ws',n:'WebSockets'}];
    const rows=[
      ['API requests per second',[[fmtN(pollRps),pollRps>API_CAP?'bad':'warn'],['0','good'],['0','good']]],
      ['Traffic',[[f(pollMB),'bad'],[f(sseMB),'good'],[f(wsMB),'good']]],
      ['Update delay',[[`up to ${T} s`,T>2?'bad':'warn'],['~50 ms','good'],['~50 ms','good']]],
      ['Open connections on the server',[['almost 0','good'],['100 000','warn'],['100 000','warn']]],
      ['Direction',[['client asks',''],['server → client',''],['both directions','']]],
      ['Pros',[['simplest; works with any cache, proxy and load balancer','good'],['plain HTTP; the browser reconnects by itself and resumes from the last event','good'],['client can send data too; binary messages','good']]],
      ['Cons',[['wasted requests and traffic; delay up to the interval','bad'],['one direction only; long connections must be kept open, and don\'t forget proxy timeouts','warn'],['separate protocol: upgrade on the load balancer, own heartbeat, reconnects and catching up on missed messages','bad']]]];
    $b('t2Cmp').innerHTML=`<thead><tr><th></th>${cols.map(c=>`<th class="${c.k===this.mode?'sel':''}">${c.n}</th>`).join('')}</tr></thead><tbody>`+
      rows.map(([name,cells])=>`<tr><th>${name}</th>${cells.map(([v,cls],i)=>`<td class="${cls?'c-'+cls:''} ${cols[i].k===this.mode?'sel':''}">${v}</td>`).join('')}</tr>`).join('')+'</tbody>';},
  scaleOld(){const el=$b('t2Scale');
    if(this.mode==='poll'){const rps=SCALE/this.interval,useful=UPD_PER_H*this.interval/3600*100;
      el.innerHTML=`<b>For 100 000 riders:</b> ${fmtN(rps)} API requests per second; the share with a new status is only ~${useful<0.1?useful.toFixed(2):useful.toFixed(1)}%.`+
        (rps>API_CAP?` <span class="s-bad">That’s more than the API can handle (40k/s).</span>`:'');}
    else el.innerHTML=`<b>For 100 000 riders:</b> 100 000 open connections that the gateway holds all the time, and only ~${Math.round(SCALE*UPD_PER_H/3600)} messages per second.`;
    $b('t2IntBox').hidden=this.mode!=='poll';},
  simDeploy(){const N=SCALE,T=90,att=new Float64Array(T+40),con=[];let conn=0,done=null;
    if(this.rec==='fixed')att[3]+=N; else for(let k=0;k<400;k++)att[1+Math.floor(Math.random()*10)]+=N/400;
    for(let t=0;t<T;t++){const A=att[t];const eff=A>GW_CAP?GW_CAP/(1+0.6*(A/GW_CAP-1)):A;conn+=eff;const fail=A-eff;
      if(fail>0.5){if(this.rec==='fixed')att[t+3]+=fail;else{const win=Math.min(30,4+t*0.6);for(let k=0;k<40;k++)att[t+1+Math.floor(Math.random()*win)]+=fail/40;}}
      con.push(Math.min(1,conn/N));if(conn>=N*0.99&&done===null)done=t;}
    return {att:Array.from(att.slice(0,T)),con,cap:GW_CAP,done};},
  deploy(){$b('t2DepBox').hidden=false;
    if(this.mode==='poll'){this.dep=null;$b('t2ChartBox').hidden=true;
      $b('t2DepText').innerHTML='<span class="s-ok"><b>Nothing happened.</b></span> Each request is independent: a few got a 503 during the restart and simply retried on the next cycle.';return;}
    $b('t2ChartBox').hidden=false;this.dep=this.simDeploy();const d=this.dep,peak=Math.max(...d.att);
    $b('t2DepText').innerHTML=d.done===null||d.done>15?
      `<span class="s-bad"><b>Riders without updates for ${d.done===null?'over 90':d.done} s.</b></span> 100 000 phones hit the gateway at once (peak ${fmtN(peak)}/s against a 15k/s limit); most get rejected and retry in waves.`:
      `<span class="s-ok"><b>Everyone back online in ${d.done} s.</b></span> Jitter spread the reconnects over time, and the gateway accepted everyone without overload.`;
    cancelAnimationFrame(this.anim);const t0=performance.now();
    const f=ts=>{const k=Math.min(1,(ts-t0)/3000);this.drawDep(k);if(k<1)this.anim=requestAnimationFrame(f);};this.anim=requestAnimationFrame(f);},
  drawDep(k){const d=this.dep;if(!d)return;this.lastK=k;const cv=$b('t2Chart');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const padL=44,padR=8,padB=20,padT=8,W=w-padL-padR,H=h-padT-padB,n=d.att.length,show=Math.max(1,Math.floor(n*k));
    let max=Math.max(d.cap*1.3,...d.att);const p=Math.pow(10,Math.floor(Math.log10(max)));max=Math.ceil(max/p)*p;
    const mu=css('--muted'),line=css('--line');g.font='11px '+css('--mono');g.fillStyle=mu;g.strokeStyle=line;g.lineWidth=1;
    for(let i=0;i<=4;i++){const y=padT+H-H*i/4;g.beginPath();g.moveTo(padL,y);g.lineTo(padL+W,y);g.stroke();g.textAlign='right';g.fillText(fmtN(max*i/4),padL-6,y+4);}
    g.textAlign='center';for(let t=0;t<n;t+=15)g.fillText(t+' s',padL+W*(t+.5)/n,h-5);
    const bw=W/n;g.fillStyle=css('--blue');
    for(let t=0;t<show;t++){const bh=H*Math.min(1,d.att[t]/max);g.fillRect(padL+t*bw+.5,padT+H-bh,Math.max(1,bw-1),bh);}
    const cy=padT+H-H*d.cap/max;g.strokeStyle=css('--green');g.setLineDash([6,4]);g.lineWidth=1.5;g.beginPath();g.moveTo(padL,cy);g.lineTo(padL+W,cy);g.stroke();g.setLineDash([]);},
  redraw(){this.draw();if(this.dep)this.drawDep(this.lastK??1);}
};
optsInit('t2Opts',v=>{t2.mode=v;B.live=v;t2.reset();t2._sh=null;$b('t2Empty').hidden=true;$b('t2Body').hidden=false;t2.dep=null;t2.scale();t2.start();renderArch();renderSteps();});
segInit('t2Int',v=>{t2.interval=+v;t2.nextPoll=t2.t+0.2;t2.scale();});
$b('t2TakeBtn').addEventListener('click',()=>{$b('t2Take').hidden=false;$b('t2TakeBtn').hidden=true;});

// ---------- step 3: driver app, polling / SSE + POST / WebSocket ----------
const DRV=30000, LOC_EVERY=4, POLL_EVERY=5;
const t3c={mode:null,raf:null,last:0,
  reset(){Object.assign(this,{t:0,dots:[],nextLoc:0.3,nextPoll:0.9,nextOffer:2.2,nextHb:1.5,req:0,frames:0,offerAt:null,offerWait:null,offerState:'—',lastOfferDelay:null,_sh:null});},
  push(dir,kind,label){this.dots.push({dir,kind,label,t0:this.t});
    if(dir===1&&this.mode!=='ws'&&(kind==='loc'||kind==='poll'))this.req++;
    if(this.mode==='ws')this.frames++;},
  tick(dt){this.t+=dt;
    if(this.t>=this.nextLoc){this.nextLoc+=1.6;this.push(1,'loc','position');}
    if(this.mode==='pollpost'&&this.t>=this.nextPoll){this.nextPoll+=2.2;this.push(1,'poll','any requests?');}
    if(this.mode==='ws'&&this.t>=this.nextHb){this.nextHb+=3;this.push(-1,'hb','');}
    if(this.t>=this.nextOffer){this.nextOffer+=7.5;this.offerAt=this.t;this.offerState='waiting on server';
      if(this.mode!=='pollpost')this.push(-1,'offer','New ride request');}
    const D=FLY;
    for(const d of this.dots){if(d.done||this.t<d.t0+D)continue;d.done=true;
      if(d.kind==='poll'){if(this.offerAt!==null&&this.offerState==='waiting on server'){this.push(-1,'offer','New ride request');}else this.push(-1,'empty','none');}
      else if(d.kind==='offer'){this.lastOfferDelay=this.mode==='pollpost'?Math.max(0.1,this.t-this.offerAt-2*FLY+0.1):this.t-this.offerAt-FLY+0.05;this.offerState='at driver';this.offerShownAt=this.t;}}
    this.dots=this.dots.filter(d=>!d.done);},
  frame(ts){if(!this.raf)return;const dt=this.last?Math.min(0.1,(ts-this.last)/1000):0;this.last=ts;
    if(this.mode)this.tick(dt*SLOW);this.draw();this.raf=requestAnimationFrame(x=>this.frame(x));},
  start(){if(this.raf||!this.mode)return;this.last=0;this.raf=requestAnimationFrame(x=>this.frame(x));},
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;},
  draw(){if(!this.mode)return;const cv=$b('t3Flow');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const bw=Math.min(170,w*0.3),bh=120,by=(h-bh)/2+12,x1=bw+8,x2=w-bw-8,mid=by+bh/2+8,top=by+18;
    const mu=css('--muted'),bl=css('--blue'),am=css('--amber');g._lo=x1;g._hi=x2;
    g.textAlign='center';g.font='12px '+css('--sans');g.fillStyle=mu;
    if(this.mode==='ws'){g.strokeStyle=bl;g.globalAlpha=.45;g.lineWidth=4;g.beginPath();g.moveTo(x1,mid);g.lineTo(x2,mid);g.stroke();g.globalAlpha=1;
      fitFont(g,'WebSocket: everything in one connection, both directions',w-8,12,'');g.fillText('WebSocket: everything in one connection, both directions',w/2,by+bh+20);}
    else{ if(this.mode==='ssepost'){g.strokeStyle=bl;g.globalAlpha=.45;g.lineWidth=4;g.beginPath();g.moveTo(x1,mid);g.lineTo(x2,mid);g.stroke();g.globalAlpha=1;
        g.fillText('SSE: server → driver',w/2,by+bh+20);}
      g.strokeStyle=css('--line');g.setLineDash([3,5]);g.lineWidth=1.5;g.beginPath();g.moveTo(x1,top);g.lineTo(x2,top);g.stroke();g.setLineDash([]);
      fitFont(g,'a separate HTTP request for each event',w-8,12,'');g.fillStyle=mu;g.fillText('a separate HTTP request for each event',w/2,by-10);}
    const fresh=this.offerShownAt&&this.t-this.offerShownAt<2;
    t2.box.call(this,g,0,by,bw,bh,'Driver app',fresh?'New ride request!':'Online',false);
    t2.box.call(this,g,w-bw,by,bw,bh,'Server',this.offerState==='waiting on server'?'Request waiting':'Nothing new',false);
    if(fresh){g.strokeStyle=bl;g.lineWidth=2;g.beginPath();g.roundRect(0,by,bw,bh,10);g.stroke();}
    for(const d of this.dots){const k=Math.min(1,(this.t-d.t0)/FLY);const x=d.dir===1?x1+(x2-x1)*k:x2-(x2-x1)*k;
      const viaReq=this.mode!=='ws'&&(d.kind==='loc'||d.kind==='poll'||(this.mode==='pollpost'&&(d.kind==='offer'||d.kind==='empty')));
      const y=viaReq?top+(d.dir===1?0:16):mid+(this.mode==='ws'?(d.dir===1?-7:7):0);
      const col=d.kind==='offer'?bl:d.kind==='loc'?css('--green'):mu;
      if(viaReq&&d.dir===1){const lab=d.kind==='loc'?'POST location':'GET /offers';g.font='600 11px '+css('--mono');
        const tw=g.measureText(lab).width+14;g.fillStyle=css('--panel');g.strokeStyle=col;g.lineWidth=1.5;g.beginPath();g.roundRect(x-tw/2,y-11,tw,22,5);g.fill();g.stroke();g.fillStyle=col;g.fillText(lab,x,y+4);}
      else{g.fillStyle=col;g.beginPath();g.arc(x,y,d.kind==='offer'?8:d.kind==='hb'?4:5,0,7);g.fill();
        const below=d.dir===-1;const t=d.kind==='offer'?'new ride request, 15 s to accept':d.kind==='empty'?'response: no requests':d.kind==='loc'?'driver position':'ping';
        lbl(g,t,x,y+(below?24:-14),col,d.kind==='offer');}}
    this.stats();},
  stats(){const dl=this.lastOfferDelay===null?'—':this.lastOfferDelay.toFixed(1)+' s';
    const rows=[['HTTP requests from driver',this.mode==='ws'?'0':this.req,this.mode==='ws'?'s-ok':'s-warn'],
      [this.mode==='ws'?'Frames in the socket':'Connections held by server',this.mode==='ws'?this.frames:(this.mode==='ssepost'?'1':'0'),''],
      ['Request reached driver after',dl,this.lastOfferDelay>1?'s-bad':'s-ok']];
    const html=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    if(this._sh!==html){this._sh=html;$b('t3Stats').innerHTML=html;}},
  cmp(){const locRps=DRV/LOC_EVERY,pollRps=DRV/POLL_EVERY;
    const cols=[{k:'pollpost',n:'Polling + POST'},{k:'ssepost',n:'SSE + POST'},{k:'ws',n:'WebSocket'}];
    const rows=[
      ['HTTP requests per second',[[fmtN(locRps+pollRps),'bad'],[fmtN(locRps),'warn'],['0','good']]],
      ['Request reaches the driver',[[`up to ${POLL_EVERY} s of the 15 to accept`,'bad'],['instantly','good'],['instantly','good']]],
      ['Server notices the driver is gone',[['when requests stop coming','warn'],['when POSTs stop coming','warn'],['after a few seconds without heartbeat','good']]],
      ['Open connections',[['almost 0','good'],['30 000','warn'],['30 000','warn']]],
      ['Pros',[['simplest, plain HTTP','good'],['requests arrive instantly; plain HTTP','good'],['both streams in one connection; instant acks','good']]],
      ['Cons',[['most requests; offers expire','bad'],['thousands of position requests; two separate channels','warn'],['separate protocol: load balancer, heartbeat, reconnects','warn']]]];
    $b('t3Cmp').innerHTML=`<thead><tr><th></th>${cols.map(c=>`<th class="${c.k===this.mode?'sel':''}">${c.n}</th>`).join('')}</tr></thead><tbody>`+
      rows.map(([name,cells])=>`<tr><th>${name}</th>${cells.map(([v,cls],i)=>`<td class="${cls?'c-'+cls:''} ${cols[i].k===this.mode?'sel':''}">${v}</td>`).join('')}</tr>`).join('')+'</tbody>';}
};
optsInit('t3Opts',v=>{t3c.mode=v;B.chat=v;t3c.reset();$b('t3Empty').hidden=true;$b('t3Body').hidden=false;t3c.cmp();t3c.start();renderArch();renderSteps();});
$b('t3TakeBtn').addEventListener('click',()=>{$b('t3Take').hidden=false;$b('t3TakeBtn').hidden=true;});

// ---------- step 4: load balancing gRPC ----------
const LB_CONN=[0,0,2], LB_LOAD=0.8;
const t5={mode:null,scaled:false,raf:null,last:0,
  cmp(){const cols=[{k:'l4',n:'L4'},{k:'l7',n:'L7 proxy'},{k:'client',n:'Client-side'}];
    const rows=[
      ['What it balances',[['connections',''],['each request',''],['each request','']]],
      ['Load for gRPC',[['uneven: one pod is on fire, others sit idle','bad'],['even','good'],['even','good']]],
      ['New pods after scaling',[['get no traffic until connections reopen','bad'],['in use right away','good'],['after the pod list refreshes, within seconds','warn']]],
      ['Extra hop',[['no','good'],['yes, plus one more component to keep alive','warn'],['no','good']]],
      ['Where the logic lives',[['in the load balancer','good'],['in the proxy','good'],['in every client (built into gRPC)','warn']]],
      ['When to use',[['long-lived connections where the connection is the session: WebSocket, phones',''],['HTTP and gRPC, external traffic, when you don’t control the clients',''],['internal services you control','']]]];
    $b('t5Cmp').innerHTML=`<thead><tr><th></th>${cols.map(c=>`<th class="${c.k===this.mode?'sel':''}">${c.n}</th>`).join('')}</tr></thead><tbody>`+
      rows.map(([name,cells])=>`<tr><th>${name}</th>${cells.map(([v,cls],i)=>`<td class="${cls?'c-'+cls:''} ${cols[i].k===this.mode?'sel':''}">${v}</td>`).join('')}</tr>`).join('')+'</tbody>';},
  reset(){Object.assign(this,{t:0,n:this.scaled?8:4,known:this.scaled?8:4,scaleAt:null,dots:[],nextEmit:[0,0.05,0.1],rr:[0,1,2],prr:0});this._sh=null;},
  loads(){const L=new Array(this.n).fill(0);
    if(this.mode==='l4')LB_CONN.forEach(c=>L[c]+=LB_LOAD);
    else {const k=this.mode==='client'?this.known:this.n;for(let i=0;i<k;i++)L[i]=3*LB_LOAD/k;}
    return L;},
  tick(dt){this.t+=dt;
    if(this.mode==='client'&&this.scaleAt!==null&&this.known<this.n&&this.t-this.scaleAt>=5)this.known=this.n;
    for(let i=0;i<3;i++){if(this.t>=this.nextEmit[i]){this.nextEmit[i]+=0.32;
      let pod;if(this.mode==='l4')pod=LB_CONN[i];
      else if(this.mode==='l7'){pod=this.prr%this.n;this.prr++;}
      else {pod=this.rr[i]%this.known;this.rr[i]++;}
      this.dots.push({from:i,pod,t0:this.t});}}
    this.dots=this.dots.filter(d=>this.t-d.t0<0.9);
  },
  frame(ts){if(!this.raf)return;const dt=this.last?Math.min(0.1,(ts-this.last)/1000):0;this.last=ts;
    if(this.mode)this.tick(dt);this.draw();this.raf=requestAnimationFrame(x=>this.frame(x));},
  start(){if(this.raf||!this.mode)return;this.last=0;this.raf=requestAnimationFrame(x=>this.frame(x));},
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;},
  draw(){if(!this.mode)return;const cv=$b('t5Flow');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const mu=css('--muted'),bl=css('--blue'),line=css('--line'),pn=css('--panel'),tx=css('--text');
    const lw=Math.min(120,w*0.24),rw=Math.min(170,w*0.32),pad=12;
    const lh=40,lgap=(h-3*lh)/4,L=[0,1,2].map(i=>({x:0,y:lgap+i*(lh+lgap),w:lw,h:lh}));
    const rh=Math.min(40,(h-pad*2-(this.n-1)*6)/this.n),rtot=this.n*rh+(this.n-1)*6,ry0=(h-rtot)/2;
    const R=[...Array(this.n)].map((_,i)=>({x:w-rw,y:ry0+i*(rh+6),w:rw,h:rh}));
    const P={x:w/2-34,y:h/2-20,w:68,h:40};
    const loads=this.loads();
    const cR=b=>[b.x,b.y+b.h/2],cL=b=>[b.x+b.w,b.y+b.h/2];
    // connections
    g.strokeStyle=line;g.lineWidth=1.5;
    const seg=(a,b)=>{g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();};
    if(this.mode==='l4')LB_CONN.forEach((c,i)=>{g.strokeStyle=bl;g.globalAlpha=.5;g.lineWidth=3;seg(cL(L[i]),cR(R[c]));g.globalAlpha=1;});
    else if(this.mode==='l7'){L.forEach(b=>seg(cL(b),[P.x,P.y+P.h/2]));R.forEach(b=>seg([P.x+P.w,P.y+P.h/2],cR(b)));}
    else L.forEach(b=>R.slice(0,this.known).forEach(r=>seg(cL(b),cR(r))));
    // boxes
    const box=(b,label,fill,stroke)=>{g.fillStyle=fill||pn;g.strokeStyle=stroke||line;g.lineWidth=1.2;g.beginPath();g.roundRect(b.x,b.y,b.w,b.h,7);g.fill();g.stroke();
      g.fillStyle=tx;g.textAlign='center';fitFont(g,label,b.w-8,12,'500 ');g.fillText(label,b.x+b.w/2,b.y+b.h/2+4);};
    L.forEach((b,i)=>box(b,'dispatch-'+(i+1)));
    if(this.mode==='l7')box(P,'Envoy',css('--blue-bg'),bl);
    R.forEach((b,i)=>{const u=loads[i],col=u>=1?css('--red'):u>=0.7?css('--amber'):css('--green');
      g.fillStyle=pn;g.strokeStyle=u>=1?css('--red'):line;g.lineWidth=u>=1?2:1.2;g.beginPath();g.roundRect(b.x,b.y,b.w,b.h,7);g.fill();g.stroke();
      g.fillStyle=u>0?col:css('--panel-2');g.globalAlpha=.28;g.fillRect(b.x+1,b.y+1,(b.w-2)*Math.min(1,u),b.h-2);g.globalAlpha=1;
      g.textAlign='left';g.fillStyle=tx;fitFont(g,'location-'+(i+1),b.w*0.62,12,'500 ');g.fillText('location-'+(i+1),b.x+8,b.y+b.h/2+4);
      g.textAlign='right';g.fillStyle=u===0?mu:col;g.font='600 12px '+css('--mono');g.fillText(u===0?'0%':Math.round(u*100)+'%',b.x+b.w-8,b.y+b.h/2+4);});
    // dots
    g.fillStyle=bl;
    for(const d of this.dots){const k=(this.t-d.t0)/0.9;const a=cL(L[d.from]),b=cR(R[d.pod]);let x,y;
      if(this.mode==='l7'){const m=[P.x+P.w/2,P.y+P.h/2];if(k<.5){x=a[0]+(m[0]-a[0])*k*2;y=a[1]+(m[1]-a[1])*k*2;}else{x=m[0]+(b[0]-m[0])*(k-.5)*2;y=m[1]+(b[1]-m[1])*(k-.5)*2;}}
      else{x=a[0]+(b[0]-a[0])*k;y=a[1]+(b[1]-a[1])*k;}
      g.beginPath();g.arc(x,y,4,0,7);g.fill();}
    this.stats(loads);},
  stats(loads){const max=Math.max(...loads),idle=loads.filter(u=>u===0).length;
    const p99=max>=1?'> 2 s':Math.round(20/(1-max))+' ms';
    const rows=[['Hottest pod',max>=1?`${Math.round(max*100)}%, overloaded`:Math.round(max*100)+'%',max>=1?'s-bad':max>=.7?'s-warn':'s-ok'],
      ['Idle pods',`${idle} of ${this.n}`,idle?'s-warn':'s-ok'],['p99 driver search',p99,max>=1?'s-bad':max>=.7?'s-warn':'s-ok']];
    const html=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    if(this._sh!==html){this._sh=html;$b('t5Stats').innerHTML=html;}
}
};
optsInit('t5Opts',v=>{t5.mode=v;B.lb=v;t5.reset();t5.cmp();$b('t5Empty').hidden=true;$b('t5Body').hidden=false;t5.start();renderArch();renderSteps();});
$b('t5TakeBtn').addEventListener('click',()=>{$b('t5Take').hidden=false;$b('t5TakeBtn').hidden=true;});

// ---------- step 5: regions ----------
const RTT_FAR=190,RTT_NEAR=15,DNS_MS=20;
const SEGC={dns:'var(--muted)',tcp:'var(--amber)',tls:'var(--red)',data:'var(--blue)',work:'var(--green)'};
const SEGN={dns:'DNS',tcp:'TCP',tls:'TLS',data:'data',work:'processing'};
const t6={mode:null,twist:false,
  rows(){const m=this.mode,api=m==='region'?RTT_NEAR:RTT_FAR,stat=m==='one'?RTT_FAR:RTT_NEAR;
    return [{name:'Open the app: map and fares',segs:[['dns',DNS_MS],['tcp',stat],['tls',stat],['data',2*stat]]},
      {name:'Tap “Request ride”',segs:[['data',api],['work',50]]}];},
  render(){const rows=this.rows(),max=900;
    $b('t6Bars').innerHTML=rows.map(r=>{const tot=r.segs.reduce((a,s)=>a+s[1],0);
      return `<div class="b-bar"><div class="b-bar-h"><span>${r.name}</span><b class="${tot>300?'s-bad':tot>150?'s-warn':'s-ok'}">${tot} ms</b></div>
      <div class="b-bar-t">${r.segs.map(([k,v])=>`<i style="width:${v/max*100}%;background:${SEGC[k]}" title="${SEGN[k]} ${v} ms">${v/max>0.07?v:''}</i>`).join('')}</div></div>`;}).join('');
    $b('t6Legend').innerHTML=Object.keys(SEGN).map(k=>`<span><i style="background:${SEGC[k]}"></i>${SEGN[k]}</span>`).join('')+'<span>each TCP, TLS and data request is one round trip</span>';
}
};
optsInit('t6Opts',v=>{t6.mode=v;B.region=v;if(t8.mode)t8.render();$b('t6Empty').hidden=true;$b('t6Body').hidden=false;t6.render();renderArch();renderSteps();});
$b('t6TakeBtn').addEventListener('click',()=>{$b('t6Take').hidden=false;$b('t6TakeBtn').hidden=true;});

// ---------- step 5: balancing algorithms ----------
const ALG_CAP=40000, ALG_CHURN=0.02, ALG_HOT=1;
const tA={mode:null,cgnat:true,raf:null,last:0,
  reset(){this.min=0;this.c=[25000,25000,25000,25000,0];this.w=[0.21,0.19,0.2,0.22,0.18];this.rr=0;this.acc=0;this._sh=null;},
  step(){const c=this.c,N=c.length;let arr=0;const before=c.slice();this.lv=[];
    for(let i=0;i<N;i++){const leave=c[i]*ALG_CHURN;c[i]-=leave;arr+=leave;this.lv.push(leave);}
    this.arrTot=arr;const afterLeave=c.slice();this._fin=()=>{this.ar=c.map((v,i)=>v-afterLeave[i]);};
    let normal=arr;
    if(this.mode==='iph'&&this.cgnat){c[ALG_HOT]+=arr*0.4;normal=arr*0.6;}
    if(this.mode==='rr'){for(let i=0;i<N;i++)c[i]+=normal/N;}
    else if(this.mode==='iph'){for(let i=0;i<N;i++)c[i]+=normal*this.w[i];}
    else {let left=normal;const chunk=normal/200;while(left>0){let k=0;for(let i=1;i<N;i++)if(c[i]<c[k])k=i;const a=Math.min(chunk,left);c[k]+=a;left-=a;}}
    this._fin();
    this.min++;},
  frame(ts){if(!this.raf)return;const dt=this.last?Math.min(0.1,(ts-this.last)/1000):0;this.last=ts;
    if(this.mode&&this.min<180){this.acc+=dt*4;while(this.acc>=1&&this.min<180){this.acc-=1;this.step();}}
    this.draw();this.raf=requestAnimationFrame(x=>this.frame(x));},
  start(){if(this.raf||!this.mode)return;this.last=0;this.raf=requestAnimationFrame(x=>this.frame(x));},
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;},
  draw(){if(!this.mode)return;const c=this.c,max=Math.max(...c),mn=Math.min(...c);
    const h=Math.floor(this.min/60),m=this.min%60;$b('tAClock').textContent=`Elapsed: ${h?h+' h ':''}${m} min since the pod was added`;
    const html=c.map((v,i)=>{const pct=v/ALG_CAP,cls=v>ALG_CAP?'bad':v>ALG_CAP*0.85?'warn':'';
      const lv=this.lv?Math.round(this.lv[i]):0,ar=this.ar?Math.round(this.ar[i]):0,net=ar-lv;
      const flow=this.lv?`<small class="b-pod-f"><span class="s-bad">−${lv} left</span> · <span class="s-ok">+${ar} new</span> · <b class="${net>=0?'s-ok':'s-bad'}">${net>=0?'+':'−'}${Math.abs(net)} per minute</b></small>`:'';
      return `<div class="b-pod ${cls}"><span>gateway-${i+1}${i===4?' (new)':''}</span><div class="b-pod-t"><i style="width:${Math.min(100,pct*100)}%"></i><em style="left:100%"></em></div><b>${(v/1000).toFixed(1)}k</b>${flow}</div>`;}).join('');
    $b('tAFlow').innerHTML=this.lv?`In the last minute riders closed <b>${Math.round(this.arrTot).toLocaleString('uk')}</b> connections and opened the same number of new ones. Here’s how the load balancer spread them:`:'';
    $b('tAPods').innerHTML=html;
    const rows=[['Busiest pod',(max/1000).toFixed(1)+'k'+(max>ALG_CAP?', overloaded':''),max>ALG_CAP?'s-bad':max>ALG_CAP*0.85?'s-warn':'s-ok'],
      ['New pod',(c[4]/1000).toFixed(1)+'k',c[4]<15000?'s-warn':'s-ok'],['Pod imbalance',((max-mn)/1000).toFixed(1)+'k',max-mn>8000?'s-warn':'s-ok']];
    const sh=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    if(this._sh!==sh){this._sh=sh;$b('tAStats').innerHTML=sh;}
    let n='';
    if(this.mode==='rr')n=this.min<60?'The new pod gets only a fifth of new connections, and old connections stay where they are. See how long it takes to catch up.':'Even after an hour the new pod is noticeably underloaded.';
    else if(this.mode==='lc')n='All new connections go to the least busy pod, so the new pod catches up within a few minutes.';
    else n='<span class="s-bad"><b>One pod is drowning.</b></span> Thousands of a carrier’s phones share a few IP addresses, and hash sends them all to gateway-2.';
    if($b('tANote').innerHTML!==n)$b('tANote').innerHTML=n;}
};
optsInit('tAOpts',v=>{tA.mode=v;B.alg=v;tA.reset();cmpTable('tACmp',v,[{k:'rr',n:'Round robin'},{k:'lc',n:'Least connections'},{k:'iph',n:'IP hash'}],[
  ['What it considers',[['only the rotation, not the load',''],['how many connections each pod holds right now',''],['client IP address','']]],
  ['New pod',[['underloaded for hours','bad'],['evens out within minutes','good'],['gets only its share of new clients','warn']]],
  ['Clients behind CGNAT',[['doesn’t notice','good'],['doesn’t notice','good'],['all on one pod','bad']]],
  ['Sticky sessions',[['no',''],['no',''],['yes, without a cookie','good']]],
  ['When to use',[['short, uniform requests (plain HTTP)',''],['long-lived connections: SSE, WebSocket, databases',''],['when a client must return to the same pod and clients aren’t behind NAT','']]]]);$b('tAEmpty').hidden=true;$b('tABody').hidden=false;tA.start();renderArch();renderSteps();});
$b('tATakeBtn').addEventListener('click',()=>{$b('tATake').hidden=false;$b('tATakeBtn').hidden=true;});

// ---------- step 8: payments, retries and idempotency ----------
const t9={mode:null,raf:null,last:0,
  reset(){Object.assign(this,{t:0,held:0,dots:[],ev:0,cli:'Waiting for payment',srvNote:'',reqs:0,lostMark:null,passenger:'—',_sh:null});},
  ev2(){},
  tick(dt){this.t+=dt;const T=this.t,m=this.mode;
    const at=(x,fn)=>{if(this.ev===x&&T>=this.evT[x]){this.ev++;fn();}};
    if(!this.evT)this.evT=[0.3,1.3,1.8,3.0,3.2,4.2,5.2,8.5];
    at(0,()=>{this.reqs++;this.dots.push({dir:1,t0:T,lab:m==='idem'?'POST /hold 250 UAH · key ride-42':'POST /hold 250 UAH',col:'--blue'});this.cli='Waiting for response…';});
    at(1,()=>{this.held+=250;this.srvNote='250 UAH held';this.dots.push({dir:-1,t0:T,lab:'200 OK',col:'--green',lost:true});});
    at(2,()=>{this.lostMark=T;});
    at(3,()=>{this.cli=m==='noretry'?'Payment failed':'Timeout, retrying…';if(m==='noretry')this.passenger='an error, even though the money is held';});
    at(4,()=>{if(m==='noretry')return;this.reqs++;this.dots.push({dir:1,t0:T,lab:m==='idem'?'retry · key ride-42':'retry POST /hold 250 UAH',col:'--blue'});});
    at(5,()=>{if(m==='noretry')return;if(m==='retry'){this.held+=250;this.srvNote='another 250 UAH held';}else this.srvNote='key already seen, returning the saved result';
      this.dots.push({dir:-1,t0:T,lab:'200 OK',col:'--green'});});
    at(6,()=>{if(m==='noretry')return;this.cli='Payment held';this.passenger='success';});
    at(7,()=>{this.reset();});
    this.dots=this.dots.filter(d=>T-d.t0<FLY||(d.lost&&T-d.t0<FLY*0.5+0.9));},
  frame(ts){if(!this.raf)return;const dt=this.last?Math.min(0.1,(ts-this.last)/1000):0;this.last=ts;
    if(this.mode)this.tick(dt*SLOW);this.draw();this.raf=requestAnimationFrame(x=>this.frame(x));},
  start(){if(this.raf||!this.mode)return;this.last=0;this.raf=requestAnimationFrame(x=>this.frame(x));},
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;},
  draw(){if(!this.mode)return;const cv=$b('t9Flow');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const bw=Math.min(170,w*0.3),bh=120,by=(h-bh)/2,x1=bw+8,x2=w-bw-8,mid=by+bh/2;g._lo=x1;g._hi=x2;
    g.strokeStyle=css('--line');g.lineWidth=1.5;g.setLineDash([3,5]);g.beginPath();g.moveTo(x1,mid);g.lineTo(x2,mid);g.stroke();g.setLineDash([]);
    t2.box.call(this,g,0,by,bw,bh,'ride-service',this.cli,false);
    t2.box.call(this,g,w-bw,by,bw,bh,'payments',this.held?`Held ${this.held} UAH`:'Nothing held',false);
    if(this.held>250){g.strokeStyle=css('--red');g.lineWidth=2;g.beginPath();g.roundRect(w-bw,by,bw,bh,10);g.stroke();}
    if(this.srvNote)lbl(g,this.srvNote,w-bw/2,by+bh+20,this.held>250?css('--red'):css('--muted'),this.held>250);
    for(const d of this.dots){let k=(this.t-d.t0)/FLY;
      if(d.lost&&k>=0.5){const x=x2-(x2-x1)*0.5;g.strokeStyle=css('--red');g.lineWidth=3;g.beginPath();g.moveTo(x-7,mid-7);g.lineTo(x+7,mid+7);g.moveTo(x+7,mid-7);g.lineTo(x-7,mid+7);g.stroke();
        lbl(g,'response lost',x,mid+26,css('--red'),true);continue;}
      k=Math.min(1,k);const x=d.dir===1?x1+(x2-x1)*k:x2-(x2-x1)*k;const col=css(d.col);
      g.fillStyle=col;g.beginPath();g.arc(x,mid,7,0,7);g.fill();lbl(g,d.lab,x,mid+(d.dir===1?-14:24),col,true);}
    this.stats();},
  stats(){const rows=[['Held on card',this.held+' UAH',this.held>250?'s-bad':this.held?'s-ok':''],['Rider sees',this.passenger,this.passenger==='success'?'s-ok':this.passenger==='—'?'':'s-bad'],['Requests to payments',this.reqs,'']];
    const html=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    if(this._sh!==html){this._sh=html;$b('t9Stats').innerHTML=html;}}
};
optsInit('t9Opts',v=>{t9.mode=v;B.pay=v;t9.reset();t9.evT=null;$b('t9Empty').hidden=true;$b('t9Body').hidden=false;t9.start();renderArch();renderSteps();
  cmpTable('t9Cmp',v,[{k:'noretry',n:'Don’t retry'},{k:'retry',n:'Retry the request'},{k:'idem',n:'Retry with a key'}],[
  ['If the response is lost',[['rider sees an error','bad'],['money is held twice','bad'],['retry returns the first attempt’s result','good']]],
  ['Rider’s money',[['250 UAH held, but the request “failed”','warn'],['500 UAH held','bad'],['250 UAH held','good']]],
  ['What the rider sees',[['an error and requests again manually','bad'],['success','good'],['success','good']]],
  ['What the server needs',[['nothing','good'],['nothing','good'],['store the key and the first attempt’s result','warn']]],
  ['When it fits',[['when a human can retry',''],['reads (GET) and operations that give the same result on retry',''],['any state-changing operations (POST)','']]]]);});
$b('t9TakeBtn').addEventListener('click',()=>{$b('t9Take').hidden=false;$b('t9TakeBtn').hidden=true;});

// ---------- step 9: backoff and jitter ----------
const tB={mode:null,anim:null,
  sim(mode){let seed=7;const R=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
    const B=0.5,T=40,nb=T/B,N=3000,C=1000*B,q=[...Array(nb+400)].map(()=>[]);let tot=0,served=0,done=null;const series=[];
    const sched=(t,cnt,n)=>{let d=mode==='fixed'?1:mode==='exp'?Math.min(8,Math.pow(2,n-1)):R()*Math.min(8,Math.pow(2,n));
      const b=Math.max(Math.round(t/B)+1,Math.round((t+d)/B));if(b<q.length)q[b].push([cnt,n]);};
    if(mode==='jit'){for(let k=0;k<100;k++)sched(0,N/100,1);}else sched(0,N,1);
    for(let b=0;b<nb;b++){const A=q[b].reduce((s,x)=>s+x[0],0);tot+=A;const eff=A>C?C/(1+0.6*(A/C-1)):A;served+=eff;const r=A?eff/A:1;
      for(const [cnt,n] of q[b]){const fail=cnt*(1-r);if(fail>0.01){if(mode==='jit'){const parts=Math.min(20,Math.ceil(fail/10));for(let i=0;i<parts;i++)sched(b*B,fail/parts,n+1);}else sched(b*B,fail,n+1);}}
      series.push(A);if(served>=N*0.99&&done===null)done=(b+1)*B;}
    const per=[];for(let i=0;i<series.length;i+=Math.round(1/B))per.push(series.slice(i,i+Math.round(1/B)).reduce((a,x)=>a+x,0));
    return {series:per,tot,served,done,B,T,N};},
  render(){const d=this.sim(this.mode);this.d=d;
    const rows=[['Peak requests per second',fmtN(Math.max(...d.series)),Math.max(...d.series)>1000?'s-bad':'s-ok'],
      ['All requests served after',d.done===null?`over ${d.T} s (${Math.round(d.served/d.N*100)}% in ${d.T} s)`:d.done+' s',d.done===null||d.done>12?'s-bad':'s-ok'],
      ['Requests to dispatch',fmtN(d.tot)+` for ${fmtN(d.N)} requests`,d.tot>2*d.N?'s-bad':'s-warn']];
    $b('tBStats').innerHTML=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    cancelAnimationFrame(this.anim);const t0=performance.now();
    const f=ts=>{const k=Math.min(1,(ts-t0)/3000);this.draw(k);if(k<1)this.anim=requestAnimationFrame(f);};this.anim=requestAnimationFrame(f);},
  draw(k){const d=this.d;if(!d)return;this.k=k;const cv=$b('tBChart');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const padL=44,padR=20,padB=36,padT=8,W=w-padL-padR,H=h-padT-padB,n=d.series.length,show=Math.max(1,Math.floor(n*k)),max=3200;
    const mu=css('--muted'),line=css('--line');g.font='11px '+css('--mono');g.fillStyle=mu;g.strokeStyle=line;g.lineWidth=1;
    for(let i=0;i<=4;i++){const v=i*800,y=padT+H-H*v/max;g.beginPath();g.moveTo(padL,y);g.lineTo(padL+W,y);g.stroke();g.textAlign='right';g.fillText(fmtN(v),padL-6,y+4);}
    g.textAlign='center';for(let t=0;t<=d.T;t+=5)g.fillText(t+' s',padL+W*t/d.T,h-21);
    g.font='12px '+css('--sans');g.fillText('time since failure, seconds',padL+W/2,h-3);
    const bw=W/n;g.fillStyle=css('--blue');
    for(let i=0;i<show;i++){const bh=H*Math.min(1,d.series[i]/max);g.fillRect(padL+i*bw+.5,padT+H-bh,Math.max(1,bw-1),bh);}
    const cy=padT+H-H*1000/max;g.strokeStyle=css('--green');g.setLineDash([6,4]);g.lineWidth=1.5;g.beginPath();g.moveTo(padL,cy);g.lineTo(padL+W,cy);g.stroke();g.setLineDash([]);}
};
optsInit('tBOpts',v=>{tB.mode=v;B.bo=v;$b('tBEmpty').hidden=true;$b('tBBody').hidden=false;tB.render();renderArch();renderSteps();
  const wait=m=>{const r=tB.sim(m);return r.done===null?`over ${r.T} s (${Math.round(r.served/r.N*100)}% in ${r.T} s)`:r.done+' s';};
  cmpTable('tBCmp',v,[{k:'fixed',n:'Every second'},{k:'exp',n:'Exponential backoff'},{k:'jit',n:'Backoff + jitter'}],[
  ['How retries arrive',[['all at once, every second','bad'],['all at once, but less often','bad'],['spread over time, each client at its own moment','good']]],
  ['Load on dispatch during recovery',[['waves, each one overloads','bad'],['rarer waves, each one overloads','bad'],['short, moderate overload that fades quickly','good']]],
  ['How long the rider waits',[[wait('fixed')+': each wave overloads again','bad'],[wait('exp')+': pauses grow, and few retries happen','bad'],[wait('jit')+': fastest','good']]],
  ['Complexity',[['simplest','good'],['simple','good'],['simple: one line of random()','good']]]]);});
$b('tBTakeBtn').addEventListener('click',()=>{$b('tBTake').hidden=false;$b('tBTakeBtn').hidden=true;});

// ---------- step 10: circuit breaker ----------
const tC={mode:null,anim:null,
  sim(mode){const T=90,R=800,DOWN=[10,40],DRAIN=800;let st='closed',openUntil=0,warm=0,ready=false,readyAt=null;const out=[];let toDead=0,errs=0,queued=0,qPeak=0,drainEnd=null;
    for(let t=0;t<T;t++){
      const dead=t>=DOWN[0]&&t<DOWN[1];
      if(t===DOWN[1])warm=0;
      let pass=1;
      if(mode!=='none'){
        if(st==='open'&&t>=openUntil)st='half';
        pass=st==='open'?0:st==='half'?0.05:1;}
      const sent=R*pass;
      // queue drain: only when breaker is closed and dispatch is ready
      let fromQ=0;
      if(mode==='cbq'&&st==='closed'&&ready&&queued>0){fromQ=Math.min(DRAIN,queued);queued-=fromQ;if(queued<=0&&drainEnd===null)drainEnd=t;}
      let okFrac;
      if(t<DOWN[0])okFrac=1;
      else if(dead)okFrac=0;
      else{ if(!ready){warm+=sent>300?0.35:1;if(warm>=5){ready=true;readyAt=t;}} okFrac=ready?1:0.1;}
      const failed=sent*(1-okFrac);
      if(dead||(!ready&&t>=DOWN[0]))toDead+=sent;
      const blocked=R-sent;
      if(mode==='cbq'){queued+=blocked+failed;qPeak=Math.max(qPeak,queued);}else errs+=blocked+failed;
      out.push({t,sent,fromQ,dead,warming:t>=DOWN[1]&&!ready,state:mode==='none'?'none':st});
      if(mode!=='none'){
        const fr=sent?failed/sent:0;
        if(st==='closed'&&fr>0.5&&t>=DOWN[0]+1){st='open';openUntil=t+5;}
        else if(st==='half'){if(fr>0.3){st='open';openUntil=t+5;}else st='closed';}}
    }
    const closedAt=mode==='none'?null:(out.find(o=>o.t>=DOWN[1]&&o.state==='closed')||{}).t;
    return {out,toDead,errs,qPeak,drainEnd,closedAt,readyAt,T,R,DRAIN};},
  render(){const d=this.sim(this.mode);this.d=d;const rec=d.readyAt===null?'over '+(d.T-40)+' s':(d.readyAt-40+1)+' s';
    const see={none:['an error after 2 s','s-bad'],cb:['an error right away','s-warn'],cbq:['“Finding a driver”','s-ok']}[this.mode];
    const rows=[['Requests to dead dispatch',fmtN(d.toDead),d.toDead>5000?'s-bad':'s-ok'],
      ['Rider sees during outage',see[0],see[1]],
      this.mode==='cbq'?['Requests queued at recovery',fmtN(d.qPeak),'s-warn']:['Riders who got an error',fmtN(d.errs),'s-bad'],
      ['dispatch warmed up after restart in',rec,d.readyAt!==null&&d.readyAt-40<8?'s-ok':'s-bad']];
    $b('tCStats').innerHTML=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
    $b('tCQLeg').hidden=this.mode!=='cbq';
    let n='';
    if(this.mode==='cb')n=`After a successful probe request (${d.closedAt} s) the breaker closes, and dispatch immediately gets the full ~${fmtN(d.R)}/s.`;
    else if(this.mode==='cbq')n=`<span class="s-warn"><b>The queue creates a spike.</b></span> After recovery, ride-service drains ${fmtN(d.qPeak)} queued requests at ${fmtN(d.DRAIN)}/s on top of normal traffic: dispatch gets ~${fmtN(d.R+d.DRAIN)}/s for another ${d.drainEnd===null?"over "+(d.T-d.closedAt):d.drainEnd-d.closedAt} s. If the queue isn’t limited in size and drain rate, this spike can take dispatch down again.`;
    else n='After restart, all traffic hits dispatch at once, and it takes a long time warming up, returning errors.';
    $b('tCNote').innerHTML=n;
    cancelAnimationFrame(this.anim);const t0=performance.now();
    const f=ts=>{const k=Math.min(1,(ts-t0)/4000);this.draw(k);if(k<1)this.anim=requestAnimationFrame(f);};this.anim=requestAnimationFrame(f);},
  draw(k){const d=this.d;if(!d)return;this.k=k;const cv=$b('tCChart');if(!cv.clientWidth)return;const {g,w,h}=sizeCanvas(cv);g.clearRect(0,0,w,h);
    const padL=44,padR=20,padB=20,padT=26,W=w-padL-padR,H=h-padT-padB,n=d.out.length,show=Math.max(1,Math.floor(n*k)),max=2000,bw=W/n;
    const mu=css('--muted'),line=css('--line');
    d.out.forEach((o,i)=>{if(o.dead||o.warming){g.fillStyle=o.dead?css('--red'):css('--amber');g.globalAlpha=o.dead?.13:.18;g.fillRect(padL+i*bw,padT,bw,H);g.globalAlpha=1;}});
    g.font='11px '+css('--mono');g.fillStyle=mu;g.strokeStyle=line;g.lineWidth=1;
    for(let i=0;i<=4;i++){const y=padT+H-H*i/4;g.beginPath();g.moveTo(padL,y);g.lineTo(padL+W,y);g.stroke();g.textAlign='right';g.fillText(fmtN(max*i/4),padL-6,y+4);}
    g.textAlign='center';for(let t=0;t<=d.T;t+=10)g.fillText(t+' s',padL+W*t/d.T,h-5);
    for(let i=0;i<show;i++){const o=d.out[i],bh=H*Math.min(1,o.sent/max),qh=H*Math.min(1,o.fromQ/max),x=padL+i*bw+.5,bwi=Math.max(1,bw-1);
      g.fillStyle=css('--blue');g.fillRect(x,padT+H-bh,bwi,bh);
      if(qh){g.fillStyle=css('--amber');g.fillRect(x,padT+H-bh-qh,bwi,qh);}}
    if(this.mode!=='none'){const col={closed:css('--green'),open:css('--red'),half:css('--amber')};
      for(let i=0;i<show;i++){g.fillStyle=col[d.out[i].state];g.fillRect(padL+i*bw,6,bw+.5,10);}}},
};
optsInit('tCOpts',v=>{tC.mode=v;B.cb=v;$b('tCEmpty').hidden=true;$b('tCBody').hidden=false;tC.render();renderArch();renderSteps();
  cmpTable('tCCmp',v,[{k:'none',n:'Nothing'},{k:'cb',n:'Circuit breaker'},{k:'cbq',n:'Circuit breaker + fallback'}],[
  ['Requests to dead dispatch',[['all, each hangs until timeout','bad'],['only probes','good'],['only probes','good']]],
  ['ride-service resources',[['threads and memory tied up by hanging requests','bad'],['free','good'],['free','good']]],
  ['What the rider sees',[['an error after 2 s','bad'],['an error right away','warn'],['“Finding a driver”, request queued','good']]],
  ['dispatch recovery',[['slow: all traffic hits it at once','bad'],['fast: traffic returns after a successful probe request','good'],['fast, but draining the queue creates a load spike','warn']]],
  ['Complexity',[['nothing to do','good'],['thresholds, states, trip monitoring','warn'],['plus a queue: size limit, drain rate, what to do with stale requests','warn']]]]);});
$b('tCTakeBtn').addEventListener('click',()=>{$b('tCTake').hidden=false;$b('tCTakeBtn').hidden=true;});

// ---------- step 7: REST vs GraphQL ----------
const t8={mode:null,twist:false,
  rtt(){return B.region==='region'?15:190;},
  plan(){const r=this.rtt();
    if(this.mode==='rest')return {rows:[['GET /rides/current',0,30,'2.1 KB'],['GET /drivers/{id}',1,30,'6.8 KB'],['GET /rides/{id}/eta',1,30,'0.4 KB'],['GET /cars/{id}',2,30,'3.2 KB']],
      reqs:4,got:12.5,used:1.1};
    if(this.mode==='bff')return {rows:[['GET /screens/ride',0,70,'1.3 KB']],reqs:1,got:1.3,used:1.1};
    return {rows:[['POST /graphql { ride { status eta price driver { name rating car { model plate } } } }',0,80,'1.1 KB']],reqs:1,got:1.1,used:1.1};},
  render(){const r=this.rtt(),p=this.plan();
    $b('t8Rtt').textContent=B.region==='region'?'The rider is in São Paulo, and at the “Brazil” step you picked a nearby region: one round trip costs ~15 ms.':
      'The rider is in São Paulo, and the API is in Frankfurt: one round trip costs ~190 ms. (Pick a nearby region at the “Brazil” step and the numbers change.)';
    let rounds=[],t=0;const maxRound=Math.max(...p.rows.map(x=>x[1]));
    for(let k=0;k<=maxRound;k++){const rs=p.rows.filter(x=>x[1]===k);const dur=r+Math.max(...rs.map(x=>x[2]));rounds.push({start:t,dur});t+=dur;}
    const total=t,scale=Math.max(total,700);
    $b('t8Wf').innerHTML=p.rows.map(([name,k,work,size])=>{const st=rounds[k].start,len=r+work;
      return `<div class="b-wf-row"><span class="b-wf-n" title="${name}">${name}</span><div class="b-wf-t"><i style="left:${st/scale*100}%;width:${len/scale*100}%"></i></div><span class="b-wf-s">${size}</span></div>`;}).join('')+
      `<div class="b-wf-axis"><span>0</span><span>${Math.round(scale/2)} ms</span><span>${scale} ms</span></div>`;
    const rows=[['Screen ready in',total+' ms',total>500?'s-bad':total>200?'s-warn':'s-ok'],['Requests from the phone',p.reqs,p.reqs>1?'s-warn':'s-ok'],['Received / needed',`${p.got} / ${p.used} KB`,p.got>3*p.used?'s-warn':'s-ok']];
    $b('t8Stats').innerHTML=rows.map(r=>`<div class="b-stat"><span>${r[0]}</span><b class="${r[2]}">${r[1]}</b></div>`).join('');
}
};
optsInit('t8Opts',v=>{t8.mode=v;B.api=v;cmpTable('t8Cmp',v,[{k:'rest',n:'REST'},{k:'bff',n:'Screen-specific REST (BFF)'},{k:'gql',n:'GraphQL'}],[
  ['Requests from the phone',[['4, in three sequential rounds','bad'],['1','good'],['1','good']]],
  ['Data per screen',[['12.5 KB, only 1.1 needed','bad'],['1.3 KB','good'],['1.1 KB','good']]],
  ['New block on the screen',[['one more resource and probably one more request','warn'],['backend changes the endpoint and ships a release','bad'],['frontend adds a field to the query','good']]],
  ['Many clients (iOS, Android, web, partners)',[['the same resources for everyone','good'],['a separate endpoint per screen per client','bad'],['one schema, each client picks its fields','good']]],
  ['CDN caching',[['simple, by URL','good'],['shared data in separate GETs gets cached','good'],['POST isn’t cached by default, needs persisted queries','bad']]],
  ['Server complexity',[['simplest','good'],['an endpoint per screen','warn'],['N+1 in resolvers, query complexity limits','warn']]]]);$b('t8Empty').hidden=true;$b('t8Body').hidden=false;t8.render();renderArch();renderSteps();});
$b('t8TakeBtn').addEventListener('click',()=>{$b('t8Take').hidden=false;$b('t8TakeBtn').hidden=true;});

$b('btnArch').addEventListener('click',()=>{window.pauseIncident();$b('incidentApp').hidden=true;$b('buildApp').hidden=false;go(10);});

$b('bArch').addEventListener('click',e=>{const g=e.target.closest('[data-node]');if(g)showInfo(g.dataset.node);});
$b('bArch').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const g=e.target.closest('[data-node]');if(g){e.preventDefault();showInfo(g.dataset.node);}});
window.addEventListener('resize',()=>{t1.draw();t2.redraw();});
go(1);
})();
