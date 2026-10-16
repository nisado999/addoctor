import{r as D,j as De}from"./vendor-DXcH-vAE.js";const R=24,rt=8,X=3,st=1.8,U=["top","middle","bottom"],lt={top:{x:10,y:.5,rotate:-.4},middle:{x:5,y:0,rotate:.2},bottom:{x:2,y:-.7,rotate:-1}},ct={top:{offset:1,step:.2,light:.2,flip:1,depth:1,drift:.6},middle:{offset:2,step:.15,light:1,flip:0,depth:0,drift:1},bottom:{offset:1.5,step:.2,light:.32,flip:0,depth:.6,drift:1.4}},ut=`#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`,ft=`#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uRatio;
uniform vec4 uWave[3];
uniform vec4 uShape[3];
uniform vec4 uParallax[3];
uniform int uCount[3];
uniform vec4 uLine[${R*3}];
uniform vec3 uLineColor[${R*3}];
uniform vec2 uMouseWarp[3];
uniform float uHaloReach;
uniform float uWidth;
uniform float uGlow;
uniform float uBrightness;
uniform float uFocus;
uniform float uEdgeFade;
uniform vec4 uMouse;
uniform float uBendRadius;
uniform float uBendStrength;
uniform vec4 uClicks[${X}];
uniform float uLight;
uniform float uOpaque;
uniform vec3 uBackground;
uniform float uOpacity;
uniform float uStyle;
uniform float uSpacing;
out vec4 outColor;

vec3 toSrgb(vec3 c) {
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}

vec3 inkOf(vec3 color) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return color * min(1.0, 0.16 / max(luma, 0.001));
}

vec2 warp(vec2 p, float rotate, float flip) {
  float angle = rotate * log(length(p) + 1.0);
  vec2 r = p * mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  if (flip > 0.5) r.x = -r.x;
  return r;
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
  screen.y = -screen.y;
  for (int k = 0; k < ${X}; k++) {
    vec4 click = uClicks[k];
    if (click.w == 0.0) continue;
    float age = click.z;
    float turn = 1.9 * smoothstep(0.0, 0.23, age) * exp(-max(age - 0.23, 0.0) * 1.1) * click.w;
    float spread = 0.3 * (1.0 + age * 0.55);
    vec2 offset = screen - click.xy;
    float angle = turn * exp(-dot(offset, offset) / (spread * spread));
    screen = click.xy + mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * offset;
  }
  vec3 light = vec3(0.0);
  vec3 bloom = vec3(0.0);
  vec3 inkColor = vec3(0.0);
  float inkAlpha = 0.0;
  float aa = 0.75 * uRatio;
  float invSigma = 1.0 / max(uBendRadius * uBendRadius, 1e-4);
  float tight = 1.0 / (2.6 * uRatio);
  float wide = 1.0 / (11.0 * uRatio);

  for (int w = 0; w < 3; w++) {
    int count = uCount[w];
    if (count <= 0) continue;
    vec4 wave = uWave[w];
    vec4 shape = uShape[w];
    vec2 r = warp(screen + uParallax[w].xy, wave.z, shape.w);
    vec2 rm = uMouseWarp[w];
    float blur = uFocus * uParallax[w].z;
    float width = uWidth * (1.0 + blur * 2.5);
    float soft = aa * (1.0 + blur * 7.0);
    float energy = (uWidth + aa) / (width + soft) * shape.z;
    float cut = uHaloReach + width * 2.0 + soft;
    float sx = sin(r.x);
    float cx = cos(r.x);
    float along = r.x - rm.x;
    float pull = uMouse.z * exp(-along * along * invSigma);
    float level = r.y + wave.y;
    int first = w * ${R};

    for (int i = 0; i < ${R}; i++) {
      if (i >= count) break;
      vec4 line = uLine[first + i];
      float y = (sx * line.x + cx * line.y) * line.z;
      float near = 0.0;
      if (pull > 0.002) {
        float across = (y - wave.y) - rm.y;
        near = exp(-across * across * invSigma) * pull;
        float push = uBendStrength * near;
        y += across * (uBendStrength < 0.0 ? min(-push, 2.5) : -min(push, 0.9));
      }
      float m = level - y;
      float slope = length(vec2(dFdx(m), dFdy(m)));
      float d = abs(m) / max(slope, 1e-5);
      if (d < cut) {
        float gap = d;
        float size = width;
        if (uStyle > 0.5) {
          float period = uSpacing / (uResolution.y * 0.5);
          float cell = (fract((r.x + line.w) / period + float(i) * 0.37) - 0.5) * uSpacing;
          float span = uStyle > 1.5 ? max(uSpacing * 0.32 - width, 0.0) : 0.0;
          gap = length(vec2(max(abs(cell) - span, 0.0), d));
          size = uStyle > 1.5 ? width : width * 1.6;
        }
        float core = smoothstep(size + soft, size - soft, gap);
        float fall = 1.0 - d / cut;
        float halo = (exp(-gap * tight) * 0.3 + exp(-d * wide) * 0.02 * fall * fall) * uGlow;
        vec3 color = uLineColor[first + i];
        float lift = 1.0 + near * 0.8;
        light += color * core * energy * lift;
        bloom += color * halo * shape.z * lift;
        float a = clamp(clamp(core * energy * 1.15 + halo * shape.z * 0.12, 0.0, 1.0) * lift, 0.0, 1.0);
        inkColor = inkOf(color) * a + inkColor * (1.0 - a);
        inkAlpha = a + inkAlpha * (1.0 - a);
      }
    }
  }

  float edge = 1.0;
  if (uEdgeFade > 0.0) {
    float u = gl_FragCoord.x / uResolution.x;
    float fade = uEdgeFade * 0.45;
    float left = smoothstep(0.0, fade, u);
    float right = smoothstep(0.0, fade, 1.0 - u);
    edge = left * left * (3.0 - 2.0 * left) * right * right * (3.0 - 2.0 * right);
  }

  if (uLight > 0.5) {
    float alpha = inkAlpha * edge * uOpacity;
    vec3 ink = toSrgb(inkColor / max(inkAlpha, 1e-4));
    if (uOpaque > 0.5) {
      outColor = vec4(mix(uBackground, ink, alpha), 1.0);
    } else {
      outColor = vec4(ink * alpha, alpha);
    }
    return;
  }

  vec3 capped = 0.28 * (1.0 - exp(-bloom / 0.28));
  vec3 glow = toSrgb(1.0 - exp(-(light + capped) * uBrightness * 1.2)) * edge * uOpacity;
  if (uOpaque > 0.5) {
    outColor = vec4(uBackground + glow * (1.0 - uBackground), 1.0);
  } else {
    outColor = vec4(glow, max(glow.r, max(glow.g, glow.b)));
  }
}`,b=(t,m,g)=>Math.min(g,Math.max(m,t)),dt=(t,m,g,a)=>{const y=g*Math.log(Math.hypot(t,m)+1),F=Math.cos(y),w=Math.sin(y),S=t*F+m*w;return[a>.5?-S:S,m*F-t*w]},We=(t,m,g)=>{const a=t.createShader(m);return a?(t.shaderSource(a,g),t.compileShader(a),t.getShaderParameter(a,t.COMPILE_STATUS)?a:(t.deleteShader(a),null)):null},mt=t=>{const m=We(t,t.VERTEX_SHADER,ut),g=We(t,t.FRAGMENT_SHADER,ft),a=t.createProgram();if(!m||!g||!a)return null;if(t.attachShader(a,m),t.attachShader(a,g),t.bindAttribLocation(a,0,"aPosition"),t.linkProgram(a),t.deleteShader(m),t.deleteShader(g),!t.getProgramParameter(a,t.LINK_STATUS))return t.deleteProgram(a),null;const y={},F=t.getProgramParameter(a,t.ACTIVE_UNIFORMS);for(let w=0;w<F;w++){const S=t.getActiveUniform(a,w);S&&(y[S.name.replace("[0]","")]=t.getUniformLocation(a,S.name))}return{program:a,uniforms:y}},_e=(t,m,g,a)=>{if(typeof t=="number")return t;if(!Array.isArray(t)||t.length===0)return a;const y=m.indexOf(g);return t[y]??t[t.length-1]??a},gt=({linesGradient:t=["#e945f5","#ffffff"],enabledWaves:m=["top","middle","bottom"],lineCount:g=10,lineDistance:a=6,topWavePosition:y,middleWavePosition:F,bottomWavePosition:w,animationSpeed:S=1,amplitude:Te=1,lineWidth:ze=1,lineStyle:Z="solid",glow:Ie=1,brightness:Ve=1,depthOfField:Ne=.5,edgeFade:Ue=0,interactive:Xe=!0,bendRadius:$e=5,bendStrength:qe=-.5,mouseDamping:He=.05,parallax:Ge=!0,parallaxStrength:je=.2,clickSwirl:Ye=!0,intro:Ke=!0,mixBlendMode:Je="screen",backgroundColor:ee,lightMode:te=!1,opacity:Qe=1,dpr:Ze,className:oe="",style:et,...tt})=>{const ne=D.useRef(null),ae=D.useRef(null),W=D.useRef(null),$=Array.isArray(m)?m.filter(c=>U.includes(c)):U,ie={stops:Array.isArray(t)&&t.length?t.slice(0,rt):["#ffffff"],waves:U.map(c=>{const h=$.includes(c),e={...lt[c],...c==="top"?y:c==="middle"?F:w};return{count:h?b(Math.round(_e(g,$,c,10)),0,R):0,distance:_e(a,$,c,6)*.01,position:e}}),animationSpeed:Math.max(0,S),amplitude:Math.max(0,Te),lineWidth:Math.max(.1,ze),style:Z==="dashed"?2:Z==="dotted"?1:0,glow:Math.max(0,Ie),brightness:Math.max(0,Ve),depthOfField:b(Ne,0,1),edgeFade:b(Ue,0,1),interactive:Xe,bendRadius:Math.max(.1,$e),bendStrength:qe,mouseDamping:b(He,0,1),parallax:Ge,parallaxStrength:Math.max(0,je),clickSwirl:Ye,intro:Ke,backgroundColor:ee,lightMode:te,opacity:b(Qe,0,1),dpr:Ze},A=D.useRef(ie);return A.current=ie,D.useEffect(()=>{var Re;const c=ne.current,h=ae.current,e=h==null?void 0:h.getContext("webgl2",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1});if(!c||!h||!e)return;const z=mt(e);if(!z)return;const i=z.uniforms,re=e.createBuffer(),q=e.createVertexArray();e.bindVertexArray(q),e.bindBuffer(e.ARRAY_BUFFER,re),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0);const k=document.createElement("canvas").getContext("2d",{willReadFrequently:!0}),H=new Map,se=(o,n)=>{if(!o)return n;const r=String(o);if(H.has(r))return H.get(r);let f=n;if(k){k.clearRect(0,0,1,1),k.fillStyle="#000000",k.fillStyle=r,k.fillRect(0,0,1,1);const[p,d,T]=k.getImageData(0,0,1,1).data;f=[p/255,d/255,T/255]}return H.set(r,f),f},L=((Re=window.matchMedia)==null?void 0:Re.call(window,"(prefers-reduced-motion: reduce)").matches)??!1,s={x:0,y:0,nx:0,ny:0,vx:0,inside:!1},l={x:0,y:0,influence:0,px:0,py:0},M=[],le=new Float32Array(12),ce=new Float32Array(12),ue=new Float32Array(12),fe=new Int32Array(3),de=new Float32Array(R*3*4),me=new Float32Array(R*3*3),he=new Float32Array(6),G=new Float32Array(X*4);let j=0,E=A.current.intro&&!L?0:1,C=0,_=0,I=!0;const Y=()=>{const o=A.current,n=h.width,r=h.height,f=E*E*(3-2*E),p=n/Math.max(1,c.clientWidth),d=o.stops.map(u=>se(u,[1,1,1]).map(x=>Math.pow(x,2.2))),T=(2*l.x-n)/r,J=-(2*l.y-r)/r;o.waves.forEach((u,x)=>{const v=ct[U[x]],{x:Ee,y:ot,rotate:be}=u.position,Fe=l.px*v.drift,ke=-l.py*v.drift;le.set([Ee,ot,be,0],x*4),ce.set([v.offset,v.step,v.light,v.flip],x*4),ue.set([Fe,ke,v.depth,0],x*4),he.set(dt(T+Fe,J+ke,be,v.flip),x*2),fe[x]=u.count;for(let B=0;B<u.count;B++){const Le=v.offset+v.step*B,Ce=u.distance*B+Ee,Pe=Ce+Le+j*.1,nt=Math.sin(Le+j*.2)*.3*o.amplitude*f,Be=x*R+B;de.set([Math.cos(Pe),Math.sin(Pe),nt,Ce],Be*4);const Oe=(u.count>1?B/(u.count-1):0)*Math.max(d.length-1,0),N=Math.min(Math.floor(Oe),Math.max(d.length-2,0)),at=Math.min(N+1,d.length-1),Q=b(Oe-N,0,1),it=Q*Q*(3-2*Q);for(let O=0;O<3;O++)me[Be*3+O]=d[N][O]+(d[at][O]-d[N][O])*it}}),G.fill(0),M.forEach((u,x)=>G.set([u.x,u.y,u.age,u.spin],x*4)),e.viewport(0,0,n,r),e.useProgram(z.program),e.bindVertexArray(q),e.uniform2f(i.uResolution,n,r),e.uniform1f(i.uRatio,p),e.uniform4fv(i.uWave,le),e.uniform4fv(i.uShape,ce),e.uniform4fv(i.uParallax,ue),e.uniform1iv(i.uCount,fe),e.uniform4fv(i.uLine,de),e.uniform3fv(i.uLineColor,me),e.uniform2fv(i.uMouseWarp,he),e.uniform1f(i.uHaloReach,11*p*Math.log(160*o.glow+1)),e.uniform1f(i.uWidth,o.lineWidth*.5*p),e.uniform1f(i.uGlow,o.glow),e.uniform1f(i.uBrightness,o.brightness*f),e.uniform1f(i.uFocus,o.depthOfField),e.uniform1f(i.uEdgeFade,o.edgeFade),e.uniform4f(i.uMouse,l.x,l.y,l.influence,0),e.uniform1f(i.uBendRadius,o.bendRadius*.09),e.uniform1f(i.uBendStrength,o.bendStrength*2.5),e.uniform4fv(i.uClicks,G),e.uniform1f(i.uLight,o.lightMode?1:0),e.uniform1f(i.uOpaque,o.backgroundColor?1:0),e.uniform3fv(i.uBackground,se(o.backgroundColor,o.lightMode?[1,1,1]:[0,0,0])),e.uniform1f(i.uOpacity,o.opacity*f),e.uniform1f(i.uStyle,o.style),e.uniform1f(i.uSpacing,(o.style===2?22:9)*p),e.drawArrays(e.TRIANGLES,0,3)},pe=o=>{if(C=0,!I||document.hidden)return;const n=A.current,r=_?b((o-_)/1e3,5e-4,.05):1/60;_=o;const f=L?0:1;j+=r*n.animationSpeed*f,n.intro&&!L&&E<1?E=Math.min(1,E+r/st):(!n.intro||L)&&(E=1);const p=1-Math.pow(1-n.mouseDamping,r*60),d=n.interactive&&s.inside&&!L;d&&(l.x+=(s.x-l.x)*p,l.y+=(s.y-l.y)*p),l.influence+=((d?1:0)-l.influence)*p;const T=n.parallax&&d?s.nx*n.parallaxStrength:0,J=n.parallax&&d?s.ny*n.parallaxStrength:0;l.px+=(T-l.px)*p,l.py+=(J-l.py)*p;for(let u=M.length-1;u>=0;u--)M[u].age+=r,M[u].age>4&&M.splice(u,1);Y(),C=requestAnimationFrame(pe)},P=()=>{!C&&I&&!document.hidden&&(C=requestAnimationFrame(pe))},K=()=>{const o=A.current,n=Math.max(1,c.clientWidth),r=Math.max(1,c.clientHeight),f=Math.min(o.dpr||window.devicePixelRatio||1,2);h.width=Math.max(1,Math.round(n*f)),h.height=Math.max(1,Math.round(r*f)),Y(),P()},ge=o=>{const n=c.getBoundingClientRect(),r=o.clientX-n.left,f=o.clientY-n.top,p=h.width/Math.max(1,n.width);s.inside=r>=0&&f>=0&&r<=n.width&&f<=n.height;const d=r*p;Math.abs(d-s.x)>.5&&(s.vx=d-s.x),s.x=d,s.y=(n.height-f)*p,s.nx=r/Math.max(1,n.width)-.5,s.ny=.5-f/Math.max(1,n.height)},xe=o=>{const n=s.inside;ge(o),s.inside&&!n&&l.influence<.05&&(l.x=s.x,l.y=s.y),P()},ve=o=>{if(ge(o),!s.inside||!A.current.clickSwirl||L)return;const n=(2*s.x-h.width)/h.height,r=-(2*s.y-h.height)/h.height;M.unshift({x:n,y:r,age:0,spin:s.vx<0?-1:1}),M.length>X&&M.pop(),P()},V=o=>{o.pointerType!=="mouse"&&(s.inside=!1)},ye=()=>{s.inside=!1},we=()=>{_=0,P()},Se=new ResizeObserver(K);Se.observe(c);const Ae=new IntersectionObserver(o=>{I=o.some(n=>n.isIntersecting),I&&(_=0,P())});Ae.observe(c),window.addEventListener("pointermove",xe,{passive:!0}),window.addEventListener("pointerdown",ve,{passive:!0}),window.addEventListener("pointerup",V,{passive:!0}),window.addEventListener("pointercancel",V,{passive:!0}),document.documentElement.addEventListener("pointerleave",ye),document.addEventListener("visibilitychange",we),K();let Me=A.current.dpr;return W.current=()=>{const o=A.current;if(o.dpr!==Me){Me=o.dpr,K();return}C||Y(),P()},()=>{var o;cancelAnimationFrame(C),W.current=null,Se.disconnect(),Ae.disconnect(),window.removeEventListener("pointermove",xe),window.removeEventListener("pointerdown",ve),window.removeEventListener("pointerup",V),window.removeEventListener("pointercancel",V),document.documentElement.removeEventListener("pointerleave",ye),document.removeEventListener("visibilitychange",we),e.deleteProgram(z.program),e.deleteBuffer(re),e.deleteVertexArray(q),(o=e.getExtension("WEBGL_lose_context"))==null||o.loseContext()}},[]),D.useEffect(()=>{var c;(c=W.current)==null||c.call(W)}),De.jsx("div",{ref:ne,className:`floating-lines-container${oe?` ${oe}`:""}`,style:{...et,mixBlendMode:te||ee?"normal":Je},...tt,children:De.jsx("canvas",{ref:ae,className:"floating-lines-canvas","aria-hidden":"true"})})};export{gt as default};
