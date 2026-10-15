// Loads content.md (next to the topic page) and replaces the built-in texts.
// ---------- texts from content.md ----------
// The page ships with built-in texts. If content.md sits next to index.html
// (GitHub Pages or any web server), its texts replace the built-in ones.
(function(){
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  function md(s){
    s=esc(s.trim());
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
    s=s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function paras(lines){
    const out=[];let cur=[];
    for(const l of lines){if(l.trim()===''){if(cur.length){out.push(cur.join(' '));cur=[];}}else cur.push(l.trim());}
    if(cur.length)out.push(cur.join(' '));
    return out;
  }
  function splitRow(l){
    const cells=[];let cur='';l=l.trim().replace(/^\|/,'').replace(/\|$/,'');
    for(let i=0;i<l.length;i++){if(l[i]==='\\'&&l[i+1]==='|'){cur+='|';i++;}else if(l[i]==='|'){cells.push(cur.trim());cur='';}else cur+=l[i];}
    cells.push(cur.trim());return cells;
  }
  function parse(text){
    text=text.replace(/<!--[\s\S]*?-->/g,'');
    const steps={};let st=null,sec=null;
    for(const line of text.split('\n')){
      let m;
      if((m=line.match(/^##\s+Step\s+(\d+)\.\s*(.*)$/))){st=steps[m[1]]={title:m[2].trim(),pre:[],secs:[]};sec=null;continue;}
      if(!st)continue;
      if(/^---\s*$/.test(line))continue;
      if((m=line.match(/^###\s+(.*)$/))){sec={name:m[1].trim(),lines:[]};st.secs.push(sec);continue;}
      (sec?sec.lines:st.pre).push(line);
    }
    for(const s of Object.values(steps)){
      const k=s.pre.map(l=>l.match(/^Article section:\s*(.*)$/)).find(Boolean);if(k)s.kicker=k[1].trim();
      s.real=[];
      for(const x of s.secs){
        const n=x.name.toLowerCase();
        if(n==='scenario')s.req=paras(x.lines);
        else if(n==='question')s.q=paras(x.lines).join(' ');
        else if(n==='options')s.opts=x.lines.map(l=>l.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*[—–-]\s*(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]);
        else if(n==='comparison'){const rows=x.lines.filter(l=>l.trim().startsWith('|')).map(splitRow).filter(r=>!r.every(c=>/^:?-{2,}:?$/.test(c)||c===''));
          if(rows.length)s.table={head:rows[0].slice(1),rows:rows.slice(1).map(r=>({name:r[0],cells:r.slice(1)}))};}
        else if(n==='takeaway')s.take=paras(x.lines);
        else s.real.push({title:x.name,items:paras(x.lines)});
      }
    }
    return steps;
  }
  const EMO=[['🟢','good'],['🟡','warn'],['🔴','bad']];
  function cell(v){for(const [e,c] of EMO)if(v.startsWith(e))return {cls:c,html:md(v.slice(e.length))};return {cls:'',html:md(v)};}
  const isAuto=v=>v.trim().toLowerCase()==='auto';
  function patchTable(tbl,t){
    const ths=tbl.querySelectorAll('thead th');
    t.head.forEach((h,j)=>{const th=ths[j+1];if(th&&!isAuto(h))th.innerHTML=md(h);});
    const tb=tbl.querySelector('tbody');if(!tb)return;
    const sel=[...ths].slice(1).map(th=>th.classList.contains('sel'));
    let trs=[...tb.querySelectorAll('tr')];
    t.rows.forEach((r,i)=>{
      let tr=trs[i];
      if(!tr){tr=document.createElement('tr');tr.innerHTML='<th></th>'+t.head.map((_,j)=>`<td class="${sel[j]?'sel':''}"></td>`).join('');tb.appendChild(tr);}
      tr.querySelector('th').innerHTML=md(r.name);
      const tds=tr.querySelectorAll('td');
      r.cells.forEach((v,j)=>{const td=tds[j];if(!td||isAuto(v))return;const c=cell(v);
        td.classList.remove('c-good','c-warn','c-bad');if(c.cls)td.classList.add('c-'+c.cls);td.innerHTML=c.html;});
    });
    trs.slice(t.rows.length).forEach(tr=>tr.remove());
  }
  function watchTable(tbl,t){
    const obs=new MutationObserver(()=>{obs.disconnect();try{patchTable(tbl,t);}finally{obs.observe(tbl,{childList:true,subtree:true});}});
    if(tbl.querySelector('tbody'))patchTable(tbl,t);
    obs.observe(tbl,{childList:true,subtree:true});
  }
  function apply(steps){
    for(const [n,s] of Object.entries(steps)){
      const sec=document.querySelector(`section.b-step[data-step="${n}"]`);if(!sec){console.warn('content.md: missing step',n);continue;}
      if(s.kicker)sec.querySelector('.b-kicker').textContent=s.kicker;
      if(s.title)sec.querySelector('h2').textContent=s.title;
      if(s.req){const rq=sec.querySelector('.b-req');const keep=[...rq.querySelectorAll('[id]')];rq.innerHTML=s.req.map(p=>`<p>${md(p)}</p>`).join('');keep.forEach(e=>rq.appendChild(e));}
      if(s.q)sec.querySelector('p.b-q').innerHTML=md(s.q);
      if(s.opts){const btns=sec.querySelectorAll('.b-opts .b-opt');
        if(btns.length!==s.opts.length)console.warn(`content.md: step ${n} ${s.opts.length} options, but the page has ${btns.length}`);
        s.opts.forEach(([b,sp],i)=>{const bt=btns[i];if(!bt)return;bt.querySelector('b').innerHTML=md(b);bt.querySelector('span').innerHTML=md(sp);});}
      const take=sec.querySelector('.b-take');
      if(take&&(s.take||s.real.length)){
        let h=(s.take||[]).map(p=>`<p>${md(p)}</p>`).join('');
        for(const r of s.real){h+=`<div class="b-real"><h4>${md(r.title)}</h4>`;
          for(const it of r.items){const m=it.match(/^\[([^\]]+)\]\((https?:[^)\s]+)\)$/);
            h+=m?`<a href="${esc(m[2])}" target="_blank" rel="noopener">${md(m[1])}</a>`:`<p>${md(it)}</p>`;}
          h+='</div>';}
        take.innerHTML=h;}
      const tbl=sec.querySelector('table.b-cmp');
      if(tbl&&s.table)watchTable(tbl,s.table);
    }
  }
  if(location.protocol==='file:')return;
  fetch('content.md',{cache:'no-store'}).then(r=>r.ok?r.text():null).then(t=>{if(t)apply(parse(t));}).catch(()=>{});
})();
