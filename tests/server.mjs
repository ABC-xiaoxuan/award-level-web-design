import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function serve(port=0){
 const server=createServer(async(req,res)=>{
  try{
   const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/\/$/,'/index.html'));
   if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw new Error('Invalid path');
   const body=await readFile(path);
   const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};
   res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/plain','Content-Length':body.length,'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found')}
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const site=await serve(Number(process.argv[2]||4173));console.log(site.url)}
