import {spawn} from 'node:child_process';
import {serve} from './server.mjs';
const site=await serve();
const entries=[
  ['index.html','#work,#install'],
  ['examples/qimu-coffee.html','#beans,#process,#subscribe'],
  ['examples/jian-studio.html','#work,#principle,#contact'],
  ['examples/echo-app.html','#how,#features,#download'],
];
try {
  for(const [file,sections] of entries){
    const args=['skills/award-level-web-design/scripts/shoot.mjs',`${site.url}/${file}`,'--audit','--axe','--widths','375,768,1280,1920','--sections',sections,'--out',`verification/shoot-${file.split('/').at(-1).replace('.html','')}`];
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{stdio:'inherit'});
      child.on('error',reject);
      child.on('exit',code=>code===0?resolve():reject(new Error(`${file}: shoot exited ${code}`)));
    });
  }
} finally {await site.close()}
