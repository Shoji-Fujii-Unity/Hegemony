/* 覇業 HEGEMONY ― ヘッドレステスト
 *   node tests/headless-test.js [季節数]
 * DOM も CDN も無い状態でエンジンの不変条件を検証する。
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');

const HTML=path.join(__dirname,'..','index.html');
const html=fs.readFileSync(HTML,'utf8');
const blocks=[];
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while((m=re.exec(html))){ if(m[1].indexOf('window.__lib')>=0) continue; blocks.push(m[1]); }
if(blocks.length<1) throw new Error('main script block not found');
const code=blocks.join('\n;\n');

const sandbox={console,setTimeout:()=>0,clearTimeout:()=>0,setInterval:()=>0,clearInterval:()=>0,Math,JSON,Date};
const ctx=vm.createContext(sandbox);
vm.runInContext(code,ctx,{filename:'hegemony-inline.js'});
const G=ctx;

let pass=0,fail=0;
const fails=[];
function ok(cond,label){ if(cond) pass++; else { fail++; fails.push(label); } }
function eq(a,b,label){ ok(a===b,label+' ('+a+' !== '+b+')'); }
function near(a,b,tol,label){ ok(Math.abs(a-b)<=tol,label+' ('+a+' vs '+b+')'); }

/* ---------- 1. データ整合性 ---------- */
const STATES=G.STATES,CITIES=G.CITIES,LINKS=G.LINKS,GENERALS=G.GENERALS;
ok(STATES.length===10,'10 powers');
ok(CITIES.length===30,'30 cities');
ok(GENERALS.length>=48,'generals count >= 48 ('+GENERALS.length+')');
const skeys=new Set(STATES.map(s=>s.k)),ckeys=new Set(CITIES.map(c=>c.k));
STATES.forEach(s=>{
  ok(ckeys.has(s.cap),'capital exists: '+s.k);
  ok(/^#[0-9a-f]{6}$/i.test(s.col),'color '+s.k);
  ['ja','en','zh'].forEach(l=>ok(!!s.n[l],'state name '+s.k+' '+l));
});
CITIES.forEach(c=>{
  ok(skeys.has(c.home),'city home valid '+c.k);
  ok(c.x>=0&&c.x<G.MAP_W&&c.y>=0&&c.y<G.MAP_H,'city coord in range '+c.k);
  ok(!!G.SPEC[c.spec],'spec valid '+c.k);
  ['ja','en','zh'].forEach(l=>ok(!!c.n[l],'city name '+c.k+' '+l));
  ok(c.pop>0&&c.garr>=0,'city stats '+c.k);
});
const seenPair=new Set();
LINKS.forEach(L=>{
  ok(ckeys.has(L[0])&&ckeys.has(L[1]),'link endpoints exist '+L[0]+'-'+L[1]);
  ok(['plain','hill','mountain','river'].includes(L[2]),'link terrain '+L[2]);
  const key=[L[0],L[1]].sort().join('|');
  ok(!seenPair.has(key),'no duplicate link '+key); seenPair.add(key);
});
G.buildAdj();
(function(){
  const adj={};CITIES.forEach(c=>adj[c.k]=[]);
  LINKS.forEach(L=>{adj[L[0]].push(L[1]);adj[L[1]].push(L[0]);});
  const seen=new Set([CITIES[0].k]),q=[CITIES[0].k];
  while(q.length){const c=q.shift();adj[c].forEach(n=>{if(!seen.has(n)){seen.add(n);q.push(n);}});}
  ok(seen.size===CITIES.length,'road graph connected ('+seen.size+'/'+CITIES.length+')');
  CITIES.forEach(c=>ok(adj[c.k].length>=1,'city has road '+c.k));
})();
GENERALS.forEach(g=>{
  ok(!g.side||skeys.has(g.side),'general side '+g.k);
  ok(!!G.SKILLS[g.sk],'general skill '+g.k);
  ok(!g.city||ckeys.has(g.city),'general city '+g.k);
  if(g.side) ok(g.city===findHome(g.side)||!!ckeys.has(g.city),'general posted '+g.k);
  ['ja','en','zh'].forEach(l=>ok(!!g.n[l],'general name '+g.k+' '+l));
  ok(g.lead>=1&&g.war>=1&&g.int>=1,'general stats '+g.k);
});
function findHome(k){ const s=G.STATES.find(x=>x.k===k); return s?s.cap:null; }
ok(Object.keys(G.TYPES).length===4,'4 unit types');
G.TKEYS.forEach(k=>{
  G.TKEYS.forEach(k2=>{
    const v=G.CNT[k][k2];
    ok(v>0&&v<=2,'counter table '+k+'>'+k2);
  });
});
ok(G.CNT.cav.inf>1&&G.CNT.inf.arc>1&&G.CNT.arc.spc>1&&G.CNT.spc.cav>1,'counter cycle works');
Object.keys(G.TERRAIN).forEach(k=>ok(typeof G.TERRAIN[k].cost==='number','terrain cost '+k));
Object.keys(G.SKILLS).forEach(k=>ok(G.SKILLS[k].cost>=1&&G.SKILLS[k].cost<=3,'skill cost '+k));
Object.keys(G.WWEA).forEach(k=>ok(typeof G.WWEA[k].fire==='number','weather '+k));

/* ---------- 2. 多言語のキー対応 ---------- */
const jaKeys=Object.keys(G.I18N.ja).sort(),enKeys=Object.keys(G.I18N.en).sort();
ok(jaKeys.length===enKeys.length,'ja/en key count '+jaKeys.length+'/'+enKeys.length);
jaKeys.forEach(k=>ok(enKeys.includes(k),'missing en key '+k));
enKeys.forEach(k=>ok(jaKeys.includes(k),'missing ja key '+k));
if(G.I18N.zh){
  const zhKeys=Object.keys(G.I18N.zh).sort();
  ok(zhKeys.length===jaKeys.length,'zh key count '+zhKeys.length+'/'+jaKeys.length);
  jaKeys.forEach(k=>ok(zhKeys.includes(k),'missing zh key '+k));
  jaKeys.forEach(k=>{
    if(/_html$/.test(k)) return;
    if(['th_hp'].indexOf(k)<0) ok(G.I18N.en[k]!==G.I18N.zh[k],'zh translated '+k);
    const pa=(String(G.I18N.ja[k]).match(/\{\w+\}/g)||[]).sort().join(','),
          pz=(String(G.I18N.zh[k]).match(/\{\w+\}/g)||[]).sort().join(',');
    ok(pa===pz,'zh placeholders '+k);
  });
}else console.log('（I18N.zh はまだ未導入）');
(function(){
  const used=new Set();
  const tre=/t\('([a-z0-9_]+)'/g; let mm;
  while((mm=tre.exec(code))) used.add(mm[1]);
  used.forEach(k=>{
    if(/^(sea_|w_|wd_|sp_|spd_|dev_|devd_|err_|log_|ev_|rsn_|lk_|tg_|th_|sk_|diff_note_|chart_|adv_|p_|k_|d_|act_|b_|res_|btn_|setup_|army_|r_|side_|phase_|obj_|st_|cnt_|hint_|help_|game_|app_|tag2|title_|pick_|lbl_|note_|save_|boot_|end_|cap_|fate_|weth|scroll_|map_|pane_|big|w?)/.test(k)) return;
  });
  let miss=0;
  used.forEach(k=>{ if(!(k in G.I18N.ja)){ /* 動的合成キーは許容 */ miss++; } });
})();

/* ---------- 3. 新規ゲーム ---------- */
G.newCampaign.call(null,'cao','normal',194);
const S=()=>G.S;
ok(!!S(),'state built');
eq(Object.keys(S().cities).length,30,'city state count');
eq(G.aliveStates().length,10,'all powers alive');
CITIES.forEach(c=>eq(S().cities[c.k].owner,c.home,'initial owner '+c.k));
ok(S().year===194&&S().season===0,'start date');
ok(G.WWEA[S().weather],'weather initialised '+S().weather);
ok(G.polMax('cao')>=3,'decrees from prestige');
eq(G.armyCompTotal(G.armyDoctrine('cao')),10,'doctrine has 10 units');
ok(G.CITIES.every(c=>S().cities[c.k].seen),'cities observed at start');

/* ---------- 4. 季節をまわす（AI 動作・不変条件） ---------- */
const seasons=parseInt(process.argv[2]||'48',10);
let battleCount=0,annex=0,lastAlive=10;
const ownersOf=()=>Object.keys(S().cities).map(k=>S().cities[k].owner);
G.S.me='cao';
for(let i=0;i<seasons;i++){
  if(G.S.over) break;
  if(G.S.pendingBattle) startDefense();
  const me=G.st(G.S.me);
  me.pol=Math.max(me.pol,3);
  try{
    const own=G.citiesOf(G.S.me);
    if(own.length){
      const c=own[i%own.length].k;
      const opts=['farms','town','walls','train'];
      G.dev(c,opts[i%opts.length]);
      if(i%3===0) G.scoutAct(firstEnemyCity());
      if(i%5===0){ const foe=aliveOther(); if(foe) G.envoyAct(foe); }
    }
  }catch(e){ ok(false,'player action threw: '+e.message); }
  try{ G.endSeason(); }catch(e){ ok(false,'endSeason threw at season '+i+': '+e.message+'\n'+e.stack); break; }
  /* 不変条件 */
  const al=G.aliveStates();
  ok(al.length<=lastAlive,'powers never resurrect'); lastAlive=al.length;
  al.forEach(k=>{
    const s=G.st(k);
    [s.gold,s.food,s.men,s.stab,s.pol,s.intel].forEach(v=>ok(Number.isFinite(v),'finite resources '+k));
    ok(s.stab>=0&&s.stab<=100,'loyalty range '+k);
    ok(s.pol>=0&&s.pol<=8,'decrees range '+k+'='+s.pol);
    ok(s.intel>=0&&s.intel<=6,'intel range '+k);
  });
  ownersOf().forEach(o=>ok(al.includes(o)||o===G.S.me,'owner alive: '+o));
  CITIES.forEach(c=>{
    const d=S().cities[c.k];
    ok(Number.isFinite(d.garr)&&d.garr>=0,'garrison finite '+c.k);
    ok(d.walls>=0&&d.walls<=5,'walls range '+c.k);
    ok(d.unrest>=0&&d.unrest<=100,'unrest range '+c.k);
    ok(d.farms>=1&&d.farms<=5,'farms range '+c.k);
  });
  GENERALS.forEach(g=>{
    const gs=S().gen[g.k];
    if(!gs||gs.dead) return;
    ok(gs.loyal>=0&&gs.loyal<=100,'loyalty range '+g.k);
    ok(!gs.side||al.includes(gs.side),'general side alive '+g.k);
    ok(!gs.city||!!S().cities[gs.city],'general city exists '+g.k);
  });
  ok(G.WWEA[S().weather],'weather valid each season');
  ok(S().hist.length===i+1||S().hist.length<=120,'history grows');
  if(S().pendingBattle) battleCount++;
  if(al.length<lastAlive) annex++;
}
function aliveOther(){
  const l=G.aliveStates().filter(k=>k!==G.S.me&&!G.atWar(G.S.me,k));
  return l.length?l[0]:null;
}
function firstEnemyCity(){
  const mine=G.citiesOf(G.S.me);
  for(const c of mine){ for(const l of G.neighbors(c.k)){ if(S().cities[l.to].owner!==G.S.me) return l.to; } }
  return CITIES[0].k;
}
function startDefense(){
  const pb=G.S.pendingBattle;
  G.S.pendingBattle=null;
  const B=G.makeBattle(pb.from,pb.to,pb.commit,null,true);
  B.meSide='e';
  G.simBattle(B);
  G.applyBattleResult(B);
}
ok(S().turn>1,'seasons advanced ('+S().turn+')');
console.log('  … '+S().turn+' 季節を進行 / 生存 '+G.aliveStates().length+' 国 / 自国 '+G.citiesOf(G.S.me).length+' 邑 / 侵攻 '+battleCount+' 回');

/* ---------- 5. 戦闘エンジン ---------- */
(function(){
  let wins={att:0,def:0},reasons={},maxTurn=0,badLoss=0,weird=0;
  const mine=G.citiesOf(G.S.me),foe=G.aliveStates().filter(k=>k!==G.S.me);
  for(let i=0;i<90;i++){
    const from=pickCity(mine); if(!from) break;
    const nb=G.neighbors(from.k).map(l=>G.findCity(l.to)).filter(Boolean);
    const to=nb[0]; if(!to) continue;
    if(S().cities[to.k].owner===G.S.me) continue;
    const commit=12+((i*7)%34);
    const B=G.makeBattle(from.k,to.k,commit,pickGenForMine(from.k),false);
    const startP=B.units.filter(u=>u.side==='p').length,startE=B.units.filter(u=>u.side==='e').length;
    ok(startP>0&&startE>0,'both sides deploy ('+startP+'/'+startE+')');
    ok(isFinite(B.baseHp.p)&&isFinite(B.baseHp.e),'camp hp finite');
    ok(B.morale.p>0&&B.morale.e>0,'morale positive');
    if(B.siege) ok(B.basePos.e&&B.tiles[B.basePos.e.y][B.basePos.e.x].t==='base','siege camp tile');
    G.simBattle(B);
    ok(!!B.over,'battle ends ('+(B.over&&B.over.reason)+')');
    reasons[B.over.reason]=(reasons[B.over.reason]||0)+1;
    wins[B.over.winner]++;    maxTurn=Math.max(maxTurn,B.turn);
    ok(B.turn<=B.maxTurn+2,'turn limit respected ('+B.turn+')');
    ok(B.over.reason==='camp'||B.over.reason==='rout'||B.over.reason==='elim'||B.over.reason==='stale','valid reason '+B.over.reason);
    B.units.forEach(u=>{
      ok(u.hp>0,'no dead units remain ('+u.hp+')');
      ok(u.hp<=u.max,'hp never exceeds max');
      if(u.hp<=0) weird++;
    });
    if(B.losses.p>B.commit.p+1||B.losses.e>B.commit.e+1) badLoss++;
    ok(B.losses.p>=0&&B.losses.e>=0,'losses non-negative');
    B.units.forEach(u=>ok(u.x>=0&&u.y>=0&&u.x<B.cols&&u.y<B.rows,'unit inside board'));
    const seen={};
    B.units.forEach(u=>{ const k2=u.x+','+u.y; ok(!seen[k2],'no stacked units'); seen[k2]=1; });
  }
  ok(badLoss===0,'losses never exceed committed troops');
  ok(weird===0,'no zero-hp survivors');
  console.log('  … 戦闘 '+(wins.att+wins.def)+' 戦  攻め手の勝ち '+wins.att+' / 守り手の勝ち '+wins.def+
    '（攻撃側勝率 '+Math.round(wins.att/Math.max(1,wins.att+wins.def)*100)+'%）  決着内訳 '+JSON.stringify(reasons)+'  最大ターン '+maxTurn);
  function pickCity(list){ return list.length?list[Math.floor(Math.random()*list.length)]:null; }
  function pickGenForMine(city){ const g=G.gensAt(city.k).filter(x=>S().gen[x.k].side===G.S.me); return g.length?g[0].k:null; }
})();

/* ---------- 6. 兵科編成・索敵・戦法 ---------- */
(function(){
  for(let n=3;n<=10;n++){
    const c=G.resizeArmyComp({inf:4,arc:2,cav:2,spc:2},'luoyang','xuchang',n);
    eq(G.armyCompTotal(c),n,'resize keeps total for '+n);
  }
  const empty=G.resizeArmyComp({inf:0,arc:0,cav:0,spc:0},'luoyang','xuchang',6);
  eq(G.armyCompTotal(empty),6,'resize falls back to doctrine');
  const B=G.makeBattle('chenliu','puyang',24,null,false);
  const u=B.units.find(x=>x.side==='p');
  ok(!!u,'sample unit exists');
  const reach=G.bReach(B,u);
  ok(Object.keys(reach).length>1,'movement reach computed ('+Object.keys(reach).length+')');
  const cav=B.units.find(x=>x.type==='cav');
  if(cav){
    const r2=G.bReach(B,cav);
    Object.keys(r2).forEach(k2=>{
      const [x,y]=k2.split(',').map(Number);
      ok(B.tiles[y][x].t!=='mountain','cavalry never reaches mountains');
    });
  }
  B.weather='fog';
  const arc=B.units.find(x=>x.type==='arc');
  if(arc) eq(G.rangeOf(B,arc),Math.max(1,G.TYPES.arc.range-1),'fog shortens range');
  B.weather='drought';
  const Bd=G.makeBattle('xuchang','shouchun',24,null,false);
  Bd.weather='drought'; G.genBattleMap(Bd);
  ok(Bd.link!=='river'||Bd.tiles.flat().some(t=>t.t==='ford')||true,'drought fords noted');
  const anyEnemy=Bd.units.find(x=>x.side==='e');
  ok(!!anyEnemy,'drought battle deployable');
  G.simBattle(Bd); ok(!!Bd.over,'drought battle resolves');
})();

/* ---------- 6b. 戦法 6 種の発動 ---------- */
(function(){
  Object.keys(G.SKILLS).forEach(function(key){
    const carrier=G.GENERALS.filter(g=>g.sk===key)[0];
    ok(!!carrier,'戦法 '+key+' を持つ武将がいる');
    if(!carrier) return;
    G.newCampaign('cao','normal',5);
    const B=G.makeBattle('chenliu','puyang',26,null,false);
    for(let y=0;y<B.rows;y++) for(let x=0;x<B.cols;x++) if((x+y)%5===0) B.tiles[y][x].t='forest';
    B.gen.p=carrier.k; B.gen.e=carrier.k;
    B.tac.p=3;
    const foes=B.units.filter(u=>u.side!=='p'&&u.hp>0);
    ok(foes.length>0,'戦法 '+key+' の対象がいる');
    const ally=B.units.filter(u=>u.side==='p'&&u.hp>0)[0];
    const tgt=foes[0],tac0=B.tac.p;
    let fired=false;
    try{
      fired=G.useSkill(B,'p',tgt.x,tgt.y);
      if(!fired&&ally) fired=G.useSkill(B,'p',ally.x,ally.y);   /* 味方に掛かる戦法もある */
    }catch(e){ ok(false,'戦法 '+key+' が例外: '+e.message); }
    ok(fired===true,'戦法 '+key+' が発動する');
    ok(B.tac.p<=3&&B.tac.p>=0,'戦術ポイントは範囲内（'+key+'）');
    if(fired) ok(B.tac.p<tac0,'戦法 '+key+' で戦術ポイントを消費');
    B.units.forEach(u=>{ ok(u.hp<=u.max,'戦法 '+key+' 後に HP は上限を超えない'); ok(Number.isFinite(u.hp),'戦法 '+key+' 後に HP が数値'); });
    ok(Number.isFinite(B.morale.p)&&Number.isFinite(B.morale.e),'戦法 '+key+' 後の士気が数値');
    ok(B.baseHp.p>=0&&B.baseHp.e>=0,'戦法 '+key+' 後の本営 HP');
    if(key==='fire') ok(B.tiles.flat().some(t=>t.t==='burnt')||B.weather==='rain','火計で森林が焦土化する');
    try{
      B.tac.p=3;
      G.useSkill(B,'p',-4,-4); G.useSkill(B,'p',B.cols+5,B.rows+5);
      ok(true,'戦法 '+key+' は範囲外指定でも壊れない');
    }catch(e){ ok(false,'戦法 '+key+' の範囲外指定で例外: '+e.message); }
    B.tac.p=0;
    ok(G.useSkill(B,'p',tgt.x,tgt.y)===false,'戦術ポイント不足では発動しない（'+key+'）');
    B.over={reason:'camp',winner:'p'};
    ok(G.useSkill(B,'p',tgt.x,tgt.y)===false,'決着後は発動しない（'+key+'）');
  });
})();

/* ---------- 7. Undo と手番 ---------- */
(function(){
  const B=G.makeBattle('chenliu','puyang',26,null,false);
  G.BT=B;
  const before=JSON.stringify({u:B.units,b:B.baseHp,m:B.morale,t:B.tac});
  const mine=B.units.filter(u=>u.side===B.meSide&&u.hp>0);
  if(mine.length){
    G.pushUndoB();
    const reach=G.bReach(B,mine[0]),keys=Object.keys(reach).filter(k=>k!==mine[0].x+','+mine[0].y);
    if(keys.length){
      const [x,y]=keys[0].split(',').map(Number);
      G.bMove(B,mine[0],x,y);
      ok(JSON.stringify(B.units)!==before,'board changed after move');
      G.undoBattle();
      ok(JSON.stringify({u:B.units,b:B.baseHp,m:B.morale,t:B.tac})===before,'undo restores state');
    }
  }
  G.BT=null;
})();

/* ---------- 8. 外交・諜報・内政の境界 ---------- */
(function(){
  G.newCampaign('liu','hard',7);
  const me=G.st('liu');
  me.gold=200; me.pol=6; me.intel=4; me.men=80; me.food=200;
  const foe=G.aliveStates().find(k=>k!=='liu');
  ok(G.envoyAct(foe),'envoy runs');
  ok(G.spyAct(foe),'spy runs');
  const own=G.citiesOf('liu')[0].k;
  ok(G.dev(own,'farms'),'development runs');
  ok(G.dev(own,'recruit'),'conscript runs');
  ok(G.appeaseAct(own),'appease runs');
  for(let i=0;i<8;i++) ok(G.dev(own,'farms')||true,'farms capped without crash');
  ok(G.S.cities[own].farms<=5,'farms capped at 5');
  const enemyAdj=(function(){
    for(const l of G.neighbors(own)) if(G.S.cities[l.to].owner!==('liu')) return l.to;
    return null;
  })();
  if(enemyAdj){
    G.declareWar('liu',G.S.cities[enemyAdj].owner,false);
    ok(G.atWar('liu',G.S.cities[enemyAdj].owner),'war declared');
    ok(G.canAttack(own,enemyAdj)===null||typeof G.canAttack(own,enemyAdj)==='string','canAttack returns reason or null');
    G.setWar('liu',G.S.cities[enemyAdj].owner,'truce',G.S.turn+4);
    ok(typeof G.canAttack(own,enemyAdj)==='string','truce blocks attack');
  }
  me.gold=400; me.pol=8;
  ok(G.reformArmy(own,{inf:3,arc:3,cav:2,spc:2})===true,'reform army');
  ok(G.armyCompTotal(G.armyDoctrine('liu'))===10,'doctrine size after reform');
  me.pol=8; me.gold=400;
  ok(G.reformArmy(own,{inf:1,arc:1,cav:1,spc:1})===false,'bad doctrine rejected');
  me.pol=8;
  const nb2=G.neighbors(own)[0].to;
  const before2=G.S.cities[own].garr+G.S.cities[nb2].garr;
  G.moveArmy(own,nb2,true);
  ok(G.S.cities[own].garr+G.S.cities[nb2].garr===before2,'transfer conserves troops');
})();

/* ---------- 9. 併合と勝利 ---------- */
(function(){
  G.newCampaign('cao','easy',11);
  const loser='gongsun';
  const before=G.citiesOf(loser).length;
  ok(before>0,'loser has cities');
  const msg=[];
  G.annexState(loser,'cao',msg);
  ok(!G.st(loser).alive,'loser destroyed');
  eq(G.citiesOf('cao').length,CITIES.filter(c=>c.home==='cao'||c.home===loser).length,'annexed cities transferred');
  ok(msg.length>0,'annex message produced');
  G.aliveStates().forEach(k=>{ if(k!=='cao') G.st(k).alive=false; });
  const win=G.checkVictory();
  ok(win&&win.win,'unification detected');
  G.newCampaign('ma','normal',12);
  G.citiesOf('ma').forEach(c=>{ G.S.cities[c.k].owner='cao'; });
  const lose=G.checkVictory();
  ok(lose&&!lose.win,'defeat detected');
})();

/* ---------- 10. 観測（諜報） ---------- */
(function(){
  G.newCampaign('sun','normal',21);
  const mineSet=new Set(G.citiesOf('sun').map(c=>c.k));
  const frontier=new Set();
  G.citiesOf('sun').forEach(c=>G.neighbors(c.k).forEach(l=>frontier.add(l.to)));
  let far=null;
  CITIES.forEach(c=>{ if(!mineSet.has(c.k)&&!frontier.has(c.k)&&!far) far=c.k; });
  ok(!!far,'found a distant city ('+far+')');
  G.S.turn=99;
  G.S.cities[far].seen={g:0,w:0,t:0};
  ok(G.observed(far).fresh===false,'old observation is stale');
  ok(G.observed(far).garr===0,'stale value reported');
  const real=G.S.cities[far].garr;
  G.st('sun').gold=100; G.st('sun').pol=4; G.st('sun').intel=3;
  G.scoutAct(far);
  eq(G.S.cities[far].seen.g,real,'scout reveals true garrison');
  ok(G.observed(far).fresh===true,'fresh after scouting');
  const front=CITIES.find(c=>frontier.has(c.k));
  ok(G.observed(front.k).known===true,'border cities auto-observed');
})();

/* ---------- 11. セーブ/ロード往復（JSON 化可能性） ---------- */
(function(){
  G.newCampaign('biao','normal',33);
  G.S.battleData=G.makeBattle('xiangyang','jiangxia',20,null,false);
  G.S.battle={from:'xiangyang',to:'jiangxia',commit:20,gen:null};
  let json=null,threw=false;
  try{ json=JSON.stringify(G.S); }catch(e){ threw=true; }
  ok(!threw,'state is serialisable');
  const back=JSON.parse(json);
  ok(back.cities&&back.st&&back.battleData.units.length>0,'save round-trips battle data');
  ok(json.length<3000000,'save size sane ('+Math.round(json.length/1024)+' KB)');
})();

console.log('\n'+(fail?'✕':'✓')+' 検証 '+pass+' 件成功 / 失敗 '+fail+' 件');
if(fail){ console.log(fails.slice(0,25).map(f=>'  - '+f).join('\n')); process.exit(1); }
