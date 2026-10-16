import{r as J,j as Ht}from"./vendor-DXcH-vAE.js";const fe=`#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aMotion;
layout(location = 2) in vec2 aState;

uniform vec2 uResolution;
uniform float uSize;
uniform float uSwell;
uniform float uStretch;
uniform float uGlow;

out vec2 vLocal;
out vec2 vPoint;
out float vLength;
out float vRadius;
out float vEnergy;

void main() {
  float energy = aState.x;
  float radius = 0.5 * uSize * aState.y * (1.0 + uSwell * energy);
  float speed = length(aMotion.zw);
  float angle = speed > 0.001 ? atan(aMotion.w, aMotion.z) : 0.0;
  float axis = floor(angle / 1.5707963 + 0.5) * 1.5707963;
  angle = axis + (angle - axis) * smoothstep(8.0, 70.0, speed);
  vec2 dir = vec2(cos(angle), sin(angle));
  float halfLength = min(uSize * 2.0, speed * uStretch * 0.02);
  float pad = radius * (1.0 + uGlow * energy * 2.5) + 2.0;
  vec2 local = aCorner * vec2(halfLength + pad, pad);
  vec2 point = aMotion.xy + dir * local.x + vec2(-dir.y, dir.x) * local.y;
  vLocal = local;
  vPoint = point;
  vLength = halfLength;
  vRadius = radius;
  vEnergy = energy;
  vec2 clip = point / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`,he=`#version 300 es
precision highp float;

in vec2 vLocal;
in vec2 vPoint;
in float vLength;
in float vRadius;
in float vEnergy;

uniform vec2 uResolution;
uniform vec3 uBase;
uniform vec3 uActive;
uniform float uGlow;
uniform float uOpacity;
uniform float uFade;
uniform int uShape;

out vec4 outColor;

float smootherstep01(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void main() {
  float d;
  if (uShape == 1) {
    float corner = vRadius * 0.3;
    vec2 q = abs(vLocal) - vec2(vLength + vRadius, vRadius) + corner;
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  } else {
    d = length(vec2(max(abs(vLocal.x) - vLength, 0.0), vLocal.y)) - vRadius;
  }
  float aa = max(fwidth(d), 0.0001);
  float body = clamp(0.5 - d / aa, 0.0, 1.0);
  float halo = uGlow * vEnergy * 0.5 * exp(-max(d, 0.0) / max(vRadius * 1.3, 0.6));
  float alpha = body + (1.0 - body) * halo;
  vec3 color = mix(uBase, uActive, clamp(vEnergy * 1.2, 0.0, 1.0));
  float fade = 1.0;
  if (uFade > 0.0) {
    vec2 edge = min(vPoint, uResolution - vPoint) / (uFade * 0.4 * min(uResolution.x, uResolution.y));
    fade = smootherstep01(edge.x) * smootherstep01(edge.y);
  }
  alpha *= uOpacity * fade;
  outColor = vec4(color * alpha, alpha);
}
`,Wt=A=>{const m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(A).trim());if(!m)return[1,1,1];const S=m[1].length===3?m[1].replace(/./g,M=>M+M):m[1];return[0,2,4].map(M=>parseInt(S.slice(M,M+2),16)/255)},gt=A=>{const m=Math.min(1,Math.max(0,A));return m*m*m*(m*(m*6-15)+10)},de=A=>{const S=A-1;return 1+S*S*((1.9+1)*S+1.9)},$t=(A,m,S)=>{const M=A.createShader(m);return A.shaderSource(M,S),A.compileShader(M),M},ve=({dotSize:A=5,gap:m=18,baseColor:S="#3a3446",activeColor:M="#ffffff",proximity:wt=140,strength:Kt=1,bounce:Jt=.6,tension:Qt=.4,returnDuration:Zt=.8,shockRadius:te=320,shockStrength:ee=5,swell:At=.8,stretch:Mt=.5,glow:Rt=.5,shape:bt="circle",fade:Ft=0,opacity:Et=1,intro:ne=!0,mouseInteraction:St=!0,clickShock:oe=!0,paused:Lt=!1,dpr:re,className:ae="",style:ie})=>{const Bt=J.useRef(null),ot=J.useRef(null),_t={dotSize:A,gap:m,baseColor:S,activeColor:M,proximity:wt,strength:Kt,bounce:Jt,tension:Qt,returnDuration:Zt,shockRadius:te,shockStrength:ee,swell:At,stretch:Mt,glow:Rt,shape:bt,fade:Ft,opacity:Et,intro:ne,mouseInteraction:St,clickShock:oe,paused:Lt,dpr:re},b=J.useRef(_t);return b.current=_t,J.useEffect(()=>{const v=Bt.current;if(!v)return;const t=v.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1});if(!t)return;const k=t.createProgram();if(t.attachShader(k,$t(t,t.VERTEX_SHADER,fe)),t.attachShader(k,$t(t,t.FRAGMENT_SHADER,he)),t.linkProgram(k),!t.getProgramParameter(k,t.LINK_STATUS))return;const F={};for(const o of["uResolution","uSize","uSwell","uStretch","uGlow","uBase","uActive","uOpacity","uFade","uShape"])F[o]=t.getUniformLocation(k,o);const dt=t.createVertexArray();t.bindVertexArray(dt);const Ot=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,Ot),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0);const rt=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,rt),t.enableVertexAttribArray(1),t.vertexAttribPointer(1,4,t.FLOAT,!1,24,0),t.vertexAttribDivisor(1,1),t.enableVertexAttribArray(2),t.vertexAttribPointer(2,2,t.FLOAT,!1,24,16),t.vertexAttribDivisor(2,1),t.bindVertexArray(null);const Q=window.matchMedia("(prefers-reduced-motion: reduce)").matches,h={width:0,height:0,left:0,top:0,ratio:1},p={count:0,cols:1,rows:1,cell:1,centerX:0,centerY:0,reach:1};let O=new Float32Array(0),s=new Float32Array(0),c=new Float32Array(0),Z=new Float32Array(0),at=new Float32Array(0),g=new Float32Array(0),mt=new Float32Array(0),P=new Float32Array(0);const e={x:0,y:0,vx:0,vy:0,time:0,inside:!1,presence:0},q=[];let E=b.current.intro&&!Q?-1:null,it=!0,X=0,vt=0;const Pt=()=>{const{dotSize:o,gap:n}=b.current,r=Math.max(2,o+n),d=Math.max(1,Math.floor((h.width+n)/r)),R=Math.max(1,Math.floor((h.height+n)/r)),L=(h.width-(d*r-n))/2+o/2,w=(h.height-(R*r-n))/2+o/2,u=d*R;O=new Float32Array(u*2),s=new Float32Array(u*2),c=new Float32Array(u*2),Z=new Float32Array(u*2),at=new Float32Array(u*2),g=new Float32Array(u*4),mt=new Float32Array(u),P=new Float32Array(u*6);for(let y=0;y<R;y++)for(let f=0;f<d;f++){const B=(y*d+f)*2;O[B]=L+f*r,O[B+1]=w+y*r}Object.assign(p,{count:u,cols:d,rows:R,cell:r,centerX:h.width/2,centerY:h.height/2,reach:Math.hypot(h.width,h.height)/2}),t.bindBuffer(t.ARRAY_BUFFER,rt),t.bufferData(t.ARRAY_BUFFER,P.byteLength,t.DYNAMIC_DRAW)},Tt=()=>{const o=v.getBoundingClientRect(),n=Math.min(b.current.dpr??window.devicePixelRatio??1,2),r=Math.max(1,Math.round(o.width)),d=Math.max(1,Math.round(o.height));Object.assign(h,{width:r,height:d,left:o.left,top:o.top,ratio:n}),v.width=Math.round(r*n),v.height=Math.round(d*n),Pt(),st(performance.now())},se=(o,n)=>{const r=b.current,d=Q?0:1,R=1-.85*Math.min(1,Math.max(0,r.bounce)),L=4/(R*Math.max(.2,r.returnDuration)),w=L*L,u=2*R*L,y=Math.max(1,r.proximity),f=Math.hypot(e.vx,e.vy),B=r.mouseInteraction&&e.inside?6500*Math.tanh(f/900)*r.strength*d:0,ct=f>.001?e.vx/f:0,lt=f>.001?e.vy/f:0,I=p.cell*1.4,tt=650,D=q.map(l=>{const i=(n-l.start)/1e3*tt,x=gt(1-i/Math.max(1,r.shockRadius));return{...l,front:i,amplitude:x*r.shockStrength*p.cell*.24*d}}),_=(Math.max(0,r.tension)*900)**2/(p.cell*p.cell),j=Math.sqrt(_)*.06,le=Math.sqrt(w+8*_)+u+8*j,Gt=Math.min(24,Math.max(1,Math.ceil(o/Math.min(1/120,1.2/le)))),xt=o/Gt;for(let l=0;l<p.count;l++){const i=l*2,x=O[i],a=O[i+1];let W=0,$=0;if(B>0){const Y=x+s[i]-e.x,et=a+s[i+1]-e.y,z=Math.hypot(Y,et);if(z<y){const H=gt(1-z/y)*B,K=z>.001?Y/z:0,nt=z>.001?et/z:0;W+=H*(ct+K*.6),$+=H*(lt+nt*.6)}}let V=0,N=0,U=0,G=0;for(const Y of D){if(Y.amplitude<=0)continue;const et=x-Y.x,z=a-Y.y,H=Math.hypot(et,z),K=(H-Y.front)/I;if(Math.abs(K)<3&&H>.001){const nt=et/H,yt=z/H,Xt=Math.exp(-K*K),ht=Y.amplitude*Xt,jt=Y.amplitude*2*K*Xt/I*tt;V+=nt*ht,N+=yt*ht,U+=nt*jt,G+=yt*jt,W+=nt*ht*w*.35,$+=yt*ht*w*.35}}Z[i]=W,Z[i+1]=$;const ft=l*4;g[ft]=V,g[ft+1]=N,g[ft+2]=U,g[ft+3]=G}const{cols:ut,rows:kt}=p,C=ut*2;for(let l=0;l<Gt;l++){for(let i=0;i<kt;i++)for(let x=0;x<ut;x++){const a=(i*ut+x)*2;let W=Z[a]-w*s[a]-u*c[a],$=Z[a+1]-w*s[a+1]-u*c[a+1];if(_>0){let V=-4*s[a],N=-4*s[a+1],U=-4*c[a],G=-4*c[a+1];x>0&&(V+=s[a-2],N+=s[a-1],U+=c[a-2],G+=c[a-1]),x<ut-1&&(V+=s[a+2],N+=s[a+3],U+=c[a+2],G+=c[a+3]),i>0&&(V+=s[a-C],N+=s[a-C+1],U+=c[a-C],G+=c[a-C+1]),i<kt-1&&(V+=s[a+C],N+=s[a+C+1],U+=c[a+C],G+=c[a+C+1]),W+=_*V+j*U,$+=_*N+j*G}at[a]=c[a]+W*xt,at[a+1]=c[a+1]+$*xt}for(let i=0;i<s.length;i++)c[i]=at[i],s[i]+=c[i]*xt}for(let l=0;l<p.count;l++){const i=l*2,x=l*4;mt[l]=Math.min(1,Math.hypot(c[i]+g[x+2],c[i+1]+g[x+3])/380*.85+Math.hypot(s[i]+g[x],s[i+1]+g[x+1])/(p.cell*2.2)*.35)}for(let l=q.length-1;l>=0;l--)D[l].front>r.shockRadius+I*3&&q.splice(l,1);const qt=1-Math.exp(-o/.08);e.vx-=e.vx*qt,e.vy-=e.vy*qt;const ue=r.mouseInteraction&&e.inside?1:0;e.presence+=(ue-e.presence)*(1-Math.exp(-o/.2))},st=o=>{const n=b.current,r=Math.max(1,n.proximity),R=(E===null?1/0:E<0?0:(o-E)/1e3)*p.reach*1.25,L=p.cell*4;for(let y=0;y<p.count;y++){const f=y*2,B=y*4,ct=O[f]+s[f]+g[B],lt=O[f+1]+s[f+1]+g[B+1];let I=mt[y];if(e.presence>.001){const _=Math.hypot(ct-e.x,lt-e.y);_<r&&(I=Math.max(I,gt(1-_/r)*.4*e.presence))}let tt=1;if(E!==null){const _=Math.hypot(O[f]-p.centerX,O[f+1]-p.centerY),j=Math.min(1,Math.max(0,(R-_)/L));tt=j>=1?1:Math.max(0,de(j)),I=Math.max(I,Math.sin(j*Math.PI)*.6)}const D=y*6;P[D]=ct,P[D+1]=lt,P[D+2]=c[f]+g[B+2],P[D+3]=c[f+1]+g[B+3],P[D+4]=I,P[D+5]=tt}const w=Wt(n.baseColor),u=Wt(n.activeColor);t.viewport(0,0,v.width,v.height),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.useProgram(k),t.uniform2f(F.uResolution,h.width,h.height),t.uniform1f(F.uSize,Math.max(.5,n.dotSize)),t.uniform1f(F.uSwell,Q?0:Math.max(0,n.swell)),t.uniform1f(F.uStretch,Q?0:Math.max(0,n.stretch)),t.uniform1f(F.uGlow,Math.max(0,n.glow)),t.uniform3f(F.uBase,w[0],w[1],w[2]),t.uniform3f(F.uActive,u[0],u[1],u[2]),t.uniform1f(F.uOpacity,Math.min(1,Math.max(0,n.opacity))),t.uniform1f(F.uFade,Math.min(1,Math.max(0,n.fade))),t.uniform1i(F.uShape,n.shape==="square"?1:0),t.bindVertexArray(dt),t.bindBuffer(t.ARRAY_BUFFER,rt),t.bufferSubData(t.ARRAY_BUFFER,0,P),t.drawArraysInstanced(t.TRIANGLE_STRIP,0,4,p.count),t.bindVertexArray(null)},ce=o=>{if(q.length)return!1;if(E!==null){if(E<0||(o-E)/1e3<1.6)return!1;E=null}if(Math.abs(e.vx)+Math.abs(e.vy)>1)return!1;const n=b.current.mouseInteraction&&e.inside?1:0;if(Math.abs(n-e.presence)>.002)return!1;for(let r=0;r<s.length;r++)if(Math.abs(s[r])>.02||Math.abs(c[r])>.5)return!1;return!0},It=o=>{if(X=0,b.current.paused||!it)return;E!==null&&E<0&&(E=o);const n=Math.min(.05,(o-vt)/1e3||0);vt=o,se(n,o),st(o),ce(o)||(X=requestAnimationFrame(It))},T=()=>{X||b.current.paused||!it||(vt=performance.now(),X=requestAnimationFrame(It))},Dt=o=>{const n=v.getBoundingClientRect();return h.left=n.left,h.top=n.top,[o.clientX-n.left,o.clientY-n.top]},Yt=o=>{if(!b.current.mouseInteraction)return;const[n,r]=Dt(o),d=n>=0&&r>=0&&n<=h.width&&r<=h.height,R=o.timeStamp||performance.now();if(d&&e.inside&&e.time){const L=Math.max(4,R-e.time)/1e3,w=(n-e.x)/L,u=(r-e.y)/L;e.vx+=(w-e.vx)*.6,e.vy+=(u-e.vy)*.6}else e.vx=0,e.vy=0;e.x=n,e.y=r,e.time=R,(d!==e.inside||d)&&(e.inside=d,T())},pt=()=>{e.inside=!1,e.time=0,T()},zt=o=>{o.relatedTarget||pt()},Ct=o=>{if(!b.current.clickShock||Q)return;const[n,r]=Dt(o);n<0||r<0||n>h.width||r>h.height||(q.push({x:n,y:r,start:performance.now()}),q.length>6&&q.shift(),T())};window.addEventListener("pointermove",Yt,{passive:!0}),window.addEventListener("pointerdown",Ct,{passive:!0}),window.addEventListener("pointerout",zt),window.addEventListener("blur",pt);const Vt=new ResizeObserver(()=>{Tt(),T()});Vt.observe(v);const Nt=new IntersectionObserver(([o])=>{it=o.isIntersecting,it&&T()});Nt.observe(v);const Ut=()=>{document.hidden?(cancelAnimationFrame(X),X=0):T()};return document.addEventListener("visibilitychange",Ut),Tt(),T(),ot.current={rebuild:()=>{Pt(),st(performance.now()),T()},refresh:()=>{st(performance.now()),T()}},()=>{cancelAnimationFrame(X),Vt.disconnect(),Nt.disconnect(),window.removeEventListener("pointermove",Yt),window.removeEventListener("pointerdown",Ct),window.removeEventListener("pointerout",zt),window.removeEventListener("blur",pt),document.removeEventListener("visibilitychange",Ut),t.deleteBuffer(Ot),t.deleteBuffer(rt),t.deleteVertexArray(dt),t.deleteProgram(k),ot.current=null}},[]),J.useEffect(()=>{var v;(v=ot.current)==null||v.rebuild()},[A,m]),J.useEffect(()=>{var v;(v=ot.current)==null||v.refresh()},[S,M,At,Mt,Rt,bt,Ft,Et,Lt,wt,St]),Ht.jsx("div",{className:`dot-grid ${ae}`.trim(),style:ie,children:Ht.jsx("canvas",{ref:Bt,className:"dot-grid__canvas"})})};export{ve as default};
