import{r as L,j as le}from"./vendor-DXcH-vAE.js";const Ce=24e5,H=4,Pe=`#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`,Ae=`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uPixel;
uniform float uTime;
uniform float uLines;
uniform float uWidth;
uniform float uGlow;
uniform float uBrightness;
uniform float uHighlight;
uniform float uHighlightWidth;
uniform float uWarp;
uniform float uScale;
uniform float uRotation;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uCycle;
uniform float uEdge;
uniform vec4 uMouse;
uniform vec4 uRipples[${H}];
uniform float uReveal;
uniform float uLight;
uniform float uOpacity;
out vec4 fragColor;

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float bend(vec2 p, float t) {
  vec2 q = p * 2.0 / uScale;
  float w = 0.6 * sin(q.x * 0.55 + t * 0.4 + 0.6 * sin(q.y * 0.9 - t * 0.28));
  w += 0.21 * sin(q.x * 1.3 - t * 0.33 + q.y * 0.8 + 1.3);
  w += 0.12 * sin(q.y * 2.3 + q.x * 0.9 - t * 0.37 + 0.4);
  return w * uWarp * uScale * 0.46;
}

float river(vec2 p, float y, float t) {
  float drift = 0.7 * (0.18 * sin(p.x * 1.6 - t * 0.33 + 0.7) + 0.1 * sin(p.x * 3.1 + t * 0.21));
  float center = 0.5 * (0.2 * sin(t * 0.17) + 0.08 * sin(t * 0.29 + 1.3));
  float width = 0.13 * uHighlightWidth;
  float near = (y - center - drift) / width;
  float far = (y + 0.22 * sin(t * 0.13 + 2.0) - drift * 0.6 + 0.3) / (width * 0.55);
  return max(exp(-near * near), exp(-far * far) * 0.7);
}

vec3 palette(float x) {
  x = fract(x) * 3.0;
  if (x < 1.0) return mix(uColor1, uColor2, smoothstep(0.0, 1.0, x));
  if (x < 2.0) return mix(uColor2, uColor3, smoothstep(1.0, 2.0, x));
  return mix(uColor3, uColor1, smoothstep(2.0, 3.0, x));
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = rotate((gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y, uRotation);
  float t = uTime;

  vec2 mouse = rotate(uMouse.xy, uRotation);
  vec2 toMouse = p - mouse;
  float lens = exp(-dot(toMouse, toMouse) / (uMouse.w * uMouse.w));
  p.y -= (p.y - mouse.y) * lens * uMouse.z;

  float ring = 0.0;
  for (int i = 0; i < ${H}; i++) {
    vec4 ripple = uRipples[i];
    if (ripple.w <= 0.0) continue;
    float x = (length(p - rotate(ripple.xy, uRotation)) - ripple.z * 0.6) / 0.08;
    float fade = exp(-ripple.z * 1.3) * smoothstep(0.0, 0.12, ripple.z);
    float bump = exp(-x * x);
    p.y -= x * bump * 0.07 * fade;
    ring += bump * fade;
  }

  float w = bend(p, t);
  float y = p.y + w;
  float phi = y * uLines;
  float fw = max(fwidth(phi), 1e-5);
  float crowd = smoothstep(0.18, 0.5, fw);

  float fold = smoothstep(1.3, 2.2, fw * uResolution.y / uLines);
  float shimmer = mix(1.0, smoothstep(0.15, 0.85, noise(vec2(y * 1.6 + t * 0.07, p.x * 0.55 - t * 0.22))), 0.5);
  float lit = max(river(p, y, t), fold * 0.9) * shimmer;
  float light = mix(1.0, 0.07 + 0.93 * lit, uHighlight);
  light += (1.0 - light) * min(lens * step(0.0001, uMouse.z) * 0.9 + ring * 0.6, 1.0);

  float dist = abs(fract(phi + 0.5) - 0.5) / fw;
  float width = uWidth * uPixel * (1.0 + mix(1.5, 0.6, uLight) * lit * uHighlight);
  float cover = clamp(min(dist + width * 0.5, 0.5) - max(dist - width * 0.5, -0.5), 0.0, 1.0);
  cover = mix(cover, min(width * fw, 1.0), crowd);
  float halo = exp(-dist / (2.2 * uPixel)) * (1.0 - crowd) * uGlow;
  float thread = mix(1.0, 0.55 + 0.45 * hash(vec2(floor(phi + 0.5), 7.3)), 0.45 * (1.0 - crowd));

  float span = 0.5 * sqrt(aspect * aspect + 1.0);
  float sweep = -span + (2.0 * span + 0.6) * uReveal;
  float reveal = 1.0 - smoothstep(sweep - 0.6, sweep, p.x);

  float edge = 1.0;
  if (uEdge > 0.0) {
    float ex = min(uv.x, 1.0 - uv.x) * aspect;
    float ey = min(uv.y, 1.0 - uv.y);
    edge = smootherstep(0.0, uEdge * 0.5, ex) * smootherstep(0.0, uEdge * 0.5, ey);
  }

  vec3 tint = palette(y * 0.3 + p.x * 0.2 + uCycle);
  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;

  if (uLight > 0.5) {
    float low = min(tint.r, min(tint.g, tint.b));
    float chroma = max(tint.r, max(tint.g, tint.b)) - low;
    vec3 hue = (tint - low) / max(chroma, 1e-3);
    vec3 ink = mix(vec3(0.08), hue * 0.56 + 0.06, smoothstep(0.04, 0.2, chroma));
    float alpha = (cover + halo * 0.35) * thread * light * uBrightness * reveal * edge * 0.78 * uOpacity;
    alpha = clamp(alpha + grain, 0.0, 1.0);
    fragColor = vec4(ink * alpha, alpha);
    return;
  }

  float strength = (cover + halo) * thread * light * uBrightness * reveal * edge;
  vec3 color = clamp(tint * strength * uOpacity, 0.0, 1.0);
  float alpha = max(color.r, max(color.g, color.b));
  color = clamp(color + grain, 0.0, 1.0);
  fragColor = vec4(min(color, vec3(alpha)), alpha);
}`,h=(t,l,a)=>Math.min(a,Math.max(l,t)),D=t=>{const l=String(t||"").trim(),a=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(l);if(a){const g=a[1].length===3?a[1].replace(/./g,p=>p+p):a[1];return[0,2,4].map(p=>parseInt(g.slice(p,p+2),16)/255)}const r=/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(l);return r?[r[1],r[2],r[3]].map(g=>h(parseFloat(g)/255,0,1)):[1,1,1]},ce=(t,l,a)=>{const r=t.createShader(l);return r?(t.shaderSource(r,a),t.compileShader(r),t.getShaderParameter(r,t.COMPILE_STATUS)?r:(console.error(t.getShaderInfoLog(r)),t.deleteShader(r),null)):null},Te=t=>{const l=ce(t,t.VERTEX_SHADER,Pe),a=ce(t,t.FRAGMENT_SHADER,Ae),r=l&&a?t.createProgram():null;if(!l||!a||!r)return l&&t.deleteShader(l),a&&t.deleteShader(a),null;if(t.attachShader(r,l),t.attachShader(r,a),t.linkProgram(r),t.deleteShader(l),t.deleteShader(a),!t.getProgramParameter(r,t.LINK_STATUS))return console.error(t.getProgramInfoLog(r)),t.deleteProgram(r),null;const g={},p=t.getProgramParameter(r,t.ACTIVE_UNIFORMS);for(let C=0;C<p;C++){const P=t.getActiveUniform(r,C);P&&(g[P.name.replace(/\[0\]$/,"")]=t.getUniformLocation(r,P.name))}return{program:r,uniforms:g}},Fe=({color1:t="#ffffff",color2:l="#ffffff",color3:a="#ffffff",colorCycleSpeed:r=1,speed:g=.3,lineCount:p=72,lineWidth:C=1.3,glow:P=.6,brightness:fe=1,highlight:ue=1,highlightWidth:he=1,warpIntensity:me=1,warpScale:pe=1,rotation:de=-33,edgeFade:ge=0,enableMouseInteraction:ve=!0,mouseInfluence:xe=2,clickRipple:we=!0,intro:ye=!0,lightMode:Re=!1,opacity:Ee=1,maxDevicePixelRatio:Me=2,className:U="",style:Le})=>{const X=L.useRef(null),k=L.useRef(null),A=L.useRef(null),[N,be]=L.useState(0),$={color1:D(t),color2:D(l),color3:D(a),cycleSpeed:r,speed:Math.max(0,g),lines:h(p,2,400),width:h(C,.25,12),glow:Math.max(0,P),brightness:Math.max(0,fe),highlight:h(ue,0,1),highlightWidth:h(he,.2,5),warp:h(me,0,3),scale:h(pe,.2,4),rotation:de*Math.PI/180,edge:h(ge,0,1),mouse:ve,influence:h(xe,0,3),clickRipple:we,intro:ye,light:Re,opacity:h(Ee,0,1),maxRatio:h(Me,.5,3)},T=L.useRef($);return T.current=$,L.useEffect(()=>{var v;(v=A.current)==null||v.call(A)}),L.useEffect(()=>{const v=X.current,f=k.current;if(!v||!f)return;const o=f.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:"high-performance"}),F=o?Te(o):null;if(!o||!F)return;const I=window.matchMedia("(prefers-reduced-motion: reduce)").matches,j=o.createVertexArray(),x={width:1,height:1,ratio:1},y={x:0,y:0,inside:!1},s={x:0,y:0,presence:0,ready:!1},d=[],b=new Float32Array(H*4);let Y=Math.random()*60,K=0,_=T.current.intro&&!I&&N===0?0:1,R=0,W=0,z=!0,O=document.visibilityState!=="hidden",V=!1;const G=()=>{const i=T.current,e=v.getBoundingClientRect(),c=Math.max(1,e.width),m=Math.max(1,e.height),E=Math.min(window.devicePixelRatio||1,i.maxRatio,Math.sqrt(Ce/(c*m))),S=Math.max(1,Math.round(c*E)),n=Math.max(1,Math.round(m*E));(f.width!==S||f.height!==n)&&(f.width=S,f.height=n),x.width=c,x.height=m,x.ratio=S/c},J=(i,e)=>[(i-x.width/2)/x.height,(x.height/2-e)/x.height],Q=i=>{if(R=0,V)return;const e=T.current,c=h((i-W)/1e3||0,0,.05);W=Math.max(W,i),Y+=c*e.speed*2.5*(I?.25:1),K+=c*e.speed*e.cycleSpeed*.05,_<1&&(_=Math.min(1,_+c/1.8));const m=e.mouse&&y.inside&&!I;if(m){const[u,M]=J(y.x,y.y);s.ready||(s.x=u,s.y=M,s.ready=!0);const se=1-Math.exp(-c*10);s.x+=(u-s.x)*se,s.y+=(M-s.y)*se}const E=m?1:0;s.presence+=(E-s.presence)*(1-Math.exp(-c*5)),s.presence<.002&&!m&&(s.ready=!1);for(let u=d.length-1;u>=0;u--)d[u].age+=c,d[u].age>2.6&&d.splice(u,1);b.fill(0),d.forEach((u,M)=>{b[M*4]=u.x,b[M*4+1]=u.y,b[M*4+2]=u.age,b[M*4+3]=1});const S=1-Math.pow(1-_,3);o.viewport(0,0,f.width,f.height),o.useProgram(F.program),o.bindVertexArray(j);const n=F.uniforms;o.uniform2f(n.uResolution,f.width,f.height),o.uniform1f(n.uPixel,x.ratio),o.uniform1f(n.uTime,Y),o.uniform1f(n.uLines,e.lines),o.uniform1f(n.uWidth,e.width),o.uniform1f(n.uGlow,e.glow),o.uniform1f(n.uBrightness,e.brightness),o.uniform1f(n.uHighlight,e.highlight),o.uniform1f(n.uHighlightWidth,e.highlightWidth),o.uniform1f(n.uWarp,e.warp*(.25+.75*S)),o.uniform1f(n.uScale,e.scale),o.uniform1f(n.uRotation,e.rotation),o.uniform3f(n.uColor1,e.color1[0],e.color1[1],e.color1[2]),o.uniform3f(n.uColor2,e.color2[0],e.color2[1],e.color2[2]),o.uniform3f(n.uColor3,e.color3[0],e.color3[1],e.color3[2]),o.uniform1f(n.uCycle,K),o.uniform1f(n.uEdge,e.edge),o.uniform4f(n.uMouse,s.x,s.y,s.presence*e.influence*.16,.2),o.uniform4fv(n.uRipples,b),o.uniform1f(n.uReveal,S),o.uniform1f(n.uLight,e.light?1:0),o.uniform1f(n.uOpacity,e.opacity),o.drawArrays(o.TRIANGLES,0,3);const Se=Math.abs(E-s.presence)>.002;(e.speed>0&&!I||_<1||Se||d.length>0||m)&&z&&O&&(R=requestAnimationFrame(Q))},w=()=>{R||V||!z||!O||(W=performance.now(),R=requestAnimationFrame(Q))};A.current=()=>{G(),w()};const Z=i=>{const e=v.getBoundingClientRect();return{x:i.clientX-e.left,y:i.clientY-e.top,inside:i.clientX>=e.left&&i.clientX<=e.right&&i.clientY>=e.top&&i.clientY<=e.bottom}},ee=i=>{const e=Z(i);y.x=e.x,y.y=e.y,y.inside=e.inside,w()},te=i=>{const e=T.current,c=Z(i);if(!c.inside||!e.clickRipple||I)return;const[m,E]=J(c.x,c.y);d.push({x:m,y:E,age:0}),d.length>H&&d.shift(),w()},B=()=>{y.inside=!1,w()},q=i=>{i.pointerType!=="mouse"&&B()};window.addEventListener("pointermove",ee,{passive:!0}),window.addEventListener("pointerdown",te,{passive:!0}),window.addEventListener("pointerup",q,{passive:!0}),window.addEventListener("pointercancel",q,{passive:!0}),document.documentElement.addEventListener("pointerleave",B);const oe=i=>{i.preventDefault(),V=!0,cancelAnimationFrame(R),R=0},re=()=>be(i=>i+1);f.addEventListener("webglcontextlost",oe),f.addEventListener("webglcontextrestored",re);const ie=new ResizeObserver(()=>{G(),w()});ie.observe(v);const ne=new IntersectionObserver(i=>{z=i.some(e=>e.isIntersecting),w()});ne.observe(v);const ae=()=>{O=document.visibilityState!=="hidden",w()};return document.addEventListener("visibilitychange",ae),G(),w(),()=>{cancelAnimationFrame(R),A.current=null,ie.disconnect(),ne.disconnect(),window.removeEventListener("pointermove",ee),window.removeEventListener("pointerdown",te),window.removeEventListener("pointerup",q),window.removeEventListener("pointercancel",q),document.documentElement.removeEventListener("pointerleave",B),document.removeEventListener("visibilitychange",ae),f.removeEventListener("webglcontextlost",oe),f.removeEventListener("webglcontextrestored",re),o.isContextLost()||(o.deleteVertexArray(j),o.deleteProgram(F.program))}},[N]),le.jsx("div",{ref:X,className:`line-waves${U?` ${U}`:""}`,style:Le,children:le.jsx("canvas",{ref:k,className:"line-waves__canvas","aria-hidden":"true"})})};export{Fe as default};
