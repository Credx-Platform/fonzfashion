/* FONZ studio viewer — smooth indexed garment shells, native-detail textures,
   interpolated fabric lighting and a high-resolution Canvas fallback. */
(() => {
'use strict';
const TAU=Math.PI*2, cache=new Map();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function image(url){
 const key='image:'+url;
 if(!cache.has(key))cache.set(key,new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>{cache.delete(key);reject(Error('Unable to load garment artwork'));};img.src=url;}));
 return cache.get(key);
}
async function garment(product){
 const key='garment:'+product.slug;
 if(!cache.has(key))cache.set(key,(async()=>{
  const [front,back,response]=await Promise.all([image(product.image),image(product.rear),fetch('assets/'+product.slug+'.mesh')]);
  if(!response.ok)throw Error('Unable to load garment surface');
  const buffer=await response.arrayBuffer(),header=new Uint32Array(buffer,0,3);
  if(header[0]!==0x465A4D32)throw Error('Invalid garment surface');
  const vertices=new Float32Array(buffer,12,header[1]*9),indices=new Uint16Array(buffer,12+header[1]*36,header[2]);
  const texture=img=>{const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,1024,1024);return {canvas:c,pixels:ctx.getImageData(0,0,1024,1024).data};};
  return {vertices,indices,front:texture(front),back:texture(back)};
 })().catch(error=>{cache.delete(key);throw error;}));
 return cache.get(key);
}
function matrix(yaw,pitch){const c=Math.cos(yaw),s=Math.sin(yaw),a=Math.cos(pitch),b=Math.sin(pitch);return new Float32Array([c,b*s,-a*s,0,0,a,b,0,s,-b*c,a*c,0,0,0,0,1]);}
function projection(aspect){const f=1/Math.tan(.38),near=.1,far=30;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*near*far/(near-far),0]);}
class GarmentViewer {
 constructor(canvas,{interactive=false,auto=true,onChange=()=>{},visible=()=>true,phase=0}={}){
  Object.assign(this,{canvas,interactive,auto,onChange,visible,phase,yaw:-.20,pitch:-.035,zoom:1,goalZoom:1,ready:false,sequence:0,velocity:0,dragging:false});
  this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(this.gl)this.setupGL();else{this.software=true;this.ctx=canvas.getContext('2d');this.surface=document.createElement('canvas');this.surfaceCtx=this.surface.getContext('2d');}
  canvas.dataset.renderer=this.gl?'webgl':'canvas-hd';
  if(interactive)this.bindControls();
  this.last=performance.now();this.started=this.last;this.lastDraw=0;this.lastNotice=0;
  this.tick=now=>{
   const dt=Math.min((now-this.last)/1000,.05);this.last=now;
   if(this.ready&&this.visible()&&!document.hidden){
    if(this.turn){const t=clamp((now-this.turn.start)/750,0,1),e=t*t*(3-2*t);this.yaw=this.turn.from+(this.turn.to-this.turn.from)*e;this.pitch=this.turn.pitch*(1-e);if(t===1)this.turn=null;}
    else if(this.auto&&!this.dragging){
     if(this.interactive)this.yaw+=dt*.15;
     else{this.yaw=-.10+Math.sin((now-this.started)/6500+this.phase)*.32;this.pitch=-.04+Math.sin(now/8500+this.phase)*.025;}
    }else if(!this.dragging&&Math.abs(this.velocity)>.0001){this.yaw+=this.velocity*dt*60;this.velocity*=Math.exp(-dt*7);}
    this.zoom+=(this.goalZoom-this.zoom)*(1-Math.exp(-dt*12));
    const signature=[this.yaw.toFixed(4),this.pitch.toFixed(4),this.zoom.toFixed(4),canvas.clientWidth,canvas.clientHeight].join(':');
    if(signature!==this.signature&&now-this.lastDraw>(this.gl?0:this.interactive?22:65)){this.render();this.signature=signature;this.lastDraw=now;}
    if(now-this.lastNotice>120){this.onChange(this);this.lastNotice=now;}
   }
   this.frame=requestAnimationFrame(this.tick);
  };
  this.frame=requestAnimationFrame(this.tick);
  this.resizeObserver=new ResizeObserver(()=>{this.signature='';if(this.ready&&this.visible())this.render();});this.resizeObserver.observe(canvas);
 }
 setupGL(){
  const gl=this.gl;
  const vs=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;attribute float aFace;uniform mat4 uRotation;uniform mat4 uProjection;uniform float uDistance;varying vec3 vNormal;varying vec2 vUV;varying float vFace;void main(){vec4 p=uRotation*vec4(aPosition,1.);vNormal=mat3(uRotation)*aNormal;p.z-=uDistance;gl_Position=uProjection*p;vUV=aUV;vFace=aFace;}`;
  const fs=`precision highp float;uniform sampler2D uFront;uniform sampler2D uBack;uniform vec3 uTint;varying vec3 vNormal;varying vec2 vUV;varying float vFace;void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec4 t=vFace<.5?texture2D(uFront,vUV):texture2D(uBack,vUV);vec3 base=mix(vec3(.065,.068,.073),t.rgb,smoothstep(.08,.7,t.a));if(!gl_FrontFacing)base=vec3(.035,.038,.043);float key=max(dot(n,normalize(vec3(-.7,.9,1.5))),0.);float fill=max(dot(n,normalize(vec3(.95,.1,.65))),0.);float edge=pow(1.-abs(n.z),3.);float sheen=pow(max(dot(n,normalize(vec3(-.5,.75,2.))),0.),16.);vec3 color=base*(.71+.32*key+.15*fill)+edge*(vec3(.012,.016,.021)+uTint*.018)+sheen*.008;gl_FragColor=vec4(color,1.);}`;
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vs));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(this.program);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.vertexBuffer=gl.createBuffer();this.indexBuffer=gl.createBuffer();this.uniforms={};
  for(const name of ['uRotation','uProjection','uDistance','uFront','uBack','uTint'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
  this.attributes=['aPosition','aNormal','aUV','aFace'].map(name=>gl.getAttribLocation(this.program,name));
 }
 texture(source){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return t;}
 async setProduct(product){
  const seq=++this.sequence;this.ready=false;this.turn=null;this.velocity=0;this.canvas.dataset.status='loading';this.canvas.dataset.product=product.name;
  try{
   const data=await garment(product);if(seq!==this.sequence)return;this.data=data;
   this.tint=[1,3,5].map(i=>parseInt(product.accent.slice(i,i+2),16)/255);
   if(this.gl){const gl=this.gl;if(this.front)gl.deleteTexture(this.front);if(this.back)gl.deleteTexture(this.back);this.front=this.texture(data.front.canvas);this.back=this.texture(data.back.canvas);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,data.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);}
   else this.projected=new Float32Array(data.vertices.length/9*7);
   this.yaw=-.20;this.pitch=-.035;this.zoom=this.goalZoom=1;this.ready=true;this.canvas.dataset.status='ready';this.render();this.onChange(this);
  }catch(error){if(seq!==this.sequence)return;this.canvas.dataset.status='error';console.error(error);this.canvas.dispatchEvent(new CustomEvent('viewererror',{detail:error.message}));}
 }
 dimensions(){const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight);return {width,height,distance:(width/height<.75?4.35:3.9)/this.zoom};}
 render(){if(!this.ready)return;if(this.gl)this.renderGL();else this.renderCanvas();this.canvas.dataset.yaw=this.yaw.toFixed(3);this.canvas.dataset.pitch=this.pitch.toFixed(3);this.canvas.dataset.zoom=this.zoom.toFixed(3);}
 renderGL(){
  const gl=this.gl,c=this.canvas,{width,height,distance}=this.dimensions(),dpr=Math.min(devicePixelRatio||1,2);
  if(c.width!==Math.round(width*dpr)||c.height!==Math.round(height*dpr)){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);}
  gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
  const sizes=[3,3,2,1],offsets=[0,12,24,32];for(let i=0;i<4;i++){gl.enableVertexAttribArray(this.attributes[i]);gl.vertexAttribPointer(this.attributes[i],sizes[i],gl.FLOAT,false,36,offsets[i]);}
  gl.uniformMatrix4fv(this.uniforms.uRotation,false,matrix(this.yaw,this.pitch));gl.uniformMatrix4fv(this.uniforms.uProjection,false,projection(width/height));gl.uniform1f(this.uniforms.uDistance,distance);gl.uniform3fv(this.uniforms.uTint,this.tint);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.front);gl.uniform1i(this.uniforms.uFront,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.back);gl.uniform1i(this.uniforms.uBack,1);gl.drawElements(gl.TRIANGLES,this.data.indices.length,gl.UNSIGNED_SHORT,0);
 }
 renderCanvas(){
  const c=this.canvas,{width:cw,height:ch,distance}=this.dimensions();
  // Supersampling preserves fine print and antialiases the garment silhouette.
  const ratio=Math.min(Math.max(devicePixelRatio||1,1.35),this.interactive?1.7:1.5,(this.interactive?1500:600)/cw,(this.interactive?1500:680)/ch),w=Math.round(cw*ratio),h=Math.round(ch*ratio);
  if(c.width!==w||c.height!==h||!this.output){c.width=w;c.height=h;this.output=this.ctx.createImageData(w,h);this.depth=new Float32Array(w*h);}
  const pixels=this.output.data,zbuffer=this.depth;pixels.fill(0);zbuffer.fill(0);
  const m=matrix(this.yaw,this.pitch),f=1/Math.tan(.38),v=this.data.vertices,ids=this.data.indices,p=this.projected;
  for(let i=0,j=0;i<v.length;i+=9,j+=7){
   const x=m[0]*v[i]+m[8]*v[i+2],y=m[1]*v[i]+m[5]*v[i+1]+m[9]*v[i+2],z=m[2]*v[i]+m[6]*v[i+1]+m[10]*v[i+2],d=distance-z;
   let nx=m[0]*v[i+3]+m[8]*v[i+5],ny=m[1]*v[i+3]+m[5]*v[i+4]+m[9]*v[i+5],nz=m[2]*v[i+3]+m[6]*v[i+4]+m[10]*v[i+5];const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
   p[j]=w*.5+f*x/d*h*.5;p[j+1]=h*.49-f*y/d*h*.5;p[j+2]=1/d;p[j+3]=v[i+6]/d;p[j+4]=v[i+7]/d;
   p[j+5]=(.71+.32*Math.max(0,(-.7*nx+.9*ny+1.5*nz)/1.884)+.15*Math.max(0,(.95*nx+.1*ny+.65*nz)/1.156))/d;
   p[j+6]=Math.pow(1-Math.abs(nz),3)*5/d;
  }
  for(let i=0;i<ids.length;i+=3){
   const ai=ids[i]*7,bi=ids[i+1]*7,ci=ids[i+2]*7;
   const ax=p[ai],ay=p[ai+1],bx=p[bi],by=p[bi+1],cx=p[ci],cy=p[ci+1];
   const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<.002)continue;const interior=den>0;
   const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx))),minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
   const aa=(by-cy)/den,ab=(cx-bx)/den,ba=(cy-ay)/den,bb=(ax-cx)/den;
   const az=p[ai+2],bz=p[bi+2],cz=p[ci+2],au=p[ai+3],bu=p[bi+3],cu=p[ci+3],av=p[ai+4],bv=p[bi+4],cv=p[ci+4],al=p[ai+5],bl=p[bi+5],cl=p[ci+5],ar=p[ai+6],br=p[bi+6],cr=p[ci+6];
   const tex=v[ids[i]*9+8]<.5?this.data.front.pixels:this.data.back.pixels;
   for(let y=minY;y<=maxY;y++){
    let wa=aa*(minX+.5-cx)+ab*(y+.5-cy),wb=ba*(minX+.5-cx)+bb*(y+.5-cy);
    for(let x=minX;x<=maxX;x++,wa+=aa,wb+=ba){
     const wc=1-wa-wb;if(wa<-.0001||wb<-.0001||wc<-.0001)continue;
     const iz=wa*az+wb*bz+wc*cz,k=y*w+x;if(iz<=zbuffer[k])continue;zbuffer[k]=iz;const dest=k*4,id=1/iz;
     const u=clamp((wa*au+wb*bu+wc*cu)*id*1023,0,1022.999),vv=clamp((wa*av+wb*bv+wc*cv)*id*1023,0,1022.999),tx=u|0,ty=vv|0,fx=u-tx,fy=vv-ty,t=(ty*1024+tx)*4;
     const a=(1-fx)*(1-fy),b=fx*(1-fy),d=(1-fx)*fy,e=fx*fy,alpha=(tex[t+3]*a+tex[t+7]*b+tex[t+4099]*d+tex[t+4103]*e)/255,blend=clamp((alpha-.08)/.62,0,1),light=(wa*al+wb*bl+wc*cl)*id,rim=(wa*ar+wb*br+wc*cr)*id;
     for(let channel=0;channel<3;channel++){const sampled=interior?10+channel:tex[t+channel]*a+tex[t+4+channel]*b+tex[t+4096+channel]*d+tex[t+4100+channel]*e;pixels[dest+channel]=((16+channel)* (1-blend)+sampled*blend)*light+rim*(.7+this.tint[channel]*.65);}
     pixels[dest+3]=255;
    }
   }
  }
  this.ctx.putImageData(this.output,0,0);
 }
 face(angle){this.auto=false;this.velocity=0;const delta=((angle-this.yaw+Math.PI)%TAU+TAU)%TAU-Math.PI;this.turn={from:this.yaw,to:this.yaw+delta,pitch:this.pitch,start:performance.now()};if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.yaw=this.turn.to;this.pitch=0;this.turn=null;this.render();}this.onChange(this);}
 reset(){this.goalZoom=1;this.face(-.20);}
 bindControls(){
  const c=this.canvas,pointers=new Map();let previous=null,pinch=0;
  c.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;pointers.set(e.pointerId,[e.clientX,e.clientY]);this.auto=false;this.turn=null;this.velocity=0;this.dragging=true;previous=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a[0]-b[0],a[1]-b[1]);}this.onChange(this);});
  c.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)this.goalZoom=clamp(this.goalZoom*d/pinch,.8,1.55);pinch=d;return;}if(!previous)return;const dx=(e.clientX-previous[0])*.007;this.yaw+=dx;this.pitch=clamp(this.pitch+(e.clientY-previous[1])*.005,-.8,.8);this.velocity=dx*.42;previous=[e.clientX,e.clientY];});
  const stop=e=>{pointers.delete(e.pointerId);this.dragging=pointers.size>0;previous=pointers.size?[...pointers.values()][0]:null;pinch=0;};c.addEventListener('pointerup',stop);c.addEventListener('pointercancel',e=>{stop(e);this.velocity=0;});c.addEventListener('lostpointercapture',stop);
  c.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();this.goalZoom=clamp(this.goalZoom-e.deltaY*.001,.8,1.55);},{passive:false});
  c.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();this.auto=false;this.turn=null;this.velocity=0;if(e.key==='ArrowLeft')this.yaw-=.12;if(e.key==='ArrowRight')this.yaw+=.12;if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.1,-.8,.8);if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.1,-.8,.8);if(e.key==='Home')this.reset();this.onChange(this);});
 }
}
window.GarmentViewer=GarmentViewer;
})();
