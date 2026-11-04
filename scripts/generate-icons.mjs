import {writeFile,mkdir} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const crc32=bytes=>{let crc=-1;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;};
function chunk(type,bytes){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([name,bytes])));return Buffer.concat([length,name,bytes,crc]);}
const distance=(x,y,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
function png(size,maskable){
  const data=Buffer.alloc((size*4+1)*size),points=Array.from({length:180},(_,i)=>{const t=i/179;return [104+304*t,256-112*Math.sin(t*Math.PI*2)];});
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=(x+.5)*512/size,py=(y+.5)*512/size,index=y*(size*4+1)+1+x*4;
    const corner=Math.hypot(Math.max(112-px,0,px-400),Math.max(112-py,0,py-400));
    const alpha=maskable?1:Math.min(1,Math.max(0,(112-corner)*size/512+.5));
    let closest=999;for(let i=1;i<points.length;i++)closest=Math.min(closest,distance(px,py,...points[i-1],...points[i]));
    const blend=Math.min(1,Math.max(0,(15-closest)*size/512+.5));
    for(let c=0;c<3;c++)data[index+c]=Math.round([28,87,131][c]*(1-blend)+[213,237,255][c]*blend);
    data[index+3]=Math.round(alpha*255);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(new URL('../public/icons/',import.meta.url),{recursive:true});
for(const [size,maskable] of [[192,false],[512,false],[512,true]])await writeFile(new URL(`../public/icons/${maskable?'maskable-512':`icon-${size}`}.png`,import.meta.url),png(size,maskable));
console.log('Icone PWA create: 192, 512 e maskable.');
