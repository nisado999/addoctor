import{r as b,j as me}from"./vendor-DXcH-vAE.js";const Xe=`#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,xe=`
uniform vec2 uView;
uniform float uScale;
uniform float uRotation;
uniform float uTime;
uniform float uWave;
uniform float uRipple;
uniform float uFold;
uniform vec2 uShift;
uniform vec4 uPointer;
uniform vec2 uDrag;
uniform vec4 uWaves[4];

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2 r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rot * uv;
}

vec2 bend(vec2 uv) {
  vec2 aspect = vec2(uView.x / uView.y, 1.0);
  vec2 offset = (uv - uPointer.xy) * aspect;
  float touch = uPointer.z * exp(-dot(offset, offset) / (uPointer.w * uPointer.w));
  uv -= uDrag * touch;
  for (int i = 0; i < 4; i++) {
    vec4 wave = uWaves[i];
    if (wave.w <= 0.0) continue;
    vec2 q = (uv - wave.xy) * aspect;
    float dist = length(q);
    float front = dist - wave.z;
    float ring = exp(-front * front * 60.0) * wave.w;
    uv += q / max(dist, 0.0001) / aspect * ring * 0.034 * sin(front * 34.0);
  }
  return uv;
}

float silk(vec2 vUv) {
  vec2 uv = rotateUvs(vUv * uScale, uRotation);
  vec2 tex = uv * uScale + uShift;
  float tOffset = uTime;
  tex.y += 0.03 * uWave * sin(8.0 * tex.x - tOffset);
  return 0.6 + 0.4 * uFold * sin(5.0 * (tex.x + tex.y + cos(3.0 * tex.x + 5.0 * tex.y) + 0.02 * tOffset) + uRipple * sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));
}
`,Be=`#version 300 es
precision highp float;
${xe}
out vec4 outColor;

void main() {
  vec2 vUv = gl_FragCoord.xy / uView;
  float pattern = silk(bend(vUv));
  float n = clamp((pattern - 0.2) / 0.8, 0.0, 1.0);
  outColor = vec4(pow(n, 6.0), 0.0, 0.0, 1.0);
}`,Ge=`#version 300 es
precision highp float;
${xe}
uniform sampler2D uBloom;
uniform vec3 uColor;
uniform vec3 uSheenColor;
uniform float uNoiseIntensity;
uniform float uDepth;
uniform float uSheen;
uniform float uGlow;
uniform float uLightMode;
uniform vec3 uLight;
uniform vec2 uStep;
uniform float uPresence;
uniform float uFade;
out vec4 outColor;

