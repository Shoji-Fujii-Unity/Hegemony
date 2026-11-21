/* スタブ DOM 起動テスト：ブラウザの無い場所で UI 一式を実際に走らせる
 *   node tests/stub-dom.js
 * 目的：描画・結線・オーバーレイのコードに実行時エラー（綴り間違い・未定義参照）が
 *       無いことを確認する。PixiJS/GSAP/Tone/Chart は読み込まないので、
 *       フォールバック経路（canvas2D 地図・DOM 盤面・WebAudio 合成）が通る。
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

/* ---------- 最小 DOM ---------- */
let ALL=[],BYID={},errors=[],step='(init)';
function mkEl(tag,attrs){
  attrs=attrs||{};
  const raw={tag:tag,attrs:attrs,children:[],style:{},dataset:{},_html:'',textContent:'',
             value:'',disabled:false,checked:false,width:0,height:0,title:'',
             cls:new Set((attrs.class||'').split(/\s+/).filter(Boolean)),
             lis:{},onclick:null,onchange:null,oninput:null,onsubmit:null,onkeydown:null};
  const api={
    tagName:(tag||'div').toUpperCase(),
    classList:{add:function(){for(const c of arguments) raw.cls.add(c);},
               remove:function(){for(const c of arguments) raw.cls.delete(c);},
               toggle:function(c,f){ if(f===undefined){ raw.cls.has(c)?raw.cls.delete(c):raw.cls.add(c);} else if(f) raw.cls.add(c); else raw.cls.delete(c); return raw.cls.has(c);},
               contains:function(c){return raw.cls.has(c);}},
    appendChild:function(c){ raw.children.push(c); return c; },
    removeChild:function(c){ const i=raw.children.indexOf(c); if(i>=0) raw.children.splice(i,1); return c; },
    remove:function(){ if(raw.parentNode) raw.parentNode.removeChild(api); },
    insertBefore:function(c){ raw.children.push(c); return c; },
    append:function(){ for(const c of arguments) raw.children.push(c); },
    setAttribute:function(k,v){ raw.attrs[k]=String(v); if(k==='id') reg(api); },
    getAttribute:function(k){ return (k in raw.attrs)?raw.attrs[k]:null; },
    hasAttribute:function(k){ return k in raw.attrs; },
    removeAttribute:function(k){ delete raw.attrs[k]; },
    addEventListener:function(t,f){ (raw.lis[t]=raw.lis[t]||[]).push(f); },
    removeEventListener:function(){},
    querySelector:function(s){ const r=api.querySelectorAll(s); return r[0]||null; },
    querySelectorAll:function(s){ return subEls(raw._html).filter(e=>matchSel(e,s)); },
    getBoundingClientRect:function(){ return {left:0,top:0,width:820,height:460,right:820,bottom:460,x:0,y:0}; },
    getContext:function(){ return ctx2d(); },
    toDataURL:function(){ return 'data:image/png;base64,'; },
    focus:function(){}, blur:function(){}, select:function(){},
    scrollIntoView:function(){}, closest:function(){ return null; },
    matches:function(s){ return matchSel(api,s); },
    contains:function(){ return false; },
    cloneNode:function(){ return mkEl(tag,attrs); },
    insertAdjacentHTML:function(pos,h){ raw._html+=h; scanIds(String(h),p); },
    getAnimations:function(){ return []; },
    animate:function(){ return {finished:Promise.resolve(),cancel:function(){}}; },
    getElementsByTagName:function(){ return []; },
    click:function(){ fire(api,'click'); },
    __raw:raw
  };
  const p=new Proxy(api,{
    get:function(t,k){
      if(k==='innerHTML') return raw._html;
      if(k==='id') return raw.attrs.id||'';
      if(k==='className') return raw.attrs.class||'';
      if(k==='children'||k==='childNodes') return raw.children;
      if(k in t) return t[k];
      if(k in raw) return raw[k];
      if(k==='parentNode') return raw.parentNode||null;
      return undefined;
    },
    set:function(t,k,v){
      if(k==='innerHTML'){ raw._html=String(v); raw.children=[]; scanIds(String(v),p); return true; }
      if(k==='className'){ raw.attrs.class=String(v); raw.cls=new Set(String(v).split(/\s+/).filter(Boolean)); return true; }
      if(k==='textContent'){ raw.textContent=String(v); raw._html=''; return true; }
      if(k in t){ t[k]=v; return true; }
      raw[k]=v; return true;
    },
    has:function(t,k){ return (k in t)||(k in raw)||k==='innerHTML'; }
  });
  if(attrs.id) reg(p);
  return p;
}
function reg(el){ const id=el.getAttribute('id'); if(id) BYID[id]=el; }
function ctx2d(){
  const store={canvas:{width:820,height:460}};
  return new Proxy(store,{
    get:function(t,k){
      if(k in t) return t[k];
      if(k==='measureText') return function(){ return {width:20}; };
      if(k==='createLinearGradient'||k==='createRadialGradient') return function(){ return {addColorStop:function(){}}; };
      if(k==='createPattern') return function(){ return null; };
      if(k==='getImageData') return function(){ return {data:new Uint8ClampedArray(4)}; };
      return function(){};
    },
    set:function(t,k,v){ t[k]=v; return true; }
  });
}
function attrsOf(tagText){
  const a={},rx=/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'|([\w:-]+)/g;let m;
  while((m=rx.exec(tagText))){
    if(m[1]) a[m[1]]=m[2];
    else if(m[3]) a[m[3]]=m[4];
    else if(m[5]&&!/^(\/|\w+$)/.test(m[5])===false) a[m[5]]='';
  }
  return a;
}
function subEls(s){
  const out=[];const rx=/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;let m;
  while((m=rx.exec(s))){ const t=m[1].toLowerCase(); if(t==='html'||t==='body') continue; out.push(mkEl(t,attrsOf(m[2]||''))); }
  return out;
}
function matchSel(e,sel){
  if(!sel) return false;
  return String(sel).split(',').some(function(s){
    s=s.trim();
    if(/[\s>]/.test(s.replace(/\[[^\]]*\]/g,''))){
      const parts=s.split(/[\s>]+/).filter(Boolean);
      return matchSel(e,parts[parts.length-1]);
    }
    if(s[0]==='#') return e.getAttribute('id')===s.slice(1);
    if(s[0]==='.') return (e.getAttribute('class')||'').split(/\s+/).indexOf(s.slice(1))>=0;
    let mm=s.match(/^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/);
    if(mm) return e.getAttribute(mm[1])!==null&&(mm[2]===undefined||e.getAttribute(mm[1])===mm[2]);
    return e.tagName.toLowerCase()===s.toLowerCase();
  });
}
function scanIds(s,parent){
  const rx=/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;let m;
  while((m=rx.exec(s))){
    const a=attrsOf(m[2]||'');
    const e=mkEl(m[1].toLowerCase(),a);
    if(parent&&parent.children) parent.children.push(e);
  }
}
/* HTML からの静的な要素生成（静的スクリプト内のタグのみ） */
(function(){
  const body=html.replace(/<script[\s\S]*?<\/script>/g,'');
  const SKIP={html:1,head:1,meta:1,link:1,style:1,title:1,base:1};
  const rx=/<(\/)?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/)?>/g;
  const stack=[];let m;
  while((m=rx.exec(body))){
    const closing=!!m[1],t=m[2].toLowerCase(),selfClose=!!m[4];
    if(SKIP[t]) continue;
    if(closing){
      for(let i=stack.length-1;i>=0;i--){
        if(stack[i].t!==t) continue;
        const fr=stack.splice(i,1)[0];
        if(fr.el.__raw) fr.el.__raw._html=body.slice(fr.inner,m.index);
        break;
      }
      continue;
    }
    const e=mkEl(t,attrsOf(m[3]||''));
    ALL.push(e);
    if(!selfClose) stack.push({t:t,el:e,inner:m.index+m[0].length});
  }
})();
const doc={
  readyState:'complete',title:'',
  body:mkEl('body'),head:mkEl('head'),documentElement:mkEl('html'),
  createElement:function(t){ return mkEl(String(t).toLowerCase()); },
  createTextNode:function(t){ return {nodeType:3,textContent:String(t)}; },
  createDocumentFragment:function(){ return mkEl('fragment'); },
  getElementById:function(id){ return BYID[id]||null; },
  querySelector:function(s){ const r=doc.querySelectorAll(s); return r[0]||null; },
  querySelectorAll:function(s){ return ALL.filter(function(e){ return matchSel(e,s); }); },
  addEventListener:function(t,f){ (docLis[t]=docLis[t]||[]).push(f); }
};
const docLis={};
function fire(el,type,ev){
  ev=ev||{};
  const h=el&&el['on'+type];
  if(typeof h==='function') h.call(el,Object.assign({type:type,target:el,preventDefault:function(){},stopPropagation:function(){},clientX:ev.clientX||400,clientY:ev.clientY||220,key:ev.key||'',which:ev.which||0},ev));
  const list=(el&&el.tagName)?null:null;
}
function fireAttr(id,type,ev){ const e=BYID[id]; if(!e) throw new Error('id が見つかりません: '+id);
  const h=e['on'+type]; if(typeof h!=='function') throw new Error(id+' に on'+type+' が結線されていません');
  h.call(e,Object.assign({type:type,target:e,preventDefault:function(){},stopPropagation:function(){},clientX:400,clientY:220,key:''},ev||{}));
}
/* ---------- window / storage / audio ---------- */
let seed=987654321;
function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
const timeouts=[];
const store=new Map();
const LS={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>[...store.keys()][i],get length(){return store.size;}};
const deep=new Proxy(function(){},{
  get:function(t,k){ if(k==='currentTime') return 0.25; if(k==='sampleRate') return 44100; if(k==='state') return 'running'; if(k==='then') return undefined; return deep; },
  apply:function(){ return deep; },
  construct:function(){ return deep; },
  set:function(){ return true; }
});
const winLis={};
const sandbox={
  console,document:doc,PIXI:undefined,gsap:undefined,Tone:undefined,Chart:undefined,
  Math:Object.assign(Math,{random:rnd}),JSON,Date,String,Number,Boolean,Array,Object,RegExp,Error,Promise,Map,Set,Uint8ClampedArray,Float32Array,isNaN,parseInt,parseFloat,
  localStorage:LS,sessionStorage:LS,
  requestAnimationFrame:function(cb){ if(rAF<40){ rAF++; try{ cb(performanceNow()); }catch(e){ capture('requestAnimationFrame',e); } } return rAF; },
  cancelAnimationFrame:function(){},
  setTimeout:function(cb){ timeouts.push(cb); return timeouts.length; },
  clearTimeout:function(){},setInterval:function(){ return 0; },clearInterval:function(){},
  devicePixelRatio:1,innerWidth:1180,innerHeight:780,scrollX:0,scrollY:0,
  addEventListener:function(t,f){ (winLis[t]=winLis[t]||[]).push(f); },
  removeEventListener:function(){},
  matchMedia:function(){ return {matches:false,addEventListener:function(){},addListener:function(){}}; },
  getComputedStyle:function(){ return {width:'820px',height:'460px',getPropertyValue:function(){return '8px';}}; },
  AudioContext:function(){ return deep; },
  Image:function(){ return mkEl('img'); },
  Path2D:function(){ return deep; },
  ResizeObserver:function(){ return {observe:function(){},disconnect:function(){}}; },
  navigator:{userAgent:'node',language:'ja-JP',maxTouchPoints:1},
  location:{href:'file:///index.html',hash:'',search:''},
  URL:{createObjectURL:function(){ return 'blob:x'; }},
  performance:{now:performanceNow},
  alert:function(m){ capture('alert:'+String(m).slice(0,60),null); },
  __errors:errors
};
function performanceNow(){ return 1000+timers++*16; }
let timers=0,rAF=0;
sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox;
function line2(e){
  var s=String((e && e.stack) || '');
  var p=s.split(String.fromCharCode(10));
  return p[1] || p[0] || '';
}
function capture(where,e){
  var msg='alert';
  if(e) msg=String(e.message)+' | '+line2(e);
  errors.push(where+' :: '+msg);
}
vm.createContext(sandbox);
/* ---------- 本体読み込み（boot() が走る） ---------- */
const blocks=[];const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m;
while((m=re.exec(html))){ if(m[1].indexOf('window.__lib')>=0) continue; blocks.push(m[1]); }
try{ vm.runInContext(blocks.join('\n;\n'),sandbox,{filename:'inline.js'}); }
catch(e){ console.log('✕ 起動に失敗: '+e.message+'\n'+e.stack); process.exit(1); }
const G=sandbox;
function run(label,fn){ step=label; try{ fn(); }catch(e){ capture(label,e); } }

