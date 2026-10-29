import { detailedPixels, pixelSvg } from './pixel-art.js';
// Original silhouettes are retained for compatibility, with a 32px detail pass.
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
  cone: ['............','.....c......','....ccc.....','....ccc.....','...ccccc....','...ccccc....','..ccccccc...','..ccccccc...','.ccccccccc..','............','............','............'],
  rectangle: ['............','..cccccccc..','..c......c..','..c......c..','..c......c..','..c......c..','..c......c..','..c......c..','..cccccccc..','............','............','............'],
  lever: ['.........s..','........ss..','.......ss...','......ss....','.....ss.....','....bsb.....','....bbb.....','....bbb.....','..sssssss...','..sssssss...','............','............'],
  wall: ['............','.ssssssssss.','.slllsllls.','.ssssssssss.','.slslllslls.','.ssssssssss.','.slllsllls.','.ssssssssss.','............','............','............','............'],
  key: ['............','...yyy......','..yy.yy.....','..y...y.....','..yy.yy.....','...yyy......','....y.......','....yyy.....','....y.......','....yyy.....','............','............'],
  fire: ['............','......y.....','.....yy.....','....ywy.....','...ywwo.....','...ywwoo....','..ywwwoo....','..owwwoo....','...oooo.....','....oo......','............','............'],
  bridge: ['............','............','.b........b.','.bbbbbbbbbb.','.bllllllllb.','.bbbbbbbbbb.','.bllllllllb.','.bbbbbbbbbb.','.b........b.','............','............','............'],
  noise: ['............','.......c....','....c...c...','..cc.c...c..','..cc.c...c..','..cc.c...c..','....c...c...','.......c....','............','............','............','............']
};
export const iconNames = { torch:'Torch',rock:'Rock',kid:'Kid',girl:'Girl',guard:'Guard',rat:'Rat',chandelier:'Chandelier',door:'Door',exit:'Exit',area:'Area of effect',sight:'Line Effect',cone:'Cone Effect',rectangle:'Rectangle Effect',lever:'Lever',wall:'Wall cube',key:'Key',fire:'Fire',bridge:'Bridge',noise:'Noise',cat:'Cat',sling:'Sling',dog:'Dog',crow:'Crow',lantern:'Lantern',chest:'Chest',barrel:'Barrel',crate:'Crate',rope:'Rope',ladder:'Ladder',trap:'Trap',bell:'Bell',square:'A · Square',triangle:'B · Triangle',hexagon:'C · Hexagon',circle:'D · Circle',diamond:'E · Diamond' };
export const iconVariants = {
  torch:{on:'On',off:'Off'}, rock:{intact:'Intact',broken:'Broken'},
  kid:{alive:'Alive',dead:'Dead'},girl:{alive:'Alive',dead:'Dead'},guard:{alive:'Alive',dead:'Dead'},rat:{alive:'Alive',dead:'Dead'},
  chandelier:{on:'On',off:'Off'},door:{closed:'Closed',open:'Open'},exit:{active:'Active',inactive:'Inactive'},
  area:{default:'Default'},sight:{default:'Default'},cone:{default:'Default'},rectangle:{default:'Default'},lever:{off:'Off',on:'On'},wall:{intact:'Intact',broken:'Broken'},
  key:{available:'Available',used:'Used'},fire:{on:'On',off:'Off'},bridge:{intact:'Intact',broken:'Broken'},noise:{on:'On',off:'Off'},
  cat:{sitting:'Sitting',prowling:'Prowling'},sling:{loaded:'Loaded',empty:'Empty'},dog:{standing:'Standing',sitting:'Sitting'},crow:{perched:'Perched',flying:'Flying'},lantern:{on:'Lit',off:'Unlit'},chest:{closed:'Closed',open:'Open'},barrel:{intact:'Intact',broken:'Broken'},crate:{intact:'Intact',broken:'Broken'},rope:{coiled:'Coiled',hanging:'Hanging'},ladder:{intact:'Intact',broken:'Broken'},trap:{armed:'Armed',sprung:'Sprung'},bell:{idle:'Idle',ringing:'Ringing'},
  square:{filled:'Filled',outline:'Outline'},triangle:{filled:'Filled',outline:'Outline'},hexagon:{filled:'Filled',outline:'Outline'},circle:{filled:'Filled',outline:'Outline'},diamond:{filled:'Filled',outline:'Outline'}
};
export const defaultVariant = name => Object.keys(iconVariants[name] || {default:'Default'})[0];
function variantPixels(name, variant) {
  let pixels=(Object.hasOwn(sprites,name) ? sprites[name] : sprites.rock).map(row=>[...row]);
  if(variant==='dead') {
    const fallen=Array.from({length:12},()=>Array(12).fill('.'));
    pixels.forEach((row,y)=>row.forEach((v,x)=>{if(v!=='.')fallen[9-Math.floor(x/2)][y]=v==='h'?'h':v==='b'?'b':'s';}));
    // A horizontal body and a small cross distinguish death at any color.
    fallen[3][9]='r';fallen[2][10]='r';fallen[4][10]='r';fallen[3][11]='r';pixels=fallen;
  } else if(variant==='off' && ['torch','chandelier','fire'].includes(name)) {
    pixels=pixels.map(row=>row.map(v=>['y','w','o'].includes(v)?'.':v));
    if(name==='fire')for(let x=3;x<9;x++)pixels[9][x]=x%2?'s':'b';
  } else if(name==='door' && variant==='open') {
    pixels=pixels.map((row,y)=>row.map((v,x)=>y>0&&y<9&&x>3&&x<9?'.':v));
    for(let y=2;y<9;y++)pixels[y][4]='l';
  } else if(name==='lever' && variant==='on') {
    pixels=pixels.map(row=>row.reverse());
  } else if(variant==='broken') {
    pixels=pixels.map((row,y)=>row.map((v,x)=>Math.abs(x-(5+(y%3)))<1?'.':v));
    pixels[10][3]='s';pixels[10][8]='s';
  } else if(variant==='inactive'||variant==='used'||(variant==='off'&&name==='noise')) {
    pixels=pixels.map(row=>row.map(v=>v==='.'?'.':'s'));
    for(let n=2;n<10;n++)pixels[n][11-n]='r';
  }
  return pixels;
}
export function sprite(name, color = '#9fb99a', variant = defaultVariant(name)) {
  if(!Object.hasOwn(iconNames,name))name='rock';
  if(!/^#[0-9a-f]{6}$/i.test(color))color='#9fb99a';
  const colors = { y:'#edc47c',w:'#fff0bb',o:'#d37d49',b:'#796047',s:'#8d9897',l:'#bbc1af',h:'#544941',p:'#c28e88',r:'#a97661',c:color,k:'#c7aa8b' };
  const base=Object.hasOwn(sprites,name)?variantPixels(name,variant).map(row=>row.map(v=>colors[v]||null)):null;
  return pixelSvg(detailedPixels(name,variant,color,base));
}
