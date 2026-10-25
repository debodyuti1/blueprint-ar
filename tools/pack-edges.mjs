import fs from 'fs';
const a = new Float32Array(fs.readFileSync(process.argv[2]).buffer.slice(0));
let min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9];
for (let i=0;i<a.length;i+=3) for (let k=0;k<3;k++){min[k]=Math.min(min[k],a[i+k]);max[k]=Math.max(max[k],a[i+k]);}
// spire axis: mean x,z of points above 95% height
let sx=0,sz=0,c=0; for (let i=0;i<a.length;i+=3) if (a[i+1]>max[1]*0.9){sx+=a[i];sz+=a[i+2];c++;}
console.log('min',min,'max',max,'spire axis',sx/c,sz/c, 'n pts', c);
// segments sorted by min y (so a draw range could be used)
const segs=[]; for (let i=0;i<a.length;i+=6) segs.push(i);
segs.sort((p,q)=>Math.min(a[p+1],a[p+4])-Math.min(a[q+1],a[q+4]));
const q = new Uint16Array(a.length);
let o=0; for (const s of segs) for (let j=0;j<6;j++){const k=j%3; q[o++]=Math.round((a[s+j]-min[k])/(max[k]-min[k])*65535);}
fs.writeFileSync(process.argv[3], Buffer.from(q.buffer));
fs.writeFileSync(process.argv[3]+'.json', JSON.stringify({min,max,axis:[sx/c,sz/c],segments:a.length/6}));
