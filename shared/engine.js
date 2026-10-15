// Shared workshop engine: small helpers used by every topic.
// Loaded before the topic script, so everything here is global.
const $b=id=>document.getElementById(id);
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function segInit(id,onPick){const el=$b(id);el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));onPick(b.dataset.v);});}
function optsInit(id,onPick){const el=$b(id);el.addEventListener('click',e=>{const b=e.target.closest('.b-opt');if(!b)return;
  el.querySelectorAll('.b-opt').forEach(x=>x.setAttribute('aria-pressed',x===b));onPick(b.dataset.v);});}
function sizeCanvas(cv){const dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
  const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);return {g,w,h};}
const fmtN=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e4?Math.round(n/1000)+'k':n>=1000?(n/1000).toFixed(1)+'k':String(Math.round(n));
function fitFont(g,t,max,size,wt){let sz=size;do{g.font=wt+sz+'px '+css('--sans');if(g.measureText(t).width<=max)return;sz--;}while(sz>9);}
function cmpTable(id,mode,cols,rows){$b(id).innerHTML=`<thead><tr><th></th>${cols.map(c=>`<th class="${c.k===mode?'sel':''}">${c.n}</th>`).join('')}</tr></thead><tbody>`+
  rows.map(([name,cells])=>`<tr><th>${name}</th>${cells.map(([v,cls],i)=>`<td class="${cls?'c-'+cls:''} ${cols[i].k===mode?'sel':''}">${v}</td>`).join('')}</tr>`).join('')+'</tbody>';}
function lbl(g,t,x,y,col,bold){g.font=(bold?'600 ':'')+'12px '+css('--sans');g.textAlign='center';if(g._lo!==undefined){const hw=g.measureText(t).width/2+4;x=Math.max(g._lo+hw,Math.min(g._hi-hw,x));}g.lineJoin='round';g.lineWidth=4;g.strokeStyle=css('--panel-2');g.strokeText(t,x,y);g.fillStyle=col;g.fillText(t,x,y);}
