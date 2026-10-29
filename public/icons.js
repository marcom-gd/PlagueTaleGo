// Original tiny pixel sprites, drawn as SVG rectangles for crisp scaling.
const sprites = {
  torch: ['.....yy.....','....ywy.....','....oroy....','.....oo.....','.....bb.....','.....bb.....','.....bb.....','.....bb.....','.....bb.....','.....bb.....','............','............'],
  rock: ['............','............','....ssss....','..ssllsss...','.slllllsss..','.sllllssss..','.sllssssss..','..sssssss...','............','............','............','............'],
  kid: ['....hhhh....','....hssh....','....ssss....','.....ss.....','....cbbc....','...ccbbcc...','...scbbcs...','....cccc....','....b..b....','....b..b....','...bb..bb...','............'],
  girl: ['....hhhh....','...hsssh....','...hsssh....','...hhshh....','....rrrr....','...rbrbrr...','...srrrsr...','....rrrr....','....r..r....','....b..b....','...bb..bb...','............'],
  guard: ['....ssss....','...slllls...','...ssbsss...','....kssk....','....srrs....','...slslls...','...kssssks..','....ssss.s..','....b..b.s..','....b..b.s..','...bb..bbs..','............'],
  rat: ['............','............','............','...h...h....','...hhhhh....','..hwhhhh....','..hhhhhhh...','...hhhhhhpp.','...p..p...p.','............','............','............'],
  chandelier: ['.....b......','.....b......','...bbybb....','...y.b.y....','...b.b.b....','..bbbbbbb...','.....b......','............','............','............','............','............'],
  door: ['..bbbbbbbb..','..bllllllb..','..blbbbbbb..','..blbbbbbb..','..blbbbbbb..','..blbbbbyb..','..blbbbbbb..','..blbbbbbb..','..blbbbbbb..','..bbbbbbbb..','............','............'],
  exit: ['............','....cccc....','....c.......','....c..c....','....cccccc..','....c..c....','....c.......','....cccc....','............','............','............','............'],
  area: ['............','....cccc....','..cc....cc..','..c......c..','.c...cc...c.','.c..cccc..c.','.c..cccc..c.','.c...cc...c.','..c......c..','..cc....cc..','....cccc....','............'],
  sight: ['............','.....c......','....ccc.....','...ccccc....','..ccccccc...','.ccccccccc..','.....c......','.....c......','....ccc.....','....cwc.....','....ccc.....','............'],
  lever: ['.........s..','........ss..','.......ss...','......ss....','.....ss.....','....bsb.....','....bbb.....','....bbb.....','..sssssss...','..sssssss...','............','............'],
  wall: ['............','.ssssssssss.','.slllsllls.','.ssssssssss.','.slslllslls.','.ssssssssss.','.slllsllls.','.ssssssssss.','............','............','............','............'],
  key: ['............','...yyy......','..yy.yy.....','..y...y.....','..yy.yy.....','...yyy......','....y.......','....yyy.....','....y.......','....yyy.....','............','............'],
  fire: ['............','......y.....','.....yy.....','....ywy.....','...ywwo.....','...ywwoo....','..ywwwoo....','..owwwoo....','...oooo.....','....oo......','............','............'],
  bridge: ['............','............','.b........b.','.bbbbbbbbbb.','.bllllllllb.','.bbbbbbbbbb.','.bllllllllb.','.bbbbbbbbbb.','.b........b.','............','............','............'],
  noise: ['............','.......c....','....c...c...','..cc.c...c..','..cc.c...c..','..cc.c...c..','....c...c...','.......c....','............','............','............','............']
};
export const iconNames = { torch:'Torch',rock:'Rock',kid:'Kid',girl:'Girl',guard:'Guard',rat:'Rat',chandelier:'Chandelier',door:'Door',exit:'Exit',area:'Area of effect',sight:'Line of sight',lever:'Lever',wall:'Wall cube',key:'Key',fire:'Fire',bridge:'Bridge',noise:'Noise' };
export function sprite(name, color = '#9fb99a') {
  const colors = { y:'#edc47c',w:'#fff0bb',o:'#d37d49',b:'#796047',s:'#8d9897',l:'#bbc1af',h:'#544941',p:'#c28e88',r:'#a97661',c:color,k:'#c7aa8b' };
  let out = '<svg viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges">';
  (Object.hasOwn(sprites,name) ? sprites[name] : sprites.rock).forEach((row,y) => [...row].forEach((v,x) => { if (colors[v]) out += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[v]}"/>`; }));
  return out + '</svg>';
}