/* ---------- 操作シミュレーション ---------- */
run('タイトル描画',function(){ if(typeof G.titleArtDraw==='function') G.titleArtDraw(); });
['en','zh','ja'].forEach(function(l){ run('言語切替 '+l,function(){ G.setLang(l); }); });
run('旗を挙げる（cao/normal）',function(){
  const diff=BYID.diffSel,diff2=BYID.diff;
  if(diff) diff.value='normal';
  fireAttr('startBtn','click');
});
run('本画面 初回描画',function(){ G.renderCamp(); });
run('全都市のパネル描画',function(){
  G.CITIES.forEach(function(c){ G.tapCity(c.k); });
});
run('全勢力リスト描画',function(){ G.renderPowers(); G.aliveStates().forEach(function(k){ G.renderPowers(k); }); });
run('助言',function(){ G.advice(); });
run('地図クリック（全マス）',function(){
  for(var y=0;y<G.MAP_H;y++) for(var x=0;x<G.MAP_W;x++) G.mapPick({clientX:x*(820/G.MAP_W)+2,clientY:y*(460/G.MAP_H)+2});
});
run('地図描画',function(){ G.drawMap(); G.layoutMap&&G.layoutMap(); });
run('内政 全種類',function(){
  const own=G.citiesOf(G.S.me);
  own.forEach(function(c,i){
    const opts=G.DEV_OPTS||['farms','town','walls','train','recruit','appease'];
    opts.forEach(function(o){ G.S.st[G.S.me].pol=4; G.S.st[G.S.me].gold=200; G.S.st[G.S.me].men=60; G.S.st[G.S.me].food=300; G.dev(c.k,o); });
    G.S.st[G.S.me].pol=4; G.appeaseAct(c.k); G.scoutAct(c.k);
  });
});
run('外交 全相手',function(){
  const me=G.S.me;
  G.aliveStates().forEach(function(k){
    if(k===me) return;
    const s=G.st(me); s.pol=6; s.gold=300; s.intel=4;
    run('使节 '+k,function(){ G.envoyAct(k); });
    run('离间 '+k,function(){ G.spyAct(k); });
  });
});
run('出兵準備オーバーレイ',function(){
  const mine=G.citiesOf(G.S.me);
  mine.forEach(function(c){
    const nb=G.neighbors(c.k);
    if(!nb.length) return;
    const target=G.findCity(nb[0].to);
    G.S.st[G.S.me].men=80;
    run('出兵 '+c.k, function(){ G.openArmySetup(c.k); });
    run('出征 '+c.k, function(){
      if(BYID.armyGold) BYID.armyGold.value='10';
      if(BYID.armyFood) BYID.armyFood.value='10';
      if(typeof G.openAttackSetup==='function') G.openAttackSetup(c.k,target.k);
      if(typeof G.confirmSetup==='function') G.confirmSetup();
    });
  });
});
run('戦闘 表示盤で手動運用',function(){
  const mine=G.citiesOf(G.S.me);
  let done=0,battleTurns=0,taps=0,skills=0;
  for(const c of mine){
    if(done>=2) break;
    for(const l of G.neighbors(c.k)){
      const to=G.findCity(l.to);
      if(!to||G.S.cities[to.k].owner===G.S.me) continue;
      const foe=G.S.cities[to.k].owner;
      if(!G.atWar(G.S.me,foe)) G.declareWar(G.S.me,foe,false);
      G.st(G.S.me).men=120; G.st(G.S.me).gold=400; G.st(G.S.me).pol=6;
      G.S.cities[c.k].garr=Math.max(G.S.cities[c.k].garr,40);
      run('出撃準備 '+c.k+'→'+to.k,function(){
        G.openAttackSetup(c.k,to.k);
        if(BYID.commitR) BYID.commitR.value='24';
        if(G.S.ui&&G.S.ui.pending) G.S.ui.pending.commit=Math.min(24,G.S.cities[c.k].garr-2);
        G.confirmSetup();
      });
      run('戦闘開始 '+c.k+'→'+to.k,function(){
        if(G.S.pendingBattle) G.startPendingBattle();
        if(!G.BT) G.startBattle(c.k,to.k,24,null);
      });
      if(!G.BT) throw new Error('戦闘が開始できません: '+c.k+'→'+to.k+' / '+G.canAttack(c.k,to.k));
      const B=G.BT;
      for(var guard=0;guard<24&&!B.over;guard++){
        run('盤面タップ',function(){
          for(var y=0;y<B.rows;y++) for(var x=0;x<B.cols;x++){ G.onBoardTap(x,y); taps++; }
        });
        run('戦法',function(){
          const bb=G.BT; if(!bb) return;
          const foes=bb.units.filter(function(u){ return u.side!==bb.meSide&&u.hp>0; });
          if(!foes.length) return;
          const tgt=foes[foes.length-1];
          if(bb.tac[bb.meSide]>=1&&G.useSkill(bb,bb.meSide,tgt.x,tgt.y)) skills++;
        });
        run('撤销',function(){ if(guard%4===0) G.undoBattle(); });
        run('ターン終了',function(){ G.playerEndTurn(); battleTurns++; });
        run('盤面再描画',function(){ if(G.BT) G.renderBattle&&G.renderBattle(); });
      }
      run('自動結着',function(){ if(G.BT) G.autoResolveBattle(); });
      run('結果画面の OK',function(){ if(BYID.resOk&&BYID.resOk.onclick) BYID.resOk.onclick(); });
      done++; break;
    }
  }
  if(!done) throw new Error('戦闘を 1 度も実行できませんでした');
  console.log('   （戦闘 '+done+' 戦 / 盤面タップ '+taps+' 回 / ターン '+battleTurns+' / 戦法 '+skills+' 回）');
  run('捕虜処理',function(){
    ['hire','free','kill'].forEach(function(f){ G.S.captiveQ=['xunyu']; G.captiveFate('xunyu',f); });
  });
});
run('戦績・国力グラフ',function(){
  ['cities','gold','food','men','prestige'].forEach(function(key){
    G.CHART_KEY=key;
    run('グラフ '+key,function(){ G.showChart(key); if(typeof G.chartSeries==='function') G.drawChart(key); });
  });
});
run('ヘルプ・イベント・終局画面',function(){
  G.showHelp();
  run('help 閉じる',function(){ if(BYID.closeHelp&&BYID.closeHelp.onclick) BYID.closeHelp.onclick(); });
  G.newCampaign('cao','normal',73);
  const defense=G.citiesOf('cao').reduce(function(found,city){
    if(found) return found;
    const enemy=G.neighbors(city.k).map(function(link){ return G.findCity(link.to); })
      .find(function(target){ return target&&G.S.cities[target.k].owner!=='cao'; });
    return enemy?{from:enemy.k,to:city.k}:null;
  },null);
  if(!defense) throw new Error('自動防衛テスト用の隣接敵都市がありません');
  G.S.pendingBattle={from:defense.from,to:defense.to,commit:24,att:G.S.cities[defense.from].owner};
  G.saveGame(true);
  G.S.notices=[{k:'ev_war',p:{s:'cao'}},{k:'ev_lost_city',p:{c:'xuchang'}}];
  G.showEvents([]);
  run('侵攻自動決着ボタン',function(){
    if(BYID.evAuto&&BYID.evAuto.onclick) BYID.evAuto.onclick();
    else throw new Error('自動決着ボタンがありません');
    const saved=JSON.parse(store.get(G.LS_S));
    if(G.S.pendingBattle||saved.pendingBattle) throw new Error('自動決着後も保留侵攻がセーブに残っています');
    if(!G.S.lastBattle||G.S.lastBattle.meSide!=='e'||!saved.lastBattle) {
      throw new Error('自動決着の結果が表示状態またはセーブに反映されていません');
    }
  });
  G.showGameOver({win:true});
  run('もう一度',function(){ if(BYID.endAgain&&BYID.endAgain.onclick) BYID.endAgain.onclick(); });
});
function keyDown(k){
  const ev={key:k,preventDefault:function(){},stopPropagation:function(){},target:{tagName:'BODY'}};
  [(winLis.keydown||[]).concat(docLis.keydown||[])].forEach(function(list){
    list.forEach(function(f){ try{ f(ev); }catch(e){ capture('keydown '+k,e); } });
  });
}
run('キーボード操作',function(){
  ['n','u','r','h','Escape','1','2','3','4','5','6','ArrowLeft','ArrowUp','a',' ','Enter'].forEach(keyDown);
  /* 矢印キーで本当に都市選択が動くか（おまじないで終わらせない） */
  if(G.S&&!G.S.over&&G.curScreen()==='scrCamp'){
    const before=G.S.ui.sel;
    let moved=false;
    ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].forEach(function(k){
      keyDown(k);
      if(G.S.ui.sel!==before) moved=true;
    });
    if(!moved) throw new Error('矢印キーで都市選択が動きません（before='+before+'）');
    keyDown('Enter');
    console.log('   （キー受信: 矢印 '+Object.keys(winLis).concat(Object.keys(docLis)).join('/')+' / 選択 '+before+' → '+G.S.ui.sel+'）');
  }
});
run('リサイズ',function(){
  sandbox.innerWidth=760; sandbox.innerHeight=1180;
  (winLis.resize||[]).forEach(function(f){ try{ f({}); }catch(e){ capture('resize',e); } });
  if(typeof G.resizeBoard==='function') G.resizeBoard();
});
run('保存と再開',function(){
  G.saveGame(true);
  run('プロファイル',function(){ G.saveProfile&&G.saveProfile(); });
  run('遅延タイマーの消化',function(){
    const list=timeouts.splice(0,Math.min(timeouts.length,120));
    list.forEach(function(cb,i){ try{ cb(); }catch(e){ capture('timeout#'+i,e); } });
  });
  run('タイトルへ戻る',function(){ G.showScreen('scrTitle'); G.buildTitle(); });
});
run('季節を 8 つ進行（UI 経由）',function(){
  for(var i=0;i<8;i++){
    if(G.S.over) break;
    if(G.S.pendingBattle) G.startPendingDefenseAuto();
    G.st(G.S.me).pol=Math.max(G.st(G.S.me).pol,4);
    G.endSeason();
    run('季節後の再描画 '+i,function(){ G.renderCamp(); if((G.S.notices||[]).length) G.showEvents([]); });
    run('季節ボタン',function(){ if(BYID.endSeason&&BYID.endSeason.onclick) { G.S.notices=[]; try{ BYID.endSeason.onclick(); }catch(e){ capture('endSeason btn',e); } } });
    run('グラフ更新',function(){ if(G.S&&!G.S.over) G.showChart('cities'); });
  }
});
run('三言語で主要画面',function(){
  ['zh','en','ja'].forEach(function(l){
    G.setLang(l);
    run('zh/en/ja 再描画 '+l,function(){ G.renderCamp(); G.renderPowers(); G.buildTitle(); G.showHelp(); if(G.BT) G.renderBattle(); });
  });
});
run('タイマー・RAF の残余消化',function(){
  rAF=0;
  const list=timeouts.splice(0,Math.min(timeouts.length,200));
  list.forEach(function(cb,i){ try{ cb(); }catch(e){ capture('tail timeout#'+i,e); } });
});

/* ---------- 報告 ---------- */
if(errors.length){
  console.log('✕ スタブ DOM 起動で '+errors.length+' 件の実行時エラー');
  console.log([...new Set(errors)].slice(0,40).map(e=>'  - '+e).join('\n'));
  process.exit(1);
}
console.log('✓ スタブ DOM 起動：起動→言語切替→内政→外交→出兵→戦闘→グラフ→保存→再開 まで無エラー');
console.log('  最終状態: '+G.aliveStates().length+' 国 / 自国 '+G.citiesOf(G.S.me).length+' 邑 / 季節 '+G.S.turn);
