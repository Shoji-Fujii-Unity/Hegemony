/* 戦闘バランスの探索：攻撃側勝利率・決着ターン・損耗を測る
 *   node tests/balance.js [試行数]
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const blocks=[];const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m;
while((m=re.exec(html))){ if(m[1].indexOf('window.__lib')>=0) continue; blocks.push(m[1]); }
const ctx=vm.createContext({console,setTimeout:()=>0,clearTimeout:()=>0,setInterval:()=>0,clearInterval:()=>0});
vm.runInContext(blocks.join('\n;\n'),ctx,{filename:'hegemony-inline.js'});
const G=ctx;

const N=parseInt(process.argv[2]||'160',10);
function clone(o){ return JSON.parse(JSON.stringify(o)); }

function bucket(v,list){
  for(const b of list) if(v>=b[0]&&v<b[1]) return b[2];
  return list[list.length-1][2];
}
const GB=[[0,0.8,'0.8倍未満'],[0.8,1.0,'0.8-1.0倍'],[1.0,1.25,'1.0-1.25倍'],[1.25,1.6,'1.25-1.6倍'],[1.6,2.3,'1.6-2.3倍'],[2.3,1e9,'2.3倍以上']];

function scenario(label,weather,forceSiege,wallForce){
  G.newCampaign('cao','normal',7);
  const saveCity=clone(G.S.cities),saveSt=clone(G.S.st),saveGen=clone(G.S.gen);
  const res={};
  const pairs=[['chenliu','puyang'],['xuchang','shouchun'],['luoyang','xinye'],['ye','chenliu'],
               ['pingyuan','puyang'],['xiangyang','jiangxia'],['changsha','yuzhang'],['hanzhong','shangyong'],
               ['changan','luoyang'],['wujun','lujiang'],['ji','nanpi'],['chengdu','jiameng']];
  for(const b of GB) res[b[2]]={n:0,attWin:0,turns:0,lossA:0,lossD:0,commit:0,reasons:{}};
  for(let i=0;i<N;i++){
    const pair=pairs[i%pairs.length];
    const fromK=pair[0],toK=pair[1];
    G.S.cities=clone(saveCity); G.S.st=clone(saveSt); G.S.gen=clone(saveGen);
    const owner=G.S.cities[toK].owner;
    if(wallForce!=null) G.S.cities[toK].walls=wallForce;
    const attacker=G.S.cities[fromK].owner;
    const mult=[0.5,0.65,0.8,1.0,1.2,1.5][i%6];
    const base=G.S.cities[toK].garr+G.S.cities[toK].walls*3;
    const commit=Math.max(8,Math.round(base*mult));
    G.S.weather=weather;
    const B=G.makeBattle(fromK,toK,commit,null,false);
    if(forceSiege!=null&&B.siege!==forceSiege) continue;
    G.simBattle(B);
    const ratio=(commit*G.cityQuality(fromK))/((G.S.cities[toK].garr+G.S.cities[toK].walls*3)*G.cityQuality(toK));
    const bk=res[bucket(ratio,GB)];
    bk.n++;
    if(B.over.winner==='att') bk.attWin++;
    bk.turns+=B.turn; bk.lossA+=B.losses.p; bk.lossD+=B.losses.e; bk.commit+=commit;
    bk.reasons[B.over.reason]=(bk.reasons[B.over.reason]||0)+1;
  }
  console.log('\n=== '+label+' ('+weather+', '+((G.__lastSiege)?'攻城':'')+') ===');
  console.log('兵力比            試行  攻撃側勝率  平均ターン  攻損耗/出兵  守損耗');
  for(const b of GB){
    const r=res[b[2]];
    if(!r.n){ console.log(b[2].padEnd(16)+'    0     -         -          -        -'); continue; }
    console.log(b[2].padEnd(16)+String(r.n).padStart(4)+
      String(Math.round(r.attWin/r.n*100)+'%').padStart(10)+
      String((r.turns/r.n).toFixed(1)).padStart(11)+
      String(Math.round(r.lossA/r.commit*100)+'%').padStart(12)+
      String(Math.round(r.lossD/r.n)).padStart(9)+
      '   '+Object.entries(r.reasons).map(k=>k[0]+':'+k[1]).join(' '));
  }
  return res;
}
scenario('通年（快晴・街の実wall）','clear');
scenario('降雨（火計に不利）','rain');
scenario('雪害（移動鈍る）','snow');
scenario('干魃（川を渡れる）','drought');
scenario('城壁3＝攻城戦のみ','clear',true);
scenario('城壁0-2＝野外戦のみ','clear',false);

/* AI同士の開戦頻度と滅亡速度 */
G.newCampaign('cao','normal',3);
let wars=0,destroyed=[];
function aiRun(me,diff,seedv,seasons,active){
  G.newCampaign(me,diff,seedv);
  let fellAt=null,annex=0;
  for(let i=0;i<seasons;i++){
    if(G.S.over) break;
    if(G.S.pendingBattle){
      const pb=G.S.pendingBattle; G.S.pendingBattle=null;
      const B=G.makeBattle(pb.from,pb.to,pb.commit,null,true); B.meSide='e';
      G.simBattle(B); G.applyBattleResult(B);
    }
    if(active){
      const s=G.st(G.S.me);
      s.pol=Math.max(s.pol,4); s.gold=Math.max(s.gold,80); s.men=Math.max(s.men,50); s.food=Math.max(s.food,240);
      G.citiesOf(G.S.me).forEach(function(c){ G.dev(c.k,'recruit'); G.dev(c.k,'farms'); });
    }
    const before=G.aliveStates().length;
    G.endSeason();
    const after=G.aliveStates().length;
    if(after<before) annex+=before-after;
    if(G.S.over&&!fellAt) fellAt=G.S.turn;
  }
  return {fellAt:fellAt,annex:annex,alive:G.aliveStates().length,turns:G.S.turn,own:G.citiesOf(G.S.me).length};
}
console.log(String.fromCharCode(10)+'=== 無為な player の生存（各 60 季節） ===');
[['cao','normal'],['liu','normal'],['sun','normal'],['cao','hard'],['liu','easy']].forEach(function(t){
  const r=aiRun(t[0],t[1],t[0].length*13+t[1].length*7,60,false);
  console.log('  '+t[0]+'/'+t[1]+'  破滅 '+(r.fellAt||('生存 '+r.own+'邑'))+' / 生き残り '+r.alive+' 国 / 併合 '+r.annex+' 国');
});
console.log(String.fromCharCode(10)+'=== 手当てをする player（各 60 季節） ===');
[['cao','normal'],['liu','normal'],['cao','easy']].forEach(function(t){
  const r=aiRun(t[0],t[1],91,60,true);
  console.log('  '+t[0]+'/'+t[1]+'  '+r.turns+' 季節 / 自国 '+r.own+' 邑 / 生き残り '+r.alive+' 国 / 併合 '+r.annex+' 国');
});