float smootherstep01(float t) {
  t = clamp(t, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 softClip(vec3 c) {
  vec3 over = max(c - 0.75, 0.0);
  return min(c, 0.75) + 0.25 * (1.0 - exp(-over * 4.0));
}

void main() {
  vec2 vUv = gl_FragCoord.xy / uView;
  vec2 coord = bend(vUv);
  float pattern = silk(coord);
  float rnd = noise(gl_FragCoord.xy);
  float n = clamp((pattern - 0.2) / 0.8, 0.0, 1.0);

  float gx = silk(coord + vec2(uStep.x, 0.0)) - pattern;
  float gy = silk(coord + vec2(0.0, uStep.y)) - pattern;
  vec3 normal = normalize(vec3(-gx * 26.0, -gy * 26.0, 1.0));
  vec3 toLight = normalize(vec3(uLight.xy, 0.85));
  float relief = 1.0 + (dot(normal, toLight) - toLight.z) * 1.8 * uDepth;
  vec3 halfway = normalize(toLight + vec3(0.0, 0.0, 1.0));
  float gloss = pow(max(dot(normal, halfway), 0.0), 48.0) * smoothstep(0.25, 0.85, n);
  float crest = pow(n, 5.0);
  float shine = (gloss * 0.85 + crest * 0.4) * uSheen * (1.0 + uLight.z * 0.6);

  float bloom = 0.0;
  if (uGlow > 0.0) {
    bloom += textureLod(uBloom, vUv, 1.0).r * 0.35;
    bloom += textureLod(uBloom, vUv, 2.0).r * 0.3;
    bloom += textureLod(uBloom, vUv, 3.0).r * 0.2;
    bloom += textureLod(uBloom, vUv, 4.0).r * 0.15;
  }

  vec3 result;
  if (uLightMode > 0.5) {
    float fold = smoothstep(0.28, 0.9, pattern);
    float specular = smoothstep(0.72, 0.98, pattern);
    vec3 shadowColor = uColor * (0.72 - 0.12 * uDepth);
    vec3 bodyColor = min(uColor * 1.18, vec3(1.0));
    vec3 lightBase = mix(shadowColor, bodyColor, fold) * mix(1.0, relief, 0.6);
    lightBase = mix(lightBase, vec3(1.0), clamp(specular * 0.92 + shine * 0.22 + bloom * uGlow * 0.2, 0.0, 1.0));
    float fineNoise = noise(gl_FragCoord.xy * 0.63 + vec2(17.0, 41.0));
    float grainSignal = (rnd + fineNoise - 1.0);
    float grainStrength = clamp(uNoiseIntensity * 0.038, 0.0, 0.16);
    result = clamp(lightBase + grainSignal * grainStrength, 0.0, 1.0);
  } else {
    float grain = rnd / 15.0 * uNoiseIntensity;
    float floorValue = mix(0.2, 0.03, uDepth);
    float curve = uDepth > 0.0 ? pow(n, 1.0 + 1.4 * uDepth) : n;
    float shade = uDepth > 0.0 ? floorValue + (1.0 - floorValue) * curve : pattern;
    vec3 tone = mix(uColor, pow(uColor, vec3(1.45)), (1.0 - n) * uDepth);
    vec3 lit = tone * shade * relief - vec3(grain);
    vec3 tint = mix(uColor, uSheenColor, 0.8);
    vec3 extra = tint * (shine + bloom * uGlow * 0.55);
    float blend = clamp((uSheen + uGlow) * 4.0, 0.0, 1.0);
    result = mix(clamp(lit, 0.0, 1.0), clamp(softClip(lit + extra), 0.0, 1.0), blend);
  }

  float edge = uFade * 0.5;
  float mask = 1.0;
  if (edge > 0.0) {
    mask = smootherstep01(vUv.x / edge) * smootherstep01((1.0 - vUv.x) / edge);
    mask *= smootherstep01(vUv.y / edge) * smootherstep01((1.0 - vUv.y) / edge);
  }
  float alpha = uPresence * mask;
  outColor = vec4(result * alpha, alpha);
}`,Ne=2.2,Ye=1.6,de=1.6,S=[-.55,.7],ve=Math.hypot(S[0],S[1]),G=(r,d,m)=>Math.min(m,Math.max(d,r)),Oe=r=>r*r*r*(r*(r*6-15)+10),Ve=r=>{const d=Number(r)||0;if(!d)return[0,0];const m=u=>{const s=Math.sin(d*12.9898+u*78.233)*43758.5453;return s-Math.floor(s)-.5};return[m(1)*6,m(2)*6]},ge=(r,d,m)=>{const u=r.createShader(d);return u?(r.shaderSource(u,m),r.compileShader(u),r.getShaderParameter(u,r.COMPILE_STATUS)?u:(r.deleteShader(u),null)):null},pe=(r,d)=>{const m=ge(r,r.VERTEX_SHADER,Xe),u=ge(r,r.FRAGMENT_SHADER,d),s=r.createProgram();if(!m||!u||!s)return null;if(r.attachShader(s,m),r.attachShader(s,u),r.bindAttribLocation(s,0,"aPosition"),r.linkProgram(s),r.deleteShader(m),r.deleteShader(u),!r.getProgramParameter(s,r.LINK_STATUS))return r.deleteProgram(s),null;const U={},N=r.getProgramParameter(s,r.ACTIVE_UNIFORMS);for(let A=0;A<N;A++){const L=r.getActiveUniform(s,A);L&&(U[L.name.replace(/\[0\]$/,"")]=r.getUniformLocation(s,L.name))}return{program:s,uniforms:U}},We=({speed:r=5,scale:d=1,color:m="#7B7481",sheenColor:u="#ffffff",noiseIntensity:s=1.5,rotation:U=0,sheen:N=.5,depth:A=.5,glow:L=.3,ripple:we=1,wave:Ee=1,variation:Re=0,mouseInteraction:Te=!0,interactionStrength:ye=1,clickRipple:Me=!0,intro:be=!0,fade:Se=0,lightMode:Ae=!1,paused:Le=!1,dpr:Fe,className:$="",style:_e})=>{const j=b.useRef(null),K=b.useRef(null),F=b.useRef(null),p=b.useRef(null);return p.current={speed:r,scale:d,color:String(m),sheenColor:String(u),noiseIntensity:Math.max(0,s),rotation:U,sheen:Math.max(0,N),depth:G(A,0,1),glow:Math.max(0,L),ripple:Math.max(0,we),wave:Math.max(0,Ee),variation:Re,mouseInteraction:Te,interactionStrength:Math.max(0,ye),clickRipple:Me,intro:be,fade:G(Se,0,1),lightMode:Ae,paused:Le,dpr:Fe},b.useEffect(()=>{var ce;const v=j.current,f=K.current,e=f==null?void 0:f.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:"high-performance"});if(!v||!f||!e)return;const C=pe(e,Be),D=pe(e,Ge);if(!C||!D)return;const J=e.createBuffer(),Y=e.createVertexArray();e.bindVertexArray(Y),e.bindBuffer(e.ARRAY_BUFFER,J),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0);const _=e.createTexture(),O=e.createFramebuffer(),x={width:0,height:0},Pe=(t,n)=>{x.width===t&&x.height===n||(x.width=t,x.height=n,e.bindTexture(e.TEXTURE_2D,_),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t,n,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.bindFramebuffer(e.FRAMEBUFFER,O),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,_,0))},T=document.createElement("canvas").getContext("2d",{willReadFrequently:!0}),V=new Map,Q=t=>{if(V.has(t))return V.get(t);let n=[1,1,1];if(T){T.clearRect(0,0,1,1),T.fillStyle="#ffffff",T.fillStyle=t,T.fillRect(0,0,1,1);const[a,i,c]=T.getImageData(0,0,1,1).data;n=[a/255,i/255,c/255]}return V.set(t,n),n},P=((ce=window.matchMedia)==null?void 0:ce.call(window,"(prefers-reduced-motion: reduce)").matches)??!1,l={width:1,height:1,ratio:1},h={x:0,y:0,inside:!1},g=[],k=new Float32Array(16),o={flow:0,intro:p.current.intro&&!P?0:1,touch:0,x:0,y:0,dragX:0,dragY:0,lightX:S[0],lightY:S[1]};let E=0,y=0,I=!0;const Z=(t,n,a,i,c)=>{const[M,H]=Ve(i.variation);e.uniform2f(t.uView,n,a),e.uniform1f(t.uScale,i.scale),e.uniform1f(t.uRotation,i.rotation),e.uniform1f(t.uTime,o.flow-Ye*(1-c)),e.uniform1f(t.uWave,i.wave),e.uniform1f(t.uRipple,i.ripple),e.uniform1f(t.uFold,.25+.75*c),e.uniform2f(t.uShift,M,H),e.uniform4f(t.uPointer,o.x/l.width,1-o.y/l.height,o.touch*i.interactionStrength,.32),e.uniform2f(t.uDrag,o.dragX,o.dragY),e.uniform4fv(t.uWaves,k)},W=()=>{const t=p.current,n=Oe(o.intro),a=1-Math.pow(1-o.intro,3);e.bindVertexArray(Y),k.fill(0),g.slice(-4).forEach((c,M)=>{k.set([c.x,c.y,c.age*.6,Math.exp(-c.age/(de*.45))],M*4)}),t.glow>0&&(Pe(Math.max(1,Math.round(f.width/4)),Math.max(1,Math.round(f.height/4))),e.bindFramebuffer(e.FRAMEBUFFER,O),e.viewport(0,0,x.width,x.height),e.useProgram(C.program),Z(C.uniforms,x.width,x.height,t,n),e.drawArrays(e.TRIANGLES,0,3),e.bindTexture(e.TEXTURE_2D,_),e.generateMipmap(e.TEXTURE_2D));const i=D.uniforms;e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,f.width,f.height),e.useProgram(D.program),Z(i,f.width,f.height,t,n),e.uniform3fv(i.uColor,Q(t.color)),e.uniform3fv(i.uSheenColor,Q(t.sheenColor)),e.uniform1f(i.uNoiseIntensity,t.noiseIntensity),e.uniform1f(i.uDepth,t.depth),e.uniform1f(i.uSheen,t.sheen),e.uniform1f(i.uGlow,t.glow),e.uniform1f(i.uLightMode,t.lightMode?1:0),e.uniform3f(i.uLight,o.lightX,o.lightY,o.touch*t.interactionStrength),e.uniform2f(i.uStep,l.ratio/f.width,l.ratio/f.height),e.uniform1f(i.uPresence,a),e.uniform1f(i.uFade,t.fade),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,_),e.uniform1i(i.uBloom,0),e.drawArrays(e.TRIANGLES,0,3)},ee=t=>{if(E=0,!I||document.hidden)return;const n=p.current,a=y?Math.min(.05,(t-y)/1e3):1/60;y=t;const i=!n.paused&&!P&&n.speed!==0;i&&(o.flow+=a*.1*n.speed),!n.intro||P?o.intro=1:o.intro<1&&(o.intro=Math.min(1,o.intro+a/Ne));const c=n.mouseInteraction&&h.inside&&!P;c&&o.touch<.01&&(o.x=h.x,o.y=h.y);const M=1-Math.exp(-a*10),H=o.x,Ue=o.y;o.x+=(h.x-o.x)*M,o.y+=(h.y-o.y)*M;const Ce=(o.x-H)/Math.max(a,.001)/l.height,De=(o.y-Ue)/Math.max(a,.001)/l.height,ue=1-Math.exp(-a*4);o.dragX+=(G(Ce*.03,-.06,.06)-o.dragX)*ue,o.dragY+=(G(-De*.03,-.06,.06)-o.dragY)*ue,o.touch+=((c?1:0)-o.touch)*(1-Math.exp(-a*(c?3.5:1.4)));let X=S[0],B=S[1];if(c){const w=(h.x/l.width-.5)*(l.width/l.height),he=.5-h.y/l.height,q=Math.hypot(w,he);q>.04?(X=w/q*ve,B=he/q*ve):(X=o.lightX,B=o.lightY)}const fe=1-Math.exp(-a*3);o.lightX+=(X-o.lightX)*fe,o.lightY+=(B-o.lightY)*fe;for(let w=g.length-1;w>=0;w--)g[w].age+=a,g[w].age>de*2.5&&g.splice(w,1);W();const Ie=o.intro<1||g.length>0||Math.abs((c?1:0)-o.touch)>.002||Math.abs(o.dragX)+Math.abs(o.dragY)>2e-4||Math.abs(h.x-o.x)+Math.abs(h.y-o.y)>.3||Math.abs(X-o.lightX)+Math.abs(B-o.lightY)>.001;i||Ie?E=requestAnimationFrame(ee):y=0},R=()=>{!E&&I&&!document.hidden&&(E=requestAnimationFrame(ee))},z=()=>{const t=p.current,n=Math.max(1,v.clientWidth),a=Math.max(1,v.clientHeight),i=Math.min(t.dpr||window.devicePixelRatio||1,2);l.width=n,l.height=a,l.ratio=i,f.width=Math.max(1,Math.round(n*i)),f.height=Math.max(1,Math.round(a*i)),E||W(),R()},te=t=>{const n=v.getBoundingClientRect(),a=t.clientX-n.left,i=t.clientY-n.top;return{x:a,y:i,inside:a>=0&&i>=0&&a<=n.width&&i<=n.height}},oe=t=>{const n=te(t);h.x=n.x,h.y=n.y,h.inside=n.inside,R()},re=t=>{if(!p.current.clickRipple||P)return;const a=te(t);a.inside&&(g.push({x:a.x/l.width,y:1-a.y/l.height,age:0}),g.length>4&&g.shift(),R())},ne=()=>{h.inside=!1,R()},ie=()=>{y=0,R()},ae=new ResizeObserver(z);ae.observe(v);const se=new IntersectionObserver(t=>{I=t.some(n=>n.isIntersecting),I&&(y=0,R())});se.observe(v),window.addEventListener("pointermove",oe,{passive:!0}),window.addEventListener("pointerdown",re,{passive:!0}),document.documentElement.addEventListener("pointerleave",ne),document.addEventListener("visibilitychange",ie),z();let le=p.current.dpr;return F.current=()=>{const t=p.current;if(t.dpr!==le){le=t.dpr,z();return}E||W(),R()},()=>{var t;cancelAnimationFrame(E),F.current=null,ae.disconnect(),se.disconnect(),window.removeEventListener("pointermove",oe),window.removeEventListener("pointerdown",re),document.documentElement.removeEventListener("pointerleave",ne),document.removeEventListener("visibilitychange",ie),e.deleteTexture(_),e.deleteFramebuffer(O),e.deleteProgram(C.program),e.deleteProgram(D.program),e.deleteBuffer(J),e.deleteVertexArray(Y),(t=e.getExtension("WEBGL_lose_context"))==null||t.loseContext()}},[]),b.useEffect(()=>{var v;(v=F.current)==null||v.call(F)}),me.jsx("div",{ref:j,className:`silk-container${$?` ${$}`:""}`,style:_e,children:me.jsx("canvas",{ref:K,className:"silk-canvas","aria-hidden":"true"})})};export{We as default};
