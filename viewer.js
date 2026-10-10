/* Self-contained WebGL garment viewer: curved front/back surfaces and sewn edge geometry. */
const assetCache=new Map();
function loadGarmentImage(url){
 if(!assetCache.has(url))assetCache.set(url,new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load '+url));image.src=url;}));
 return assetCache.get(url);
}
function normalizeGarment(image){
 const probe=document.createElement('canvas');probe.width=probe.height=512;
 const ctx=probe.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,512,512);
 const rgba=ctx.getImageData(0,0,512,512).data;
 let left=512,top=512,right=0,bottom=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(rgba[(y*512+x)*4+3]>90){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<=left)throw Error('Empty garment texture');
 const width=right-left+1,height=bottom-top+1,scale=476/Math.max(width,height);
 const atlas=document.createElement('canvas');atlas.width=atlas.height=512;
 const out=atlas.getContext('2d',{willReadFrequently:true});
 out.drawImage(image,left/512*image.width,top/512*image.height,width/512*image.width,height/512*image.height,(512-width*scale)/2,(512-height*scale)/2,width*scale,height*scale);
 return {atlas,mask:out.getImageData(0,0,512,512).data};
}
function garmentGeometry(mask,N=128){
 const data=[],valid=new Uint8Array(N*N);
 function depth(u,v){const x=(u-.5)*2,y=(.5-v)*2;const body=Math.exp(-Math.pow(x*1.9,4));return .042+.15*body*(.78+.22*Math.cos(y*2))+.011*Math.sin(x*27+y*9)*body+.009*Math.sin(y*30+x*7);}
 function point(u,v,side){return [(u-.5)*2.5,(.5-v)*2.65,depth(u,v)*side];}
 function push(u,v,side,normal){
  const p=point(u,v,side);
  if(!normal){const e=.001,dx=(depth(u+e,v)-depth(u-e,v))/(2*e*2.5),dy=(depth(u,v-e)-depth(u,v+e))/(2*e*2.65);normal=[-dx*side,-dy*side,side];}
  data.push(...p,...normal,side>0?u:1-u,v,side>0?0:1);
 }
 function alpha(u,v){const x=Math.max(0,Math.min(511,Math.round(u*511))),y=Math.max(0,Math.min(511,Math.round(v*511)));return mask[(y*512+x)*4+3];}
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)valid[y*N+x]=alpha((x+.5)/N,(y+.5)/N)>110?1:0;
 const has=(x,y)=>x>=0&&y>=0&&x<N&&y<N&&valid[y*N+x];
 function surface(a,b,c,side){for(const p of side>0?[a,b,c]:[a,c,b])push(p[0],p[1],side);}
 function edge(a,b,normal){
  for(const [p,side] of [[a,1],[b,1],[b,-1],[a,1],[b,-1],[a,-1]]){
   const pos=point(p[0],p[1],side);data.push(...pos,...normal,p[0],p[1],2);
  }
 }
 for(let y=0;y<N;y++)for(let x=0;x<N;x++)if(has(x,y)){
  const a=[x/N,y/N],b=[(x+1)/N,y/N],c=[(x+1)/N,(y+1)/N],d=[x/N,(y+1)/N];
  for(const side of [1,-1]){surface(a,c,b,side);surface(a,d,c,side);}
  if(!has(x,y-1))edge(a,b,[0,1,0]);
  if(!has(x+1,y))edge(b,c,[1,0,0]);
  if(!has(x,y+1))edge(c,d,[0,-1,0]);
  if(!has(x-1,y))edge(d,a,[-1,0,0]);
 }
 return new Float32Array(data);
}
function rotationMatrix(yaw,pitch){
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
 return new Float32Array([cy,sx*sy,-cx*sy,0, 0,cx,sx,0, sy,-sx*cy,cx*cy,0, 0,0,0,1]);
}
function perspectiveMatrix(aspect,distance){
 const f=1/Math.tan(.42),near=.1,far=30;
 return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)/(near-far),-1, 0,0,2*far*near/(near-far),0]);
}
class GarmentViewer{
 constructor(canvas,{interactive=false,auto=true,onChange=()=>{},visible=()=>true}={}){
  this.canvas=canvas;this.interactive=interactive;this.auto=auto;this.onChange=onChange;this.visible=visible;this.yaw=-.2;this.pitch=-.035;this.zoom=1;this.sequence=0;this.ready=false;
  this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!this.gl)return new SoftwareGarmentViewer(canvas,{interactive,auto,onChange,visible});
  const gl=this.gl;
  const vs=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;attribute float aFace;uniform mat4 uRotation;uniform mat4 uProjection;uniform float uDistance;varying vec3 vNormal;varying vec2 vUV;varying float vFace;varying vec3 vPosition;void main(){vec4 p=uRotation*vec4(aPosition,1.0);vNormal=mat3(uRotation)*aNormal;vPosition=p.xyz;p.z-=uDistance;gl_Position=uProjection*p;vUV=aUV;vFace=aFace;}`;
  const fs=`precision mediump float;uniform sampler2D uFront;uniform sampler2D uBack;varying vec3 vNormal;varying vec2 vUV;varying float vFace;varying vec3 vPosition;void main(){vec3 n=normalize(vNormal);vec4 tex=vFace<.5?texture2D(uFront,vUV):texture2D(uBack,vUV);vec3 base=tex.a>.1?tex.rgb:vec3(.06,.061,.065);if(vFace>1.5){float weave=sin(vUV.y*900.0)*sin(vUV.x*750.0);base=vec3(.095,.096,.103)+weave*.004;}float key=max(dot(n,normalize(vec3(-.65,.8,1.6))),0.0);float fill=max(dot(n,normalize(vec3(1.0,.25,.45))),0.0);float rim=pow(1.0-abs(n.z),3.0);vec3 color=base*(.67+.32*key+.12*fill)+rim*vec3(.026,.031,.038);gl_FragColor=vec4(color,1.0);}`;
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.buffer=gl.createBuffer();this.locations={};
  for(const name of ['uRotation','uProjection','uDistance','uFront','uBack'])this.locations[name]=gl.getUniformLocation(this.program,name);
  this.attributes=['aPosition','aNormal','aUV','aFace'].map(name=>gl.getAttribLocation(this.program,name));
  if(interactive)this.bindControls();
  this.previous=performance.now();
  this.tick=now=>{
   const dt=Math.min((now-this.previous)/1000,.05);this.previous=now;
   if(this.ready&&this.visible()&&!document.hidden){if(this.auto&&!this.dragging)this.yaw+=dt*.30;this.render();}
   this.frame=requestAnimationFrame(this.tick);
  };
  this.frame=requestAnimationFrame(this.tick);
 }
 makeTexture(atlas){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);return t;}
 async setProduct(product){
  if(!this.gl)return;
  const sequence=++this.sequence;this.ready=false;this.canvas.dataset.status='loading';this.canvas.dataset.product=product.name;
  try{
   const [frontImage,backImage]=await Promise.all([loadGarmentImage(product.image),loadGarmentImage(product.rear)]);
   if(sequence!==this.sequence)return;
   const front=normalizeGarment(frontImage),back=normalizeGarment(backImage),geometry=garmentGeometry(front.mask),gl=this.gl;
   if(this.front)gl.deleteTexture(this.front);if(this.back)gl.deleteTexture(this.back);
   this.front=this.makeTexture(front.atlas);this.back=this.makeTexture(back.atlas);
   gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,geometry,gl.STATIC_DRAW);this.count=geometry.length/9;
   this.yaw=-.2;this.pitch=-.035;this.zoom=1;this.ready=true;this.canvas.dataset.status='ready';this.render();this.onChange(this);
  }catch(error){this.canvas.dataset.status='error';console.error(error);this.canvas.dispatchEvent(new CustomEvent('viewererror',{detail:error.message}));}
 }
 render(){
  const gl=this.gl,canvas=this.canvas,width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,1.7);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  const sizes=[3,3,2,1],offsets=[0,12,24,32];
  for(let i=0;i<4;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],sizes[i],gl.FLOAT,false,36,offsets[i]);}
  gl.uniformMatrix4fv(this.locations.uRotation,false,rotationMatrix(this.yaw,this.pitch));gl.uniformMatrix4fv(this.locations.uProjection,false,perspectiveMatrix(width/height));
  gl.uniform1f(this.locations.uDistance,(width/height<.8?4.7:3.85)/this.zoom);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.front);gl.uniform1i(this.locations.uFront,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.back);gl.uniform1i(this.locations.uBack,1);gl.drawArrays(gl.TRIANGLES,0,this.count);
  canvas.dataset.yaw=this.yaw.toFixed(3);canvas.dataset.pitch=this.pitch.toFixed(3);
 }
 bindControls(){
  const canvas=this.canvas;let previous=null;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;this.auto=false;this.dragging=true;previous=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);this.onChange(this);});
  canvas.addEventListener('pointermove',e=>{if(!this.dragging||!previous)return;this.yaw+=(e.clientX-previous[0])*.009;this.pitch=Math.max(-1.15,Math.min(1.15,this.pitch+(e.clientY-previous[1])*.007));previous=[e.clientX,e.clientY];this.onChange(this);});
  const stop=()=>{this.dragging=false;previous=null;};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
  canvas.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();this.zoom=Math.max(.7,Math.min(1.55,this.zoom-e.deltaY*.001));this.onChange(this);},{passive:false});
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();this.auto=false;if(e.key==='ArrowLeft')this.yaw-=.15;if(e.key==='ArrowRight')this.yaw+=.15;if(e.key==='ArrowUp')this.pitch=Math.max(-1.15,this.pitch-.12);if(e.key==='ArrowDown')this.pitch=Math.min(1.15,this.pitch+.12);if(e.key==='Home'){this.yaw=0;this.pitch=0;this.zoom=1;}this.onChange(this);});
 }
 face(yaw){this.auto=false;this.yaw=Math.round(this.yaw/(Math.PI*2))*Math.PI*2+yaw;this.pitch=0;this.onChange(this);}
}
/* The same 3D triangles are rasterized in Canvas when hardware WebGL is unavailable. */
class SoftwareGarmentViewer{
 constructor(canvas,{interactive=false,auto=true,onChange=()=>{},visible=()=>true}={}){
  this.canvas=canvas;this.software=true;this.interactive=interactive;this.auto=auto;this.onChange=onChange;this.visible=visible;this.yaw=-.2;this.pitch=-.035;this.zoom=1;this.sequence=0;this.ready=false;this.ctx=canvas.getContext('2d');this.previous=performance.now();this.lastDraw=0;
  if(interactive)GarmentViewer.prototype.bindControls.call(this);
  this.tick=now=>{const dt=Math.min((now-this.previous)/1000,.05);this.previous=now;if(this.ready&&this.visible()&&!document.hidden){if(this.auto&&!this.dragging)this.yaw+=dt*.3;if(now-this.lastDraw>(interactive?40:90)){this.render();this.lastDraw=now;}}this.frame=requestAnimationFrame(this.tick)};
  this.frame=requestAnimationFrame(this.tick);
 }
 async setProduct(product){
  const sequence=++this.sequence;this.ready=false;this.canvas.dataset.status='loading';this.canvas.dataset.product=product.name;
  try{
   const [fi,bi]=await Promise.all([loadGarmentImage(product.image),loadGarmentImage(product.rear)]);if(sequence!==this.sequence)return;
   const front=normalizeGarment(fi),back=normalizeGarment(bi);
   this.front=front.atlas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,512,512).data;this.back=back.atlas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,512,512).data;
   this.geometry=garmentGeometry(front.mask,this.interactive?56:36);this.yaw=-.2;this.pitch=-.035;this.zoom=1;this.ready=true;this.canvas.dataset.status='ready';this.canvas.dataset.renderer='software';this.render();this.onChange(this);
  }catch(error){this.canvas.dataset.status='error';console.error(error);this.canvas.dispatchEvent(new CustomEvent('viewererror',{detail:error.message}));}
 }
 face(yaw){GarmentViewer.prototype.face.call(this,yaw);}
 render(){
  const c=this.canvas,cw=Math.max(1,c.clientWidth),ch=Math.max(1,c.clientHeight),scale=Math.min(1,(this.interactive?620:260)/cw,(this.interactive?650:340)/ch),w=Math.max(1,Math.round(cw*scale)),h=Math.max(1,Math.round(ch*scale));
  if(c.width!==w||c.height!==h||!this.output){c.width=w;c.height=h;this.output=this.ctx.createImageData(w,h);this.depthBuffer=new Float32Array(w*h);}
  const pixels=this.output.data,zbuffer=this.depthBuffer;pixels.fill(0);zbuffer.fill(0);
  const m=rotationMatrix(this.yaw,this.pitch),distance=(cw/ch<.8?4.7:3.85)/this.zoom,f=1/Math.tan(.42),g=this.geometry;
  const project=o=>{
   const x=g[o],y=g[o+1],z=g[o+2],rx=m[0]*x+m[4]*y+m[8]*z,ry=m[1]*x+m[5]*y+m[9]*z,rz=m[2]*x+m[6]*y+m[10]*z,d=distance-rz;
   const nx=m[0]*g[o+3]+m[4]*g[o+4]+m[8]*g[o+5],ny=m[1]*g[o+3]+m[5]*g[o+4]+m[9]*g[o+5],nz=m[2]*g[o+3]+m[6]*g[o+4]+m[10]*g[o+5],len=Math.hypot(nx,ny,nz);
   return [w*.5+f*rx/d*h*.5,h*.5-f*ry/d*h*.5,1/d,g[o+6]/d,g[o+7]/d,nx/len,ny/len,nz/len];
  };
  for(let o=0;o<g.length;o+=27){
   const a=project(o),b=project(o+9),d=project(o+18),den=(b[1]-d[1])*(a[0]-d[0])+(d[0]-b[0])*(a[1]-d[1]);if(Math.abs(den)<.005)continue;
   const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],d[0]))),maxX=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],d[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],d[1]))),maxY=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],d[1])));
   const nx=(a[5]+b[5]+d[5])/3,ny=(a[6]+b[6]+d[6])/3,nz=(a[7]+b[7]+d[7])/3,key=Math.max(0,(-.65*nx+.8*ny+1.6*nz)/1.9),fill=Math.max(0,(nx+.25*ny+.45*nz)/1.12),light=.67+.32*key+.12*fill,rim=Math.pow(1-Math.abs(nz),3)*7,face=g[o+8],tex=face<.5?this.front:this.back;
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const px=x+.5,py=y+.5,wa=((b[1]-d[1])*(px-d[0])+(d[0]-b[0])*(py-d[1]))/den,wb=((d[1]-a[1])*(px-d[0])+(a[0]-d[0])*(py-d[1]))/den,wc=1-wa-wb;if(wa<-.001||wb<-.001||wc<-.001)continue;
    const iz=wa*a[2]+wb*b[2]+wc*d[2],index=y*w+x;if(iz<=zbuffer[index])continue;zbuffer[index]=iz;const dest=index*4;
    if(face>1.5){pixels[dest]=24*light+rim;pixels[dest+1]=25*light+rim;pixels[dest+2]=27*light+rim;}else{
     const u=Math.max(0,Math.min(511,(wa*a[3]+wb*b[3]+wc*d[3])/iz*511)),v=Math.max(0,Math.min(511,(wa*a[4]+wb*b[4]+wc*d[4])/iz*511)),tx=Math.floor(u),ty=Math.floor(v),sample=(ty*512+tx)*4;
     if(tex[sample+3]>25){pixels[dest]=tex[sample]*light+rim;pixels[dest+1]=tex[sample+1]*light+rim;pixels[dest+2]=tex[sample+2]*light+rim;}else{pixels[dest]=15*light+rim;pixels[dest+1]=16*light+rim;pixels[dest+2]=17*light+rim;}
    }
    pixels[dest+3]=255;
   }
  }
  this.ctx.putImageData(this.output,0,0);c.dataset.yaw=this.yaw.toFixed(3);c.dataset.pitch=this.pitch.toFixed(3);
 }
}
