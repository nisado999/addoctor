import{r as S,j as ee}from"./vendor-DXcH-vAE.js";const V=5,oe=3,pe=2.4,ve=`#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,xe=`#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uStops[${V}];
uniform int uStopCount;
uniform float uAmplitude;
uniform float uBlend;
uniform float uHeight;
uniform float uScale;
uniform float uGlow;
uniform float uBrightness;
uniform int uLayers;
uniform float uFlip;
uniform vec3 uPointer;
uniform float uReveal;
uniform float uOpacity;
uniform float uLightMode;
out vec4 outColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uStopCount - 1);
  int i = int(min(floor(x), float(uStopCount - 2)));
  float f = x - float(i);
  f = f * f * (3.0 - 2.0 * f);
  vec3 lch = mix(uStops[i], uStops[i + 1], f);
  lch.x = mix(lch.x, min(lch.x, 0.7), uLightMode);
  return toSrgb(oklabToLinear(vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z))));
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float y = 1.0 - frag.y / uResolution.y;
  y = mix(y, 1.0 - y, uFlip);
  float u = frag.x / uResolution.x;
  float X = (frag.x - uResolution.x * 0.5) / uResolution.y;
  float t = uTime;
  float reach = uPointer.z * exp(-pow((X - uPointer.x) / 0.38, 2.0));

  vec3 glow = vec3(0.0);
  float cover = 0.0;
  for (int k = 0; k < ${oe}; k++) {
    if (k >= uLayers) break;
    float layer = float(k);
    float seed = layer * 13.7;
    float pace = t * (1.0 - layer * 0.18);
    float warp = snoise(vec2(X * 0.45 * uScale + pace * 0.02 + seed, pace * 0.05 + seed));
    float wave = snoise(vec2(X * 0.75 * uScale + warp * 0.35 - pace * 0.03 + seed, pace * 0.07 - seed)) * 0.72
      + snoise(vec2(X * 1.6 * uScale + warp * 0.5 + pace * 0.04 - seed, pace * 0.1 + seed * 0.5)) * 0.28;
    float hem = uHeight + layer * 0.07 + wave * 0.15 * uAmplitude;
    hem += reach * 0.08 * (layer < 0.5 ? 1.0 : 0.4);
    hem = mix(-0.25, hem, uReveal);

    float soft = (0.04 + uBlend * 0.16) * (1.0 + layer * 0.9);
    float rise = hem - y;
    float low = -soft - uGlow * 0.14;
    float high = 0.26 + soft * 0.6;
    float body = pow(smootherstep(low, high, rise), 1.5 + uGlow * 0.6);
    float lobes = 0.86 + 0.14 * snoise(vec2(X * 0.9 * uScale - pace * 0.025 + seed, y * 0.3 + pace * 0.04));
    float alpha = body * lobes * (layer < 0.5 ? 1.0 : 0.32 / layer);
    alpha = clamp(alpha * (1.0 + reach * 0.25 * smootherstep(0.9, 0.0, abs(y - hem))), 0.0, 1.0);

    vec3 tint = ramp(u + 0.05 * sin(pace * 0.08 + layer * 2.3) + layer * 0.1 + max(rise, 0.0) * 0.05);
    glow = 1.0 - (1.0 - glow) * (1.0 - tint * alpha);
    cover = 1.0 - (1.0 - cover) * (1.0 - alpha);
  }

  float fade = smootherstep(0.0, 0.7, uReveal) * uOpacity;
  float strength = clamp(uBrightness, 0.0, 2.0);
  glow *= fade * min(strength, 1.0);
  cover *= fade * min(strength, 1.0);
  glow = 1.0 - pow(1.0 - glow, vec3(max(strength, 1.0)));
  float dither = (hash(frag) - 0.5) / 255.0;

  if (uLightMode > 0.5) {
    vec3 tint = cover > 0.0001 ? glow / cover : vec3(0.0);
    cover *= smootherstep(0.0, 0.25, cover);
    float alpha = cover * 0.7;
    outColor = vec4(tint * alpha + dither, clamp(alpha + dither, 0.0, 1.0));
    return;
  }
  outColor = vec4(glow + dither, clamp(cover + dither, 0.0, 1.0));
}`,F=(o,c,f)=>Math.min(f,Math.max(c,o)),ye=o=>{const[c,f,r]=o.map(A=>A<=.04045?A/12.92:Math.pow((A+.055)/1.055,2.4)),l=Math.cbrt(.4122214708*c+.5363325363*f+.0514459929*r),m=Math.cbrt(.2119034982*c+.6806995451*f+.1073969566*r),v=Math.cbrt(.0883024619*c+.2817188376*f+.6299787005*r),h=[.2104542553*l+.793617785*m-.0040720468*v,1.9779984951*l-2.428592205*m+.4505937099*v,.0259040371*l+.7827717662*m-.808675766*v];return[h[0],Math.hypot(h[1],h[2]),Math.atan2(h[2],h[1])]},ge=o=>{const c=o.findIndex(l=>l[1]>.02);let r=c===-1?0:o[c][2];return o.map(l=>{let m=l[1]>.02?l[2]:r;for(;m-r>Math.PI;)m-=Math.PI*2;for(;m-r<-Math.PI;)m+=Math.PI*2;return r=m,[l[0],l[1],m]})},te=(o,c,f)=>{const r=o.createShader(c);return r?(o.shaderSource(r,f),o.compileShader(r),o.getShaderParameter(r,o.COMPILE_STATUS)?r:(o.deleteShader(r),null)):null},we=o=>{const c=te(o,o.VERTEX_SHADER,ve),f=te(o,o.FRAGMENT_SHADER,xe),r=o.createProgram();if(!c||!f||!r)return null;if(o.attachShader(r,c),o.attachShader(r,f),o.bindAttribLocation(r,0,"aPosition"),o.linkProgram(r),o.deleteShader(c),o.deleteShader(f),!o.getProgramParameter(r,o.LINK_STATUS))return o.deleteProgram(r),null;const l={},m=o.getProgramParameter(r,o.ACTIVE_UNIFORMS);for(let v=0;v<m;v++){const h=o.getActiveUniform(r,v);h&&(l[h.name.replace("[0]","")]=o.getUniformLocation(r,h.name))}return{program:r,uniforms:l}},be=({colorStops:o=["#5227FF","#7cff67","#5227FF"],amplitude:c=1,blend:f=.5,speed:r=1,time:l,height:m=.45,scale:v=1,glow:h=.6,brightness:A=1,layers:re=1,direction:ne="top",mouseInteraction:ae=!0,intro:ie=!0,opacity:ce=1,lightMode:se=!1,paused:le=!1,dpr:ue,className:G="",style:fe})=>{const N=S.useRef(null),U=S.useRef(null),R=S.useRef(null),E=(Array.isArray(o)?o:[]).filter(Boolean).map(String).slice(0,V),D={stops:E.length>=2?E:E.length===1?[E[0],E[0]]:["#5227FF","#7cff67"],amplitude:Math.max(0,c),blend:F(f,0,1),speed:r,time:l,height:F(m,0,1),scale:Math.max(.1,v),glow:Math.max(0,h),brightness:Math.max(0,A),layers:F(Math.round(re),1,oe),flip:ne==="bottom"?1:0,mouseInteraction:ae,intro:ie,opacity:F(ce,0,1),lightMode:se,paused:le,dpr:ue},x=S.useRef(D);return x.current=D,S.useEffect(()=>{var Q;const y=N.current,d=U.current,e=d==null?void 0:d.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1});if(!y||!d||!e)return;const C=we(e);if(!C)return;const s=C.uniforms,H=e.createBuffer(),B=e.createVertexArray();e.bindVertexArray(B),e.bindBuffer(e.ARRAY_BUFFER,H),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0);const g=document.createElement("canvas").getContext("2d",{willReadFrequently:!0}),T=((Q=window.matchMedia)==null?void 0:Q.call(window,"(prefers-reduced-motion: reduce)").matches)??!1,O=new Map,me=t=>{if(O.has(t))return O.get(t);let n=[1,1,1];if(g){g.clearRect(0,0,1,1),g.fillStyle="#ffffff",g.fillStyle=t,g.fillRect(0,0,1,1);const[u,p,P]=g.getImageData(0,0,1,1).data;n=[u/255,p/255,P/255]}return O.set(t,n),n},j=new Float32Array(V*3),w={width:1,height:1},i={x:0,y:0,inside:!1},a={clock:0,px:0,py:.5,reach:0,reveal:x.current.intro&&!T?0:1};let M=0,b=0,z=!0;const I=()=>{const t=x.current;ge(t.stops.map(u=>ye(me(u)))).forEach((u,p)=>j.set(u,p*3));const n=a.reveal;e.viewport(0,0,d.width,d.height),e.useProgram(C.program),e.bindVertexArray(B),e.uniform2f(s.uResolution,d.width,d.height),e.uniform1f(s.uTime,t.time!==void 0?t.time*t.speed*.1:a.clock),e.uniform3fv(s.uStops,j),e.uniform1i(s.uStopCount,t.stops.length),e.uniform1f(s.uAmplitude,t.amplitude),e.uniform1f(s.uBlend,t.blend),e.uniform1f(s.uHeight,t.height),e.uniform1f(s.uScale,t.scale),e.uniform1f(s.uGlow,t.glow),e.uniform1f(s.uBrightness,t.brightness),e.uniform1i(s.uLayers,t.layers),e.uniform1f(s.uFlip,t.flip),e.uniform3f(s.uPointer,a.px,a.py,a.reach),e.uniform1f(s.uReveal,1-Math.pow(1-n,3)),e.uniform1f(s.uOpacity,t.opacity),e.uniform1f(s.uLightMode,t.lightMode?1:0),e.drawArrays(e.TRIANGLES,0,3)},Y=t=>{if(M=0,!z||document.hidden)return;const n=x.current,u=b?F((t-b)/1e3,5e-4,.05):1/60;if(b=t,n.paused){a.reveal=1,I(),b=0;return}const p=T?0:1;a.clock+=u*n.speed*p;const P=n.mouseInteraction&&i.inside&&!T,Z=1-Math.exp(-u/.6);if(P){const he=(i.x-w.width/2)/w.height,de=n.flip?1-i.y/w.height:i.y/w.height;a.px+=(he-a.px)*Z,a.py+=(de-a.py)*Z}a.reach+=((P?1:0)-a.reach)*(1-Math.exp(-u/(P?.9:1.4))),!n.intro||T?a.reveal=1:a.reveal<1&&(a.reveal=Math.min(1,a.reveal+u/pe)),I(),M=requestAnimationFrame(Y)},L=()=>{!M&&z&&!document.hidden&&(M=requestAnimationFrame(Y))},X=()=>{const t=x.current,n=Math.max(1,y.clientWidth),u=Math.max(1,y.clientHeight),p=Math.min(t.dpr||window.devicePixelRatio||1,2);w.width=n,w.height=u,d.width=Math.max(1,Math.round(n*p)),d.height=Math.max(1,Math.round(u*p)),I(),L()},k=t=>{const n=y.getBoundingClientRect();i.x=t.clientX-n.left,i.y=t.clientY-n.top;const u=i.inside;if(i.inside=i.x>=0&&i.y>=0&&i.x<=n.width&&i.y<=n.height,i.inside&&!u){const p=x.current;a.px=(i.x-n.width/2)/Math.max(1,n.height),a.py=p.flip?1-i.y/Math.max(1,n.height):i.y/Math.max(1,n.height)}x.current.paused||L()},_=t=>{t.pointerType!=="mouse"&&(i.inside=!1)},$=()=>{i.inside=!1},q=()=>{b=0,L()},W=new ResizeObserver(X);W.observe(y);const K=new IntersectionObserver(t=>{z=t.some(n=>n.isIntersecting),z&&(b=0,L())});K.observe(y),window.addEventListener("pointermove",k,{passive:!0}),window.addEventListener("pointerdown",k,{passive:!0}),window.addEventListener("pointerup",_,{passive:!0}),window.addEventListener("pointercancel",_,{passive:!0}),document.documentElement.addEventListener("pointerleave",$),document.addEventListener("visibilitychange",q),X();let J=x.current.dpr;return R.current=()=>{const t=x.current;if(t.dpr!==J){J=t.dpr,X();return}M||I(),L()},()=>{var t;cancelAnimationFrame(M),R.current=null,W.disconnect(),K.disconnect(),window.removeEventListener("pointermove",k),window.removeEventListener("pointerdown",k),window.removeEventListener("pointerup",_),window.removeEventListener("pointercancel",_),document.documentElement.removeEventListener("pointerleave",$),document.removeEventListener("visibilitychange",q),e.deleteProgram(C.program),e.deleteBuffer(H),e.deleteVertexArray(B),(t=e.getExtension("WEBGL_lose_context"))==null||t.loseContext()}},[]),S.useEffect(()=>{var y;(y=R.current)==null||y.call(R)}),ee.jsx("div",{ref:N,className:`aurora-container${G?` ${G}`:""}`,style:fe,children:ee.jsx("canvas",{ref:U,className:"aurora-canvas","aria-hidden":"true"})})};export{be as default};
