(()=>{
// ---------- constants ----------
const U=800, CLIENT_R=1, DT=5, MEM=200, T0=13*3600+58*60, START_T=14*60; // sim t=0 at 13:58; interactive start at 14:12 (t=840)
const SKUS=()=> '8a1e'+Math.floor(Math.random()*0xfffff).toString(16).padStart(5,'0');
const rid=n=>{const a='bcdfghjklmnpqrstvwxz2456789';let s='';for(let i=0;i<n;i++)s+=a[Math.floor(Math.random()*a.length)];return s;};
const ORD_RS='7c9d4b6f8', INV_RS='5f6b8d9c7';
const fmt=t=>{const x=T0+t;const h=Math.floor(x/3600),m=Math.floor(x%3600/60),s=Math.floor(x%60);return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');};
const fmtM=t=>fmt(t).slice(0,5);
let msSeq=0,msT=-1;
const iso=t=>{if(t!==msT){msT=t;msSeq=Math.floor(Math.random()*40);} msSeq=Math.min(999,msSeq+1+Math.floor(Math.random()*60)); return '2026-10-06T'+fmt(t)+'.'+String(msSeq).padStart(3,'0')+'Z';};
const pick=a=>a[Math.floor(Math.random()*a.length)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=v=>(v*100).toFixed(v<0.1?1:0)+'%';

let S, timer=null, BASE_CFG={timeout:30000,retries:3,backoff:'fixed',jitter:false,cb:false};

function newPod(prefix){return {name:prefix+'-'+rid(5),st:'Running',down:0,restarts:0,lastKill:null,born:0,killedNow:false,mem:90};}

function init(){
  S={
    t:0, db:true, rollback:null, invReplicas:4,
    cfg:{...BASE_CFG},
    pend:null,
    pods:[], invPods:[], over:false, fInv:0.002, fOrd:0.002,
    cb:'closed', cbT:0, cbRamp:1, dup:0, okStreak:0, resolved:false, resolvedAt:null, m:{},
    hist:[], logs:{'ride-service':[],'dispatch-service':[],'dispatch-db':[]},
    events:[], tl:[], hintIdx:0, running:false, speed:1, view:'pods', logSvc:'ride-service', logFilter:'',
    selPod:null, evSeen:0, actions:{rollback:null,scaleInv:false,scaleOrd:false,restart:false,cfg:[]},
    alertFiredAt:4*60, started:false, wasOver:false
  };
  for(let i=0;i<6;i++){const p=newPod('ride-service-'+ORD_RS);p.born=-86400*2;S.pods.push(p);}
  for(let i=0;i<4;i++){const p=newPod('dispatch-service-'+INV_RS);p.born=-86400*2;S.invPods.push(p);}
  // historical events
  ev(-30,'Normal','ScalingReplicaSet','deployment/dispatch-service','Scaled up replica set dispatch-service-'+INV_RS+' to 4 (image dispatch-service:v2.31.0)');
  ev(5,'Normal','Completed','job/dispatch-migrate-0142','Migration 0142_drop_unused_cell_index applied to dispatch-db');
  // prefill: healthy until 14:00:05, then migration drops the index
  while(S.t<START_T){
    if(S.t===5) S.db=false;
    step();
    if(S.t===S.alertFiredAt) ev(S.t,'Warning','AlertFiring','alertmanager','RideServiceHighErrorRate firing (5xx > 5%)');
  }
  S.evSeen=S.events.length;
  tl(S.t,'The alert fired at 14:02. You take the incident.','sys');
}

function ev(t,type,reason,obj,msg){S.events.push({t,type,reason,obj,msg});}
function tl(t,text,cls){S.tl.push({t,text,cls});}

// ---------- model ----------
function capacity(){let c=S.db?2600:700; if(S.invReplicas>4)c*=Math.max(0.5,1-0.08*(S.invReplicas-4)); return c;}

function step(){
  S.t+=DT; const c=S.cfg, C=capacity();
  const tick=S.t/DT, wave=(tick%3===0)?1:-0.5;
  // rollback progress
  if(S.rollback && !S.db){ S.rollback.p=Math.min(1,(S.t-S.rollback.start)/30);
    if(S.rollback.p>=1){S.db=true; ev(S.t,'Normal','Completed','job/dispatch-migrate-0142-down','Index driver_positions_cell_idx recreated, migration 0142 rolled back'); tl(S.t,'Index restored. The DB responds fast.','good');}}
  // pods lifecycle
  for(const p of S.pods){ p.killedNow=false;
    if(p.down>0){p.down-=DT; if(p.down<=0){p.st='Running';ev(S.t,'Normal','Started','pod/'+p.name,'Started container ride-svc');}} }
  const alive=S.pods.filter(p=>p.st==='Running').length;
  // circuit breaker
  let pass=1;
  if(c.cb){
    if(S.cb==='closed'&&S.fInv>0.5){S.cb='open';S.cbT=0;logLine('ride-service','WARN',`circuit=dispatch-service state=OPEN failure_rate=${pct(S.fInv)} failing fast for 20s`);}
    else if(S.cb==='open'){S.cbT+=DT; if(S.cbT>=20){S.cb='half';S.cbRamp=0.15;logLine('ride-service','INFO','circuit=dispatch-service state=HALF_OPEN letting 15% of calls through');}}
    else if(S.cb==='half'){ if(S.fInv>0.3){S.cb='open';S.cbT=0;logLine('ride-service','WARN','circuit=dispatch-service state=OPEN probe calls failed');}
      else {S.cbRamp=Math.min(1,S.cbRamp*1.8); if(S.cbRamp>=1){S.cb='closed';logLine('ride-service','INFO','circuit=dispatch-service state=CLOSED');}}}
    pass=S.cb==='open'?0.02:(S.cb==='half'?S.cbRamp:1);
  } else S.cb='closed';
  const f=S.fInv, rs=c.retries;
  let As=0; for(let k=0;k<=rs;k++)As+=Math.pow(f,k);
  const AsRate=1+(As-1)*(c.backoff==='exp'?0.45:1);
  const lat=f*(c.timeout/1000)+(1-f)*0.06;
  let Ac=0; for(let k=0;k<=CLIENT_R;k++)Ac+=Math.pow(S.fOrd,k);
  const Rin=U*Ac*(0.97+Math.random()*0.06);
  const first=alive?Rin*pass:0;
  const Lmean=first*AsRate;
  const retryShare=Lmean>0?(Lmean-first)/Lmean:0;
  const L=c.jitter?Lmean:Math.max(0,Lmean*(1+retryShare*wave));
  const Lpeak=c.jitter?Lmean:Lmean*(1+retryShare);
  if(!S.over && Lpeak>C){S.over=true; if(S.started)tl(S.t,'Dispatch is overloaded.','bad');}
  else if(S.over && Lpeak<C*0.95){S.over=false; if(S.started)tl(S.t,'Dispatch is no longer overloaded.','good');}
  const target=S.over?Math.min(0.97,0.85+0.1*Math.min(1,(L/C-1))):(L>C?1-C/L:0.002);
  S.fInv+=(Math.max(0,target)-S.fInv)*0.5;
  // memory / OOM on order pods
  const perPod=alive?first*As*lat/alive:0;
  for(const p of S.pods) if(p.st==='Running') p.mem=Math.min(512,90+422*Math.min(1,perPod/MEM)*(0.9+Math.random()*0.1));
  if(alive>3 && perPod>MEM){
    const cand=S.pods.filter(p=>p.st==='Running'); const p=pick(cand);
    p.st='CrashLoopBackOff'; p.restarts++; p.lastKill=S.t; p.killedNow=true; p.mem=512;
    p.down=Math.min(60,10*Math.pow(2,Math.min(3,p.restarts-1)));
    ev(S.t,'Warning','OOMKilling','pod/'+p.name,'Memory cgroup out of memory: Killed process 1 (ride-svc), limit 512Mi');
    ev(S.t,'Warning','BackOff','pod/'+p.name,`Back-off restarting failed container ride-svc (${p.down}s)`);
  }
  const fThrough=Math.pow(S.fInv,rs+1);
  const fo=alive===0?1:((1-pass)+pass*fThrough);
  S.fOrd+=(Math.min(1,fo)-S.fOrd)*0.6;
  const invP99=S.over?(24+Math.random()*18):(L>C?3+Math.random()*4:0.03+S.fInv*2);
  const ordP99=alive===0?0.01:(S.cb==='open'?0.004:(S.fOrd>0.02?Math.min(c.timeout/1000*(rs+1),Math.max(lat*As,c.timeout/1000)):0.09+S.fInv*0.3));
  const maxMem=Math.max(...S.pods.map(p=>p.mem));
  S.m={L,C,first,fInv:S.fInv,fOrd:S.fOrd,alive,As,invP99,ordP99,maxMem,ok:U*(1-Math.pow(S.fOrd,CLIENT_R+1)),perPod};
  S.hist.push({t:S.t,err:S.fOrd*100,L,C,invP99,ordP99,mem:maxMem/512*100});
  if(S.hist.length>240)S.hist.shift();
  genLogs();
  if(S.started){
    if(S.fOrd<0.01&&alive===S.pods.length)S.okStreak+=DT; else S.okStreak=0;
    if(S.okStreak>=60&&!S.resolved){S.resolved=true;S.resolvedAt=S.t;tl(S.t,'Incident resolved.','good');ev(S.t,'Normal','AlertResolved','alertmanager','RideServiceHighErrorRate resolved');showReport();}
  }
}

// ---------- logs ----------
function logLine(svc,lv,msg,pod){
  const arr=S.logs[svc]; const p=pod||(svc==='ride-service'?pick(S.pods.filter(x=>x.st==='Running').concat(S.pods)).name:svc==='dispatch-service'?pick(S.invPods).name:'dispatch-db-0');
  arr.push({t:S.t,lv,txt:`${iso(S.t)} ${lv.padEnd(5)} [${p.replace(/^(ride|dispatch)-service-/,'').slice(-15)}] ${msg}`});
  if(arr.length>400)arr.shift();
}
function genLogs(){
  const c=S.cfg,m=S.m,T=c.timeout/1000;
  // ride-service
  const nO=2+Math.floor(Math.random()*3);
  for(let i=0;i<nO;i++){
    if(S.cb==='open'){ logLine('ride-service','ERROR',`POST /api/rides 503 err="circuit open: dispatch-service" duration=${(2+Math.random()*3).toFixed(0)}ms`); continue;}
    if(m.alive===0){continue;}
    if(Math.random()<m.fInv){
      const att=1+Math.floor(Math.random()*(c.retries+1));
      if(att<=c.retries){
        const wait=c.backoff==='exp'?1000*Math.pow(2,att-1):1000;
        const j=c.jitter?` (jittered ${Math.floor(Math.random()*wait)}ms)`:'';
        logLine('ride-service','WARN',`GET dispatch-service/v1/nearby-drivers?cell=${SKUS()} attempt=${att}/${c.retries+1} err="deadline exceeded after ${T}s" retry_in=${wait}ms${j}`);
      } else logLine('ride-service','ERROR',`POST /api/rides 503 upstream=dispatch-service attempts=${c.retries+1} duration=${(T*(c.retries+1)+Math.random()).toFixed(1)}s`);
    } else logLine('ride-service','INFO',`POST /api/rides 201 duration=${(60+Math.random()*60).toFixed(0)}ms`);
  }
  if(m.perPod>MEM*0.7&&Math.random()<0.6) logLine('ride-service','WARN',`inflight_requests=${Math.round(Math.min(m.perPod,MEM*1.15)*21*(0.9+Math.random()*0.1))} heap=${Math.round(m.maxMem*0.95)}Mi gc_pause=${(Math.random()*400+100).toFixed(0)}ms`);
  // dispatch-service
  const nI=2+Math.floor(Math.random()*2);
  for(let i=0;i<nI;i++){
    if(S.over){
      const r=Math.random();
      if(r<0.4) logLine('dispatch-service','WARN',`slow request GET /v1/nearby-drivers?cell=${SKUS()} duration=${m.invP99.toFixed(1)}s queue_wait=${(m.invP99-0.4).toFixed(1)}s`);
      else if(r<0.75) logLine('dispatch-service','WARN',`GET /v1/nearby-drivers?cell=${SKUS()} 499 client closed request before response (work wasted ${m.invP99.toFixed(1)}s)`);
      else logLine('dispatch-service','ERROR',`worker pool saturated: queue_depth=${Math.round((m.L-m.C)*12+4000)} rps_in=${Math.round(m.L)} rps_done=${Math.round(m.C)}`);
    } else if(m.L>m.C) logLine('dispatch-service','WARN',`GET /v1/nearby-drivers?cell=${SKUS()} 200 duration=${(m.invP99).toFixed(1)}s`);
    else logLine('dispatch-service','INFO',`GET /v1/nearby-drivers?cell=${SKUS()} 200 duration=${(8+Math.random()*20).toFixed(0)}ms`);
  }
  // dispatch-db
  if(S.rollback&&!S.db) logLine('dispatch-db','LOG',`CREATE INDEX CONCURRENTLY driver_positions_cell_idx ON driver_positions (cell_id): building, ${Math.round(S.rollback.p*100)}% done`);
  if(!S.db){
    for(let i=0;i<2;i++) logLine('dispatch-db','LOG',`duration: ${(1800+Math.random()*1900).toFixed(3)} ms  statement: SELECT driver_id, lat, lng FROM driver_positions WHERE cell_id = '${SKUS()}'`);
    if(Math.random()<0.4) logLine('dispatch-db','WARN',`connection slots almost exhausted: ${96+Math.floor(Math.random()*4)}/100 in use`);
  } else if(Math.random()<0.2) logLine('dispatch-db','LOG',`checkpoint complete: wrote ${Math.floor(Math.random()*900+100)} buffers`);
}

// ---------- rendering ----------
const $=id=>document.getElementById(id);
const main=$('main');
function setView(v){S.view=v; document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.v===v));
  if(v==='events')S.evSeen=S.events.length; render(true);}

function render(full){
  renderChrome();
  const v=S.view;
  if(v==='pods') renderPods();
  else if(v==='metrics') renderMetrics(full);
  else if(v==='logs') renderLogs(full);
  else if(v==='events') renderEvents();
  else if(v==='config'){ if(full) renderConfig(); }
  else if(v==='db') renderDb(full);
}

function renderChrome(){
  $('clock').textContent=fmt(S.t);
  const a=$('alert'), err=S.m.fOrd||0;
  a.classList.toggle('ok',S.resolved&&err<0.05);
  a.classList.toggle('warn',!S.resolved&&err<0.05);
  $('alState').textContent=S.resolved&&err<0.05?'RESOLVED':(err<0.05?'PENDING':'FIRING');
  $('alVal').textContent=pct(err);
  $('alDesc').textContent=S.resolved?`Resolved at ${fmt(S.resolvedAt)}. Ride requests OK ${Math.round(S.m.ok)}/s.`:
    (err<0.05?'Error rate dropped below threshold. Waiting for a stable minute before resolving.':`ride-service 5xx rate above 5% since 14:02. Ride requests OK ${Math.round(S.m.ok)}/s of ${U}/s.`);
  const bad=S.pods.filter(p=>p.st!=='Running').length;
  const bp=$('bPods'); bp.textContent=`${S.pods.length-bad}/${S.pods.length}`; bp.classList.toggle('bad',bad>0);
  const ne=S.events.length-S.evSeen; const be=$('bEv'); be.textContent=ne>0?'+'+ne:S.events.length; be.classList.toggle('bad',ne>0);
  $('tl').innerHTML=S.tl.slice().reverse().map(x=>`<li><time>${fmt(x.t)}</time><span class="${x.cls||''}">${esc(x.text)}</span></li>`).join('');
  const m=S.m;
  $('now').innerHTML=[
    ['Successful requests/s',Math.round(m.ok)],
    ['ride-service 5xx',pct(m.fOrd)],
    ['ride-service pods ready',`${m.alive} / ${S.pods.length}`],
    ['Circuit breaker',S.cfg.cb?S.cb.toUpperCase():'off'],
  ].map(([k,v])=>`<span>${k}</span><span>${v}</span>`).join('');
  $('btnPause').textContent=S.running?'Pause':'Resume';
  $('btnSpeed').textContent='Speed '+S.speed+'×';
}

function age(born){const d=S.t-born; if(d>86400)return Math.floor(d/86400)+'d'; if(d>3600)return Math.floor(d/3600)+'h'; if(d>60)return Math.floor(d/60)+'m'; return d+'s';}

function renderPods(){
  const ordRows=S.pods.map(p=>{
    const st=p.killedNow?'<span class="s-bad">OOMKilled</span>':p.st==='Running'?'<span class="s-ok">Running</span>':p.st==='ContainerCreating'?'<span class="s-warn">ContainerCreating</span>':'<span class="s-bad">CrashLoopBackOff</span>';
    const ready=p.st==='Running'?'1/1':'0/1';
    const rest=p.restarts?`${p.restarts} (${age(p.lastKill)} ago)`:'0';
    const memPct=p.mem/512;
    const col=memPct>0.9?'var(--red)':memPct>0.7?'var(--amber)':'var(--green)';
    return `<tr class="click ${S.selPod===p.name?'sel':''}" data-pod="${p.name}"><td>${p.name}</td><td>${ready}</td><td>${st}</td><td>${rest}</td><td>${Math.round(p.mem)}Mi<span class="meter"><i style="width:${memPct*100}%;background:${col}"></i></span></td><td>${age(p.born)}</td></tr>`;}).join('');
  const invRows=S.invPods.map(p=>`<tr><td>${p.name}</td><td>1/1</td><td><span class="s-ok">Running</span></td><td>0</td><td>${Math.round(140+Math.min(1,S.m.L/S.m.C)*90)}Mi</td><td>${age(p.born)}</td></tr>`).join('');
  const sel=S.pods.find(p=>p.name===S.selPod);
  let desc='';
  if(sel){
    desc=`<pre class="describe">Name:         ${sel.name}
Namespace:    rides
Containers:
  ride-svc:
    Image:          ride-service:v1.84.2
    State:          ${sel.st==='Running'?'Running':'Waiting\n      Reason:       '+sel.st}
    Last State:     ${sel.restarts?'Terminated\n      Reason:       OOMKilled\n      Exit Code:    137\n      Finished:     '+fmt(sel.lastKill):'&lt;none&gt;'}
    Restart Count:  ${sel.restarts}
    Limits:
      memory:  512Mi
    Requests:
      memory:  256Mi
    Environment From:
      ride-service-config  ConfigMap
    Environment:
      DISPATCH_URL:  http://dispatch-service.rides.svc:8080</pre>`;
  }
  main.innerHTML=`<h2>Pods</h2><p class="sub">kubectl get pods -n rides</p>
  <div class="card"><div class="wl"><h4 style="margin:0">deployment/ride-service</h4><span class="grow"></span>
    replicas <span class="stepper"><button data-act="ordDown" aria-label="Decrease">−</button><span>${S.pods.length}</span><button data-act="ordUp" aria-label="Increase">+</button></span>
    <button class="btn" data-act="restartOrd">Rollout restart</button></div>
    <div class="scroll"><table><thead><tr><th>NAME</th><th>READY</th><th>STATUS</th><th>RESTARTS</th><th>MEMORY</th><th>AGE</th></tr></thead><tbody>${ordRows}</tbody></table></div>
    ${desc||'<p class="small" style="margin:10px 0 0">Click a pod to see kubectl describe.</p>'}</div>
  <div class="card"><div class="wl"><h4 style="margin:0">deployment/dispatch-service</h4><span class="grow"></span>
    replicas <span class="stepper"><button data-act="invDown" aria-label="Decrease">−</button><span>${S.invReplicas}</span><button data-act="invUp" aria-label="Increase">+</button></span></div>
    <div class="scroll"><table><thead><tr><th>NAME</th><th>READY</th><th>STATUS</th><th>RESTARTS</th><th>MEMORY</th><th>AGE</th></tr></thead><tbody>${invRows}</tbody></table></div></div>
  <div class="card"><h4>statefulset/dispatch-db</h4><div class="scroll"><table><thead><tr><th>NAME</th><th>READY</th><th>STATUS</th><th>RESTARTS</th><th>AGE</th></tr></thead><tbody><tr><td>dispatch-db-0</td><td>1/1</td><td><span class="s-ok">Running</span></td><td>0</td><td>41d</td></tr></tbody></table></div></div>`;
}

// charts
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function drawChart(cv,series,opts){
  const dpr=window.devicePixelRatio||1, w=cv.clientWidth, h=cv.clientHeight;
  if(cv.width!==w*dpr||cv.height!==h*dpr){cv.width=w*dpr;cv.height=h*dpr;}
  const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  const padL=42,padR=8,padT=8,padB=20, W=w-padL-padR, H=h-padT-padB;
  const H_=S.hist, n=H_.length; if(n<2)return;
  let max=opts.max; if(!max){max=0;for(const s of series)for(const d of H_)max=Math.max(max,s.get(d)); max=niceMax(max*1.1||1);}
  g.font='11px '+css('--mono'); g.fillStyle=css('--muted'); g.strokeStyle=css('--chart-grid'); g.lineWidth=1;
  for(let i=0;i<=4;i++){const y=padT+H-H*i/4; g.beginPath();g.moveTo(padL,y);g.lineTo(padL+W,y);g.stroke();
    g.textAlign='right'; g.fillText(opts.fmt(max*i/4),padL-6,y+4);}
  g.textAlign='center';
  const t0=H_[0].t, t1=H_[n-1].t, span=Math.max(1,t1-t0);
  const lstep=W<520?240:120; for(const d of H_) if(d.t%lstep===0){const x=padL+W*(d.t-t0)/span; g.fillText(fmtM(d.t),x,h-5);}
  if(S.started){const x=padL+W*(START_T-t0)/span; if(x>padL){g.strokeStyle=css('--muted');g.setLineDash([2,3]);g.beginPath();g.moveTo(x,padT);g.lineTo(x,padT+H);g.stroke();g.setLineDash([]);}}
  for(const s of series){
    g.strokeStyle=s.color; g.lineWidth=s.w||2; g.setLineDash(s.dash||[]); g.beginPath();
    H_.forEach((d,i)=>{const x=padL+W*(d.t-t0)/span, y=padT+H-H*Math.min(1,s.get(d)/max); i?g.lineTo(x,y):g.moveTo(x,y);});
    g.stroke(); g.setLineDash([]);
  }
}
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const r=v/p;return (r<=1?1:r<=2?2:r<=5?5:10)*p;}

function renderMetrics(full){
  if(full||!$('c1')){
    main.innerHTML=`<h2>Metrics</h2><p class="sub">Last 20 minutes. Dashed vertical line: when you took the incident.</p>
    <div class="grid2">
      <div class="chart"><div class="hd"><b>ride-service 5xx rate</b><span class="now" id="n1"></span></div><canvas id="c1"></canvas><div class="legend"><span><i style="background:var(--red)"></i>5xx %</span><span><i style="background:var(--muted)"></i>alert threshold 5%</span></div></div>
      <div class="chart"><div class="hd"><b>dispatch-service requests/s</b><span class="now" id="n2"></span></div><canvas id="c2"></canvas><div class="legend"><span><i style="background:var(--blue)"></i>incoming rps</span><span><i style="background:var(--green)"></i>capacity</span></div></div>
      <div class="chart"><div class="hd"><b>p99 latency</b><span class="now" id="n3"></span></div><canvas id="c3"></canvas><div class="legend"><span><i style="background:var(--amber)"></i>dispatch (server)</span><span><i style="background:var(--red)"></i>ride (as the rider sees it)</span></div></div>
      <div class="chart"><div class="hd"><b>ride-service max memory, % of limit</b><span class="now" id="n4"></span></div><canvas id="c4"></canvas><div class="legend"><span><i style="background:var(--amber)"></i>memory %</span><span><i style="background:var(--muted)"></i>limit 512Mi</span></div></div>
    </div>`;
  }
  const r=css('--red'),b=css('--blue'),gr=css('--green'),am=css('--amber'),mu=css('--muted');
  drawChart($('c1'),[{get:d=>d.err,color:r},{get:()=>5,color:mu,dash:[4,4],w:1}],{max:100,fmt:v=>v.toFixed(0)+'%'});
  drawChart($('c2'),[{get:d=>d.L,color:b},{get:d=>d.C,color:gr,dash:[6,4]}],{fmt:v=>v>=1000?(v/1000).toFixed(v%1000?1:0)+'k':v.toFixed(0)});
  drawChart($('c3'),[{get:d=>d.invP99,color:am},{get:d=>d.ordP99,color:r}],{fmt:v=>v<1?(v*1000).toFixed(0)+'ms':v.toFixed(0)+'s'});
  drawChart($('c4'),[{get:d=>d.mem,color:am},{get:()=>100,color:mu,dash:[4,4],w:1}],{max:100,fmt:v=>v.toFixed(0)+'%'});
  const m=S.m;
  $('n1').textContent=pct(m.fOrd); $('n1').style.color=m.fOrd>0.05?r:gr;
  $('n2').textContent=Math.round(m.L)+' / '+Math.round(m.C);
  $('n3').textContent=(m.ordP99<1?(m.ordP99*1000).toFixed(0)+'ms':m.ordP99.toFixed(1)+'s');
  $('n4').textContent=Math.round(m.maxMem/512*100)+'%';
}

function renderLogs(full){
  if(full||!$('logbox')){
    main.innerHTML=`<h2>Logs</h2><p class="sub">kubectl logs -f, all service pods</p>
    <div class="logbar">${['ride-service','dispatch-service','dispatch-db'].map(s=>`<button class="btn ${S.logSvc===s?'on':''}" data-log="${s}">${s}</button>`).join('')}
    <input id="lf" placeholder="filter, e.g. ERROR or retry" value="${esc(S.logFilter)}" aria-label="Log filter"></div>
    <div class="logs" id="logbox"></div>`;
    $('lf').addEventListener('input',e=>{S.logFilter=e.target.value;renderLogs(false);});
  }
  const box=$('logbox'); const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<40;
  const q=S.logFilter.toLowerCase();
  const lines=S.logs[S.logSvc].filter(l=>!q||l.txt.toLowerCase().includes(q)).slice(-250);
  box.innerHTML=lines.map(l=>{const i=l.txt.indexOf(' ');return `<div><span class="ts">${esc(l.txt.slice(11,23))}</span> <span class="lv-${l.lv}">${esc(l.txt.slice(i+1))}</span></div>`;}).join('')||'<div class="small">No lines match this filter.</div>';
  if(atBottom||full)box.scrollTop=box.scrollHeight;
}

function renderEvents(){
  S.evSeen=S.events.length;
  const rows=S.events.slice().reverse().slice(0,200).map(e=>`<tr><td>${fmt(e.t)}</td><td class="ev-${e.type}">${e.type}</td><td>${e.reason}</td><td>${e.obj}</td><td style="white-space:normal;min-width:280px">${esc(e.msg)}</td></tr>`).join('');
  main.innerHTML=`<h2>Events</h2><p class="sub">kubectl get events -n rides --sort-by=.lastTimestamp, newest first</p>
  <div class="card scroll"><table><thead><tr><th>TIME</th><th>TYPE</th><th>REASON</th><th>OBJECT</th><th>MESSAGE</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderDb(full){
  const slow=!S.db, rb=S.rollback;
  const plan=slow?`Seq Scan on driver_positions  (cost=0.00..48211.40 rows=1 width=12)
  Filter: (cell_id = $1)
  Rows Removed by Filter: 2140388
Execution Time: 2412.6 ms`:`Index Scan using driver_positions_cell_idx on driver_positions  (cost=0.43..8.45 rows=1 width=12)
  Index Cond: (cell_id = $1)
Execution Time: 0.09 ms`;
  const migs=[
    ['0140_add_reserved_column','13 Sep 11:02','applied',''],
    ['0141_backfill_reserved','13 Sep 11:05','applied',''],
    ['0142_drop_unused_cell_index','Today 14:00:07',rb?(S.db?'rolled back':'rolling back '+Math.round(rb.p*100)+'%'):'applied',
      rb?(S.db?`<button class="btn danger" data-act="reapply">Apply again</button>`:''):`<button class="btn danger" data-act="rollback">Rollback</button>`]
  ];
  main.innerHTML=`<h2>dispatch-db</h2><p class="sub">PostgreSQL 15, statefulset/dispatch-db</p>
  <div class="grid2">
    <div class="card"><h4>Status</h4><div class="kv">
      <span>Active connections</span><span class="${slow?'s-bad':''}">${slow?96+Math.floor(Math.random()*4):18+Math.floor(Math.random()*10)} / 100</span>
      <span>Avg query time</span><span class="${slow?'s-bad':''}">${slow?(1900+Math.random()*800).toFixed(0)+' ms':(0.2+Math.random()*0.3).toFixed(2)+' ms'}</span>
      <span>Slow queries per minute</span><span>${slow?Math.floor(1300+Math.random()*300):0}</span>
      <span>CPU</span><span class="${slow?'s-bad':''}">${slow?'97%':'14%'}</span>
    </div></div>
    <div class="card"><h4>Top query</h4><pre class="describe" style="margin:0">SELECT driver_id, lat, lng FROM driver_positions WHERE cell_id = $1</pre>
      <pre class="describe">${plan}</pre></div>
  </div>
  <div class="card"><h4>Migrations</h4><div class="scroll"><table><thead><tr><th>MIGRATION</th><th>APPLIED</th><th>STATUS</th><th></th></tr></thead><tbody>
  ${migs.map(m=>`<tr><td>${m[0]}</td><td>${m[1]}</td><td class="${m[2].startsWith('roll')?'s-warn':''}">${m[2]}</td><td>${m[3]}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

// config
const OPTS={timeout:[[30000,'30s'],[10000,'10s'],[5000,'5s'],[2000,'2s'],[1000,'1s']],retries:[[0,'0'],[1,'1'],[2,'2'],[3,'3']],
  backoff:[['fixed','fixed (1s)'],['exp','exponential (1s, 2s, 4s)']],jitter:[[false,'false'],[true,'true']],cb:[[false,'disabled'],[true,'enabled']]};
const LABEL={timeout:'timeout',retries:'maxRetries',backoff:'backoff',jitter:'jitter',cb:'circuitBreaker'};
function renderConfig(){
  if(!S.pend)S.pend={...S.cfg};
  const sel=k=>`<select data-k="${k}" class="${S.pend[k]!==S.cfg[k]?'changed':''}" aria-label="${LABEL[k]}">${OPTS[k].map(([v,l])=>`<option value="${v}" ${S.pend[k]===v?'selected':''}>${l}</option>`).join('')}</select>`;
  const changed=Object.keys(S.cfg).filter(k=>S.pend[k]!==S.cfg[k]);
  main.innerHTML=`<h2>ride-service-config</h2><p class="sub">ConfigMap, ride-service reloads it without a restart</p>
  <div class="yaml">
    <div class="row"><span><span class="k">dispatchClient</span>:</span></div>
    <div class="row ind"><span><span class="k">timeout</span>:</span> ${sel('timeout')}</div>
    <div class="row ind"><span><span class="k">retry</span>:</span></div>
    <div class="row ind2"><span><span class="k">maxRetries</span>:</span> ${sel('retries')}</div>
    <div class="row ind2"><span><span class="k">backoff</span>:</span> ${sel('backoff')}</div>
    <div class="row ind2"><span><span class="k">jitter</span>:</span> ${sel('jitter')}</div>
    <div class="row ind"><span><span class="k">circuitBreaker</span>:</span> ${sel('cb')} <span class="c"># open at 50% failures, 20s cool-down</span></div>
    <div class="row" style="margin-top:10px"><span class="c"># mobile app (read only): retries once on 5xx after 1s. Next app release in 2 weeks.</span></div>
  </div>
  <div class="applybar"><button class="btn primary" id="btnApply" ${changed.length?'':'disabled'}>kubectl apply</button>
    <span class="diff">${changed.map(k=>`${LABEL[k]}: ${show(k,S.cfg[k])} → ${show(k,S.pend[k])}`).join(', ')}</span></div>`;
  main.querySelectorAll('select').forEach(s=>s.addEventListener('change',e=>{const k=e.target.dataset.k;const o=OPTS[k].find(([v])=>String(v)===e.target.value);S.pend[k]=o[0];renderConfig();}));
  $('btnApply').addEventListener('click',applyCfg);
}
function show(k,v){return OPTS[k].find(o=>o[0]===v)[1].split(' ')[0];}
function applyCfg(){
  const changed=Object.keys(S.cfg).filter(k=>S.pend[k]!==S.cfg[k]); if(!changed.length)return;
  const txt=changed.map(k=>`${LABEL[k]} ${show(k,S.cfg[k])}→${show(k,S.pend[k])}`).join(', ');
  S.cfg={...S.pend}; S.actions.cfg.push(S.t);
  if(!S.cfg.cb)S.cb='closed';
  ev(S.t,'Normal','ConfigReloaded','configmap/ride-service-config','ride-service picked up new config: '+txt);
  tl(S.t,'Config: '+txt);
  renderConfig(); renderChrome();
}

// ---------- actions ----------
main.addEventListener('click',e=>{
  const pod=e.target.closest('tr[data-pod]'); if(pod){S.selPod=S.selPod===pod.dataset.pod?null:pod.dataset.pod;renderPods();return;}
  const lg=e.target.closest('[data-log]'); if(lg){S.logSvc=lg.dataset.log;renderLogs(true);return;}
  const a=e.target.closest('[data-act]'); if(!a)return;
  const act=a.dataset.act;
  if(act==='ordUp'||act==='ordDown'){
    if(act==='ordUp'&&S.pods.length<12){const p=newPod('ride-service-'+ORD_RS);p.born=S.t;p.st='ContainerCreating';p.down=10;S.pods.push(p);}
    else if(act==='ordDown'&&S.pods.length>2){S.pods.pop();}
    else return;
    S.actions.scaleOrd=true; ev(S.t,'Normal','ScalingReplicaSet','deployment/ride-service','Scaled replica set to '+S.pods.length);
    tl(S.t,'ride-service scaled to '+S.pods.length+' pods.');
  }
  if(act==='invUp'||act==='invDown'){
    if(act==='invUp'&&S.invReplicas<10){S.invReplicas++;const p=newPod('dispatch-service-'+INV_RS);p.born=S.t;S.invPods.push(p);}
    else if(act==='invDown'&&S.invReplicas>2){S.invReplicas--;S.invPods.pop();}
    else return;
    if(S.invReplicas>4)S.actions.scaleInv=true;
    ev(S.t,'Normal','ScalingReplicaSet','deployment/dispatch-service','Scaled replica set to '+S.invReplicas);
    tl(S.t,'dispatch-service scaled to '+S.invReplicas+' pods.');
  }
  if(act==='restartOrd'){
    S.pods.forEach(p=>{p.st='ContainerCreating';p.down=10;p.name='ride-service-'+ORD_RS+'-'+rid(5);p.born=S.t;p.restarts=0;p.mem=90;});
    S.selPod=null; S.actions.restart=true;
    ev(S.t,'Normal','RolloutRestart','deployment/ride-service','Restarted all pods');
    tl(S.t,'Rollout restart ride-service.');
  }
  if(act==='reapply'){redeploy();return;}
  if(act==='rollback'){
        S.rollback={start:S.t,p:0}; S.actions.rollback=S.t;
    ev(S.t,'Normal','Started','job/dispatch-migrate-0142-down','Rolling back migration 0142_drop_unused_cell_index');
    tl(S.t,'Started rollback of migration 0142.');
  }
  render(true);
});

document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('button[data-v]'); if(b)setView(b.dataset.v);});

const HINTS=[
  'What changed shortly before 14:02? Check Events.',
  'dispatch-db logs: which queries are slow and why is the plan so expensive?',
  'After the rollback the DB is healthy, but dispatch doesn’t recover. Compare incoming rps with capacity: where do so many requests come from if there are 800 riders/s?',
  'Do the math: the mobile client retries once, ride-service retries three times. How many requests to dispatch come from one tap on “Request ride”?',
  'Retries with a fixed delay arrive in synchronized waves. What would spread them out? What would give dispatch room to breathe?',
  'Why are ride-service pods getting OOMKilled? How many requests sit in memory with a 30s timeout?',
];
$('btnHint').addEventListener('click',()=>{const h=$('hint');h.hidden=false;h.textContent=HINTS[Math.min(S.hintIdx,HINTS.length-1)];S.hintIdx++;
  $('btnHint').textContent=S.hintIdx<HINTS.length?'Next hint':'No more hints';});

// ---------- report ----------
function showReport(){
  const c=S.cfg, took=S.resolvedAt-(S.incStart??START_T), dup=Math.round(S.dup);
  const mm=Math.floor(took/60), ss=took%60;
  $('rSum').textContent=`${S.rerun?'Time from the redeploy to closing:':'Time from taking the incident to closing:'} ${mm} min ${ss} s of simulated time. In total, riders couldn’t request a ride for ${Math.floor((S.resolvedAt-(S.rerun?S.incStart:S.alertFiredAt))/60)} min.`;
  $('rt').textContent=S.rerun?'Survived the redeploy':'Incident closed';
  const items=[];
  const ok=(m,t)=>items.push(`<li><span class="m s-ok">✓</span><span>${t}</span></li>`);
  const bad=(m,t)=>items.push(`<li><span class="m s-bad">✗</span><span>${t}</span></li>`);
  const note=(t)=>items.push(`<li><span class="m s-warn">!</span><span>${t}</span></li>`);
  note(S.rerun?`<b>Config during the redeploy:</b> ${Object.keys(S.cfg).map(k=>LABEL[k]+' '+show(k,S.cfg[k])).join(', ')}.`:`<b>Config the service ran with for six months:</b> ${Object.keys(BASE_CFG).map(k=>LABEL[k]+' '+show(k,BASE_CFG[k])).join(', ')}.`);
  ok('','<b>Root cause:</b> migration 0142 dropped the index on cell_id. Every nearby-driver lookup became a seq scan over the whole positions table, and dispatch fell below the required capacity.');
  const breakers=[];
  if(c.retries<3)breakers.push(`retries 3 → ${c.retries}`);
  if(c.backoff==='exp')breakers.push('exponential backoff');
  if(c.jitter)breakers.push('jitter');
  if(c.cb)breakers.push('circuit breaker');
  ok('',`<b>Retry storm broken:</b> ${breakers.join(', ')||'retry settings'}. Without this, dispatch would have stayed overloaded even after the DB rollback: one tap on “Request ride” produced up to 8 requests to dispatch.`);
  if(c.timeout>=10000) bad('',`<b>Timeout stayed at ${c.timeout/1000}s.</b> Requests hung in memory, and ride-service pods got OOMKilled. A rider waited up to ${c.timeout/1000*(c.retries+1)}s per ride request attempt. The next dependency failure will do it again.`);
  else ok('',`<b>Timeout ${c.timeout/1000}s:</b> requests don’t pile up in memory, and the rider gets a fast error instead of waiting.`);
  if(!c.cb) note('<b>Circuit breaker is off.</b> Retry settings were enough this time, but on the next outage ride-service will hammer the sick dependency again.');
  if(S.actions.scaleInv) note('<b>Scaling dispatch-service didn’t help, it hurt:</b> more pods meant more connections to an already overloaded DB.');
  if(S.actions.restart) note('<b>Rollout restart didn’t help:</b> new pods got the same retry flood within seconds.');
  if(S.actions.scaleOrd) note('<b>Scaling ride-service doesn’t fix the cause:</b> more pods just send more retries to dispatch.');
  $('rList').innerHTML=items.join('')+`<li><span class="m s-ok">→</span><span><b>Further reading after the incident:</b> <a href="https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" target="_blank" rel="noopener">AWS Builders' Library: Timeouts, retries and backoff with jitter</a>; <a href="https://sre.google/sre-book/addressing-cascading-failures/" target="_blank" rel="noopener">Google SRE Book: Addressing Cascading Failures</a>.</span></li>`;
  $('report').hidden=false;
}

// ---------- loop ----------
function loop(){ if(!S||!S.running)return; step(); render(false); }
function schedule(){ clearInterval(timer); timer=setInterval(loop,500/S.speed); }
$('btnPause').addEventListener('click',()=>{S.running=!S.running;renderChrome();});
$('btnSpeed').addEventListener('click',()=>{S.speed=S.speed===1?2:S.speed===2?4:1;schedule();renderChrome();});
$('btnStart').addEventListener('click',()=>{$('brief').hidden=true;S.started=true;S.running=true;render(true);});
function redeploy(){if(!S)return;S.db=false;S.rollback=null;S.resolved=false;S.okStreak=0;S.incStart=S.t;S.rerun=(S.rerun||0)+1;
  S.actions={rollback:null,scaleInv:false,scaleOrd:false,restart:false,cfg:[]};
  ev(S.t,'Normal','Completed','job/dispatch-migrate-0142','Migration 0142_drop_unused_cell_index applied to dispatch-db again');
  tl(S.t,'The same migration was applied again. Config: '+Object.keys(S.cfg).map(k=>LABEL[k]+' '+show(k,S.cfg[k])).join(', ')+'.','bad');
  $('report').hidden=true;S.running=true;render(true);}
function reset(){init();$('report').hidden=true;$('brief').hidden=false;$('hint').hidden=true;$('btnHint').textContent='Hint';setView('pods');}
$('btnReset').addEventListener('click',reset);
$('btnAgain').addEventListener('click',reset);
$('btnClose').addEventListener('click',()=>{$('report').hidden=true;});
$('btnTheme').addEventListener('click',()=>{const r=document.documentElement;const dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=dark?'light':'dark';render(true);});
window.addEventListener('resize',()=>{if(S&&S.view==='metrics')renderMetrics(false);});

window.startIncident=cfg=>{BASE_CFG=Object.fromEntries(Object.entries(cfg).filter(([k])=>k in OPTS));reset();schedule();};
window.pauseIncident=()=>{if(S){S.running=false;renderChrome();}};
})();
