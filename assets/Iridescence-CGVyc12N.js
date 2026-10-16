import{r as S,j as he}from"./vendor-DXcH-vAE.js";const Oe=`#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,Ge=`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uScale;
uniform float uRotation;
uniform int uDetail;
uniform float uWarp;
uniform float uHue;
uniform float uSaturation;
uniform float uBrightness;
uniform float uContrast;
uniform float uGrain;
uniform float uSeed;
uniform float uFade;
uniform float uOpacity;
uniform sampler2D uField;
uniform float uStir;
uniform vec3 uPointer;
uniform float uSheen;
uniform vec4 uSwirls[6];
in vec2 vUv;
out vec4 outColor;

vec3 hueRotate(vec3 c, float angle) {
  const vec3 k = vec3(0.57735027);
  float ca = cos(angle);
  return c * ca + cross(k, c) * sin(angle) + k * dot(k, c) * (1.0 - ca);
}

float smootherstep(float edge, float x) {
  float t = clamp(x / edge, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 aspect = uResolution / mr;
  vec2 st = vUv - texture(uField, vUv).rg * uStir;

  for (int k = 0; k < 6; k++) {
    vec4 swirl = uSwirls[k];
    if (swirl.w == 0.0) continue;
    vec2 delta = (st - swirl.xy) * aspect;
    float angle = swirl.w * exp(-dot(delta, delta) / (swirl.z * swirl.z));
    float ca = cos(angle);
    float sa = sin(angle);
    st = swirl.xy + vec2(ca * delta.x - sa * delta.y, sa * delta.x + ca * delta.y) / aspect;
  }

  vec2 uv = (st * 2.0 - 1.0) * aspect;
  float c = cos(uRotation);
  float s = sin(uRotation);
  uv = mat2(c, -s, s, c) * uv / uScale;
  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5;
  float a = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uDetail) break;
    float fi = float(i);
    a += cos(fi - d - a * uv.x * uWarp);
    d += sin(uv.y * fi + a);
  }
  d += uTime * 0.5;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;

  vec2 toPointer = (vUv - uPointer.xy) * aspect;
  col += col * uPointer.z * uSheen * 0.8 * exp(-dot(toPointer, toPointer) / 0.09);

  col = hueRotate(col, uHue);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uBrightness;
  col += (hash(gl_FragCoord.xy + uSeed) - 0.5) * uGrain * 0.12;
  col = clamp(col, 0.0, 1.0);

  float alpha = uOpacity;
  if (uFade > 0.0) {
    vec2 px = vUv * uResolution;
    float edge = uFade * mr * 0.5;
    alpha *= smootherstep(edge, px.x) * smootherstep(edge, uResolution.x - px.x);
    alpha *= smootherstep(edge, px.y) * smootherstep(edge, uResolution.y - px.y);
  }
  outColor = vec4(col * alpha, alpha);
}`,Be=48,ve=6,V=3.2,w=(f,A,F)=>Math.min(F,Math.max(A,f)),pe=(f,A,F)=>{const R=f.createShader(A);return R?(f.shaderSource(R,F),f.compileShader(R),f.getShaderParameter(R,f.COMPILE_STATUS)?R:(f.deleteShader(R),null)):null},Ke=({color:f=[1,1,1],speed:A=1,amplitude:F=.1,mouseReact:R=!0,scale:xe=1,detail:Re=8,rotation:ge=0,warp:we=1,hueShift:Ee=0,saturation:Me=1,brightness:Te=1.5,contrast:ye=1,stir:Se=.5,sheen:Ae=.3,clickSwirl:Fe=!0,grain:Pe=0,fade:_e=0,opacity:be=1,resolution:Ue=1,paused:Le=!1,className:Y="",style:De})=>{const $=S.useRef(null),J=S.useRef(null),P=S.useRef(null),Q={colorKey:Array.isArray(f)?f.join(","):String(f),color:f,speed:A,amplitude:F,mouseReact:R,scale:Math.max(.05,xe),detail:w(Math.round(Re),1,24),rotation:ge,warp:we,hueShift:Ee,saturation:Math.max(0,Me),brightness:Math.max(0,Te),contrast:Math.max(0,ye),stir:Math.max(0,Se),sheen:Math.max(0,Ae),clickSwirl:Fe,grain:w(Pe,0,1),fade:w(_e,0,1),opacity:w(be,0,1),resolution:w(Ue,.1,2),paused:Le},g=S.useRef(Q);return g.current=Q,S.useEffect(()=>{var ce;const v=$.current,p=J.current,e=p==null?void 0:p.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1});if(!v||!p||!e)return;const X=pe(e,e.VERTEX_SHADER,Oe),k=pe(e,e.FRAGMENT_SHADER,Ge),x=e.createProgram();if(!X||!k||!x||(e.attachShader(x,X),e.attachShader(x,k),e.linkProgram(x),!e.getProgramParameter(x,e.LINK_STATUS)))return;e.useProgram(x);const Z=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,Z),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);const ee=e.getAttribLocation(x,"aPosition");e.enableVertexAttribArray(ee),e.vertexAttribPointer(ee,2,e.FLOAT,!1,0,0);const n={};for(const o of["uResolution","uTime","uColor","uMouse","uAmplitude","uScale","uRotation","uDetail","uWarp","uHue","uSaturation","uBrightness","uContrast","uGrain","uSeed","uFade","uOpacity","uField","uStir","uPointer","uSheen","uSwirls"])n[o]=e.getUniformLocation(x,o);const L=e.createTexture();e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,L),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.uniform1i(n.uField,0);const O=document.createElement("canvas");O.width=1,O.height=1;const E=O.getContext("2d",{willReadFrequently:!0}),G=((ce=window.matchMedia)==null?void 0:ce.call(window,"(prefers-reduced-motion: reduce)").matches)??!1,u={x:.5,y:.5,inside:!1,tracked:!1},t={width:1,height:1,phase:0,mouse:[.5,.5],presence:0,color:[1,1,1],colorKey:"",cols:0,rows:0,field:new Float32Array(0),scratch:new Float32Array(0),fieldActive:!1,swirls:[],seed:0},B=new Float32Array(ve*4);let M=0,_=0,D=!0,N=!0;const Ce=o=>{if(o.colorKey===t.colorKey)return;if(t.colorKey=o.colorKey,Array.isArray(o.color)){t.color=[0,1,2].map(s=>w(Number(o.color[s]??1),0,1));return}if(!E)return;E.clearRect(0,0,1,1),E.fillStyle="#ffffff",E.fillStyle=String(o.color),E.fillRect(0,0,1,1);const[r,i,a]=E.getImageData(0,0,1,1).data;t.color=[r/255,i/255,a/255]},Ie=()=>{const o=Be,r=w(Math.round(o*t.height/t.width),6,96);o===t.cols&&r===t.rows||(t.cols=o,t.rows=r,t.field=new Float32Array(o*r*2),t.scratch=new Float32Array(o*r*2),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,L),e.texImage2D(e.TEXTURE_2D,0,e.RG16F,o,r,0,e.RG,e.FLOAT,t.field))},Xe=(o,r,i,a)=>{const{cols:s,rows:d,field:h}=t,c=.22,m=t.width/t.height,b=Math.max(0,Math.floor((o-c/m)*s)),H=Math.min(s-1,Math.ceil((o+c/m)*s)),z=Math.max(0,Math.floor((r-c)*d)),j=Math.min(d-1,Math.ceil((r+c)*d));for(let y=z;y<=j;y++)for(let l=b;l<=H;l++){const C=((l+.5)/s-o)*m,ue=(y+.5)/d-r,U=1-(C*C+ue*ue)/(c*c);if(U<=0)continue;const I=(y*s+l)*2,le=h[I]+i*U*U*3.2,fe=h[I+1]+a*U*U*3.2,q=Math.hypot(le,fe),de=.4,me=q>0?de*Math.tanh(q/de)/q:0;h[I]=le*me,h[I+1]=fe*me}t.fieldActive=!0},ke=o=>{const{cols:r,rows:i,field:a,scratch:s}=t,d=Math.exp(-o*1.4);let h=0;for(let c=0;c<i;c++)for(let m=0;m<r;m++){const b=(c*r+m)*2,H=(c*r+Math.max(0,m-1))*2,z=(c*r+Math.min(r-1,m+1))*2,j=(Math.max(0,c-1)*r+m)*2,y=(Math.min(i-1,c+1)*r+m)*2;for(let l=0;l<2;l++){const C=(a[b+l]*12+a[H+l]+a[z+l]+a[j+l]+a[y+l])/16;s[b+l]=C*d,h=Math.max(h,Math.abs(s[b+l]))}}a.set(s),h<4e-4&&(a.fill(0),t.fieldActive=!1)},W=()=>{const o=g.current;Ce(o),Ie(),e.viewport(0,0,p.width,p.height),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,L),e.texSubImage2D(e.TEXTURE_2D,0,0,0,t.cols,t.rows,e.RG,e.FLOAT,t.field),B.fill(0),t.swirls.forEach((r,i)=>{const a=.21*(1+.4*r.age),s=Math.exp(-r.age*1.35)-Math.exp(-r.age*10),d=Math.min(1,(V-r.age)/.8);B.set([r.x,r.y,a,3*s*d*(.21/a)**2],i*4)}),e.uniform2f(n.uResolution,t.width,t.height),e.uniform1f(n.uTime,t.phase),e.uniform3f(n.uColor,t.color[0],t.color[1],t.color[2]),e.uniform2f(n.uMouse,t.mouse[0],t.mouse[1]),e.uniform1f(n.uAmplitude,o.amplitude),e.uniform1f(n.uScale,o.scale),e.uniform1f(n.uRotation,o.rotation*Math.PI/180),e.uniform1i(n.uDetail,o.detail),e.uniform1f(n.uWarp,o.warp),e.uniform1f(n.uHue,o.hueShift*Math.PI/180),e.uniform1f(n.uSaturation,o.saturation),e.uniform1f(n.uBrightness,o.brightness),e.uniform1f(n.uContrast,o.contrast),e.uniform1f(n.uGrain,o.grain),e.uniform1f(n.uSeed,t.seed),e.uniform1f(n.uFade,o.fade),e.uniform1f(n.uOpacity,o.opacity),e.uniform1f(n.uStir,o.mouseReact?o.stir:0),e.uniform3f(n.uPointer,u.x,u.y,o.mouseReact?t.presence:0),e.uniform1f(n.uSheen,o.sheen),e.uniform4fv(n.uSwirls,B),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.drawArrays(e.TRIANGLES,0,3)},te=o=>{if(M=0,!N||!D)return;const r=g.current,i=_?Math.min(.05,(o-_)/1e3):1/60;_=o;const a=!r.paused&&!G;a&&(t.phase+=i*r.speed);const s=r.mouseReact&&u.tracked?[u.x,u.y]:[.5,.5],d=1-Math.exp(-i*5);t.mouse[0]+=(s[0]-t.mouse[0])*d,t.mouse[1]+=(s[1]-t.mouse[1])*d,t.presence+=((u.inside?1:0)-t.presence)*(1-Math.exp(-i*4)),t.fieldActive&&ke(i),t.swirls=t.swirls.filter(c=>(c.age+=i)<V),r.grain>0&&a&&(t.seed=Math.floor(o/42)%997),W();const h=Math.abs(s[0]-t.mouse[0])>5e-4||Math.abs(s[1]-t.mouse[1])>5e-4||Math.abs((u.inside?1:0)-t.presence)>.002;a||h||t.fieldActive||t.swirls.length?M=requestAnimationFrame(te):_=0},T=()=>{M||!N||!D||(M=requestAnimationFrame(te))},oe=o=>{const r=v.getBoundingClientRect();return{x:(o.clientX-r.left)/Math.max(1,r.width),y:1-(o.clientY-r.top)/Math.max(1,r.height)}},re=o=>{const r=g.current,{x:i,y:a}=oe(o),s=i>=0&&i<=1&&a>=0&&a<=1;s&&r.mouseReact&&!G&&u.inside&&r.stir>0&&Xe(i,a,i-u.x,a-u.y),u.x=i,u.y=a,u.inside=s,s&&(u.tracked=!0),T()},ae=()=>{u.inside=!1,T()},ie=o=>{if(!g.current.clickSwirl||G)return;const{x:i,y:a}=oe(o);if(!(i<0||i>1||a<0||a>1)){if(t.swirls.length>=ve){if(t.swirls[0].age<V-.4)return;t.swirls.shift()}t.swirls.push({x:i,y:a,age:0}),T()}},K=()=>{const o=g.current,r=Math.min(window.devicePixelRatio||1,2)*o.resolution;t.width=Math.max(1,v.clientWidth),t.height=Math.max(1,v.clientHeight),p.width=Math.max(1,Math.round(t.width*r)),p.height=Math.max(1,Math.round(t.height*r)),W(),T()};P.current=()=>{const o=Math.min(window.devicePixelRatio||1,2)*g.current.resolution;p.width!==Math.max(1,Math.round(t.width*o))?K():M||W(),T()};const ne=new ResizeObserver(K);ne.observe(v);const se=new IntersectionObserver(o=>{D=o.some(r=>r.isIntersecting),D&&(_=0,T())});return se.observe(v),window.addEventListener("pointermove",re,{passive:!0}),window.addEventListener("pointerdown",ie,{passive:!0}),document.documentElement.addEventListener("pointerleave",ae),K(),()=>{N=!1,cancelAnimationFrame(M),P.current=null,ne.disconnect(),se.disconnect(),window.removeEventListener("pointermove",re),window.removeEventListener("pointerdown",ie),document.documentElement.removeEventListener("pointerleave",ae),e.deleteTexture(L),e.deleteBuffer(Z),e.deleteProgram(x),e.deleteShader(X),e.deleteShader(k)}},[]),S.useEffect(()=>{var v;(v=P.current)==null||v.call(P)}),he.jsx("div",{ref:$,className:`iridescence-container${Y?` ${Y}`:""}`,style:De,children:he.jsx("canvas",{ref:J,className:"iridescence-canvas","aria-hidden":"true"})})};export{Ke as default};
