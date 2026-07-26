/* BADASS APOCALYPSE - GLSL (WebGL2 / GLSL ES 3.00) */
(function () {
  'use strict';

  const COMMON = `
const vec3 SUN_DIR = normalize(vec3(0.45, 0.72, 0.32));
const vec3 SUN_COL = vec3(1.42, 1.16, 0.80);
const vec3 SKY_COL = vec3(0.30, 0.34, 0.52);
const vec3 BOUNCE  = vec3(0.42, 0.20, 0.13);

float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float noise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x),
             mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*noise2(p); p *= 2.03; a *= 0.5; }
  return v;
}
`;

  /* ---------------------------------------------------------------- scene */
  const SCENE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aM0;
layout(location=3) in vec4 aM1;
layout(location=4) in vec4 aM2;
layout(location=5) in vec4 aM3;
layout(location=6) in vec4 aCol;   // rgb = albedo, a = emissive amount
uniform mat4 uViewProj;
out vec3 vNrm; out vec3 vWorld; out vec4 vCol;
void main(){
  mat4 m = mat4(aM0,aM1,aM2,aM3);
  vec4 wp = m * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(m) * aNrm);
  vCol = aCol;
  gl_Position = uViewProj * wp;
}`;

  const SCENE_FS = `#version 300 es
precision highp float;
in vec3 vNrm; in vec3 vWorld; in vec4 vCol;
uniform vec3 uCam;
uniform vec3 uFog;
uniform float uFogDensity;
layout(location=0) out vec4 oCol;
layout(location=1) out vec4 oBright;
${COMMON}
void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCam - vWorld);
  float ndl = dot(N, SUN_DIR);
  // three cartoon bands, softened so it still reads at speed
  float band = smoothstep(-0.12, 0.06, ndl)*0.42 + smoothstep(0.24, 0.46, ndl)*0.38 + smoothstep(0.72,0.92,ndl)*0.20;
  vec3 base = vCol.rgb;
  vec3 amb = mix(BOUNCE, SKY_COL, N.y*0.5+0.5);
  vec3 lit = base * (amb*0.82 + SUN_COL*band);
  // rim light: subtle, and only where the surface faces up-ish, so it reads as
  // sky bounce instead of turning every silhouette into a white blob
  float fres = pow(1.0 - clamp(dot(N,V),0.0,1.0), 4.0);
  lit += fres * mix(vec3(0.30,0.48,0.90), base, 0.5) * 0.16 * (0.35 + 0.65*smoothstep(-0.3,0.7,N.y));
  // fake specular pop so metal reads shiny
  float spec = pow(max(dot(reflect(-SUN_DIR,N), V),0.0), 40.0);
  lit += spec * SUN_COL * 0.30;

  float e = vCol.a;
  // keep emissive colour saturated - adding a white floor here turns every
  // glowing particle into a white blob once bloom hits it
  vec3 col = mix(lit, base * 1.15, e);

  float d = length(vWorld - uCam);
  float fg = 1.0 - exp(-pow(d*uFogDensity, 2.0));
  vec3 fogged = mix(col, uFog, fg*0.92);
  oCol = vec4(fogged, 1.0);

  float lum = dot(col, vec3(0.299,0.587,0.114));
  vec3 bright = col * e * 1.45 + col * smoothstep(0.85, 1.5, lum) * 0.8;
  oBright = vec4(bright * (1.0-fg), 1.0);
}`;

  /* --------------------------------------------------------------- ground */
  const GROUND_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform float uSize;
out vec3 vWorld;
void main(){
  vec3 p = vec3(aPos.x*uSize + uCenter.x, 0.0, aPos.z*uSize + uCenter.z);
  vWorld = p;
  gl_Position = uViewProj * vec4(p,1.0);
}`;

  const GROUND_FS = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 uCam;
uniform vec3 uFog;
uniform float uFogDensity;
uniform float uTime;
uniform int uMode;        // 0 suburb, 1 mall, 2 forest, 3 waste
layout(location=0) out vec4 oCol;
layout(location=1) out vec4 oBright;
${COMMON}

const float BLOCK = 62.0;
const float ROADW = 13.0;

float gridLines(vec2 p, float cell, float w){
  vec2 g = abs(fract(p/cell + 0.5) - 0.5) * cell;
  return 1.0 - smoothstep(0.0, w, min(g.x, g.y));
}

void main(){
  vec2 p = vWorld.xz;
  float grit = fbm(p*0.9)*0.5 + fbm(p*7.0)*0.12;
  vec3 col;

  // distance to the nearest carriageway centreline
  vec2 m = abs(mod(p, BLOCK) - BLOCK*0.5);
  float road = min(m.x, m.y);

  if(uMode == 0){                       // ------------- suburban streets
    vec3 tarmac = mix(vec3(0.085,0.084,0.095), vec3(0.155,0.150,0.160), grit);
    tarmac = mix(tarmac, vec3(0.05,0.05,0.055), gridLines(p, 6.0, 0.13)*0.5);

    vec3 kerb = mix(vec3(0.40,0.39,0.38), vec3(0.52,0.51,0.49), grit);
    kerb = mix(kerb, vec3(0.26,0.25,0.24), gridLines(p, 2.4, 0.10)*0.6);

    float lawnN = fbm(p*0.35);
    vec3 lawn = mix(vec3(0.09,0.16,0.07), vec3(0.16,0.25,0.10), lawnN);
    lawn = mix(lawn, vec3(0.22,0.21,0.11), smoothstep(0.55,0.85,fbm(p*0.09)));
    lawn += vec3(0.012,0.03,0.0) * noise2(p*3.2);

    // driveways reaching from the kerb to each plot
    vec2 q = mod(p, BLOCK) - BLOCK*0.5;
    float drive = 0.0;
    if(abs(abs(q.y) - 20.0) < 2.2 && abs(q.x) < ROADW + 9.0) drive = 1.0;
    if(abs(abs(q.x) - 20.0) < 2.2 && abs(q.y) < ROADW + 9.0) drive = max(drive, 1.0);

    col = lawn;
    col = mix(col, kerb, smoothstep(ROADW + 3.4, ROADW + 2.0, road));
    col = mix(col, tarmac, smoothstep(ROADW + 0.6, ROADW - 0.4, road));
    col = mix(col, kerb*0.9, drive * step(road, ROADW + 12.0) * (1.0 - step(road, ROADW)));

    // centre line dashes on each carriageway
    float dashX = step(0.55, fract(p.y/9.0)) * (1.0 - smoothstep(0.0,0.42,m.x));
    float dashZ = step(0.55, fract(p.x/9.0)) * (1.0 - smoothstep(0.0,0.42,m.y));
    col = mix(col, vec3(0.62,0.58,0.34), clamp(dashX+dashZ,0.0,1.0)*0.75);
    // kerbside gutter line
    float gut = (1.0 - smoothstep(0.0,0.30,abs(road - ROADW)));
    col = mix(col, vec3(0.30,0.29,0.28), gut*0.5);

  } else if(uMode == 1){                // ------------------ mall car park
    vec3 tarmac = mix(vec3(0.10,0.10,0.115), vec3(0.175,0.17,0.185), grit);
    tarmac = mix(tarmac, vec3(0.055,0.055,0.06), gridLines(p, 9.0, 0.16)*0.55);
    // parking bays: long stalls with a gap for the aisles
    float bay = (1.0 - smoothstep(0.0, 0.20, abs(fract(p.x/3.2)-0.5)*3.2));
    float band = step(0.30, fract(p.y/26.0)) * step(fract(p.y/26.0), 0.78);
    float stallEnd = 1.0 - smoothstep(0.0,0.24, abs(fract(p.y/26.0)-0.54)*26.0);
    col = mix(tarmac, vec3(0.66,0.64,0.58), clamp(bay*band + stallEnd*0.7, 0.0, 1.0) * 0.55);
    col = mix(col, vec3(0.72,0.62,0.16), (1.0 - smoothstep(0.0,0.5,m.x))*0.35);

  } else if(uMode == 2){                // -------------------- forest floor
    float n1 = fbm(p*0.28), n2 = fbm(p*1.6);
    vec3 loam = mix(vec3(0.07,0.09,0.05), vec3(0.15,0.17,0.08), n1);
    loam = mix(loam, vec3(0.20,0.14,0.07), smoothstep(0.5,0.9,n2));
    loam += vec3(0.03,0.05,0.01) * noise2(p*5.0);
    // a rutted dirt track running north
    float track = 1.0 - smoothstep(5.0, 11.0, abs(p.x + sin(p.y*0.012)*11.0));
    vec3 dirt = mix(vec3(0.24,0.18,0.10), vec3(0.32,0.25,0.14), grit);
    dirt = mix(dirt, vec3(0.16,0.12,0.07), gridLines(vec2(p.x,p.y*0.4), 3.0, 0.5)*0.4);
    col = mix(loam, dirt, track);

  } else {                              // ---------------------- wasteland
    vec3 asphalt = mix(vec3(0.085,0.082,0.10), vec3(0.16,0.15,0.17), grit);
    float blot = smoothstep(0.52, 0.78, fbm(p*0.055));
    asphalt = mix(asphalt, mix(vec3(0.22,0.15,0.09), vec3(0.30,0.22,0.11), grit), blot*0.85);
    asphalt = mix(asphalt, vec3(0.03,0.03,0.04), gridLines(p, 6.0, 0.16)*(0.55+noise2(p*0.55)*0.2));
    float lane = step(0.965, fract(p.x/24.0)) * step(0.5, fract(p.y/7.0));
    col = mix(asphalt, vec3(0.45,0.42,0.28), lane*0.5);
  }

  float band2 = smoothstep(-0.1,0.05,SUN_DIR.y)*0.45 + 0.4;
  col *= (mix(BOUNCE,SKY_COL,0.75)*0.8 + SUN_COL*band2*0.75);

  float d = length(vWorld - uCam);
  float fg = 1.0 - exp(-pow(d*uFogDensity, 2.0));
  oCol = vec4(mix(col, uFog, fg), 1.0);
  oBright = vec4(0.0,0.0,0.0,1.0);
}`;

  /* ------------------------------------------------------------------ sky */
  const SKY_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  vUv = p;
  gl_Position = vec4(p*2.0-1.0, 1.0, 1.0);
}`;

  const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uCam;
uniform vec3 uFog;
uniform float uTime;
layout(location=0) out vec4 oCol;
layout(location=1) out vec4 oBright;
${COMMON}
void main(){
  vec4 ndc = vec4(vUv*2.0-1.0, 1.0, 1.0);
  vec4 w = uInvViewProj * ndc;
  vec3 dir = normalize(w.xyz/w.w - uCam);
  float h = clamp(dir.y, -1.0, 1.0);

  vec3 low  = uFog;
  vec3 mid  = vec3(0.55, 0.26, 0.20);
  vec3 high = vec3(0.09, 0.10, 0.22);
  vec3 col = mix(low, mid, smoothstep(-0.02, 0.22, h));
  col = mix(col, high, smoothstep(0.16, 0.75, h));

  // sun bruise
  float sd = max(dot(dir, SUN_DIR), 0.0);
  col += vec3(1.0,0.55,0.22) * pow(sd, 26.0) * 1.4;
  col += vec3(0.9,0.42,0.18) * pow(sd, 4.0) * 0.28;

  // drifting ash clouds
  vec2 cp = dir.xz / max(abs(h)+0.16, 0.001);
  float cl = fbm(cp*0.6 + vec2(uTime*0.012, uTime*0.005));
  float cmask = smoothstep(0.48, 0.95, cl) * smoothstep(0.0, 0.28, h);
  col = mix(col, mix(vec3(0.22,0.17,0.20), vec3(0.62,0.44,0.40), cl), cmask*0.75);

  oCol = vec4(col, 1.0);
  oBright = vec4(vec3(1.0,0.55,0.22) * pow(sd, 26.0) * 0.9, 1.0);
}`;

  /* ---------------------------------------------------------- blob shadow */
  const SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 aM0;
layout(location=3) in vec4 aM1;
layout(location=4) in vec4 aM2;
layout(location=5) in vec4 aM3;
layout(location=6) in vec4 aCol;
uniform mat4 uViewProj;
out vec2 vLocal; out float vStr;
void main(){
  mat4 m = mat4(aM0,aM1,aM2,aM3);
  vLocal = aPos.xz * 2.0;
  vStr = aCol.a;
  gl_Position = uViewProj * (m * vec4(aPos,1.0));
}`;

  const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 vLocal; in float vStr;
layout(location=0) out vec4 oCol;
layout(location=1) out vec4 oBright;
void main(){
  float r = length(vLocal);
  float a = smoothstep(1.0, 0.15, r) * vStr;
  oCol = vec4(vec3(1.0 - a), 1.0);   // multiplicative darkening
  oBright = vec4(1.0);
}`;

  /* ---------------------------------------------------------------- decal */
  const DECAL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 aM0;
layout(location=3) in vec4 aM1;
layout(location=4) in vec4 aM2;
layout(location=5) in vec4 aM3;
layout(location=6) in vec4 aCol;
uniform mat4 uViewProj;
out vec2 vLocal; out vec4 vCol; out float vSeed; out vec3 vWorld;
void main(){
  mat4 m = mat4(aM0,aM1,aM2,aM3);
  vec4 wp = m * vec4(aPos,1.0);
  vLocal = aPos.xz * 2.0;
  vCol = aCol;
  vSeed = fract(aM3.x*0.137 + aM3.z*0.311)*20.0;
  vWorld = wp.xyz;
  gl_Position = uViewProj * wp;
}`;

  const DECAL_FS = `#version 300 es
precision highp float;
in vec2 vLocal; in vec4 vCol; in float vSeed; in vec3 vWorld;
uniform vec3 uCam;
uniform vec3 uFog;
uniform float uFogDensity;
layout(location=0) out vec4 oCol;
layout(location=1) out vec4 oBright;
${COMMON}
void main(){
  float r = length(vLocal);
  float ang = atan(vLocal.y, vLocal.x);
  float lobes = 0.62 + 0.30*sin(ang*3.0+vSeed) + 0.16*sin(ang*7.0-vSeed*2.0) + 0.10*noise2(vLocal*3.0+vSeed);
  float a = smoothstep(lobes, lobes-0.30, r) * vCol.a;
  if(a < 0.01) discard;
  float d = length(vWorld - uCam);
  float fg = 1.0 - exp(-pow(d*uFogDensity, 2.0));
  vec3 c = mix(vCol.rgb * (0.55 + 0.45*noise2(vLocal*5.0+vSeed)), uFog, fg);
  oCol = vec4(c, a*(1.0-fg));
  oBright = vec4(0.0,0.0,0.0,1.0);
}`;

  /* ----------------------------------------------------------------- post */
  const FS_QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2);
  vUv = p;
  gl_Position = vec4(p*2.0-1.0, 0.0, 1.0);
}`;

  const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;      // texel-sized step
out vec4 oCol;
void main(){
  vec3 s = texture(uTex, vUv).rgb * 0.227027;
  s += (texture(uTex, vUv + uDir*1.3846).rgb + texture(uTex, vUv - uDir*1.3846).rgb) * 0.316216;
  s += (texture(uTex, vUv + uDir*3.2307).rgb + texture(uTex, vUv - uDir*3.2307).rgb) * 0.070270;
  oCol = vec4(s, 1.0);
}`;

  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform float uAberration;
uniform float uVignette;
uniform float uTime;
uniform float uFlash;
uniform vec3  uFlashCol;
uniform float uSpeedBlur;   // radial streak amount
uniform float uHurt;
out vec4 oCol;
${COMMON}
void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d,d);

  // radial speed streaks
  vec3 base = vec3(0.0);
  if(uSpeedBlur > 0.001){
    float w = 0.0;
    for(int i=0;i<6;i++){
      float t = float(i)/5.0;
      float sc = 1.0 - t*uSpeedBlur*0.09*smoothstep(0.02,0.30,r2);
      float wt = 1.0 - t*0.55;
      base += texture(uScene, 0.5 + d*sc).rgb * wt;
      w += wt;
    }
    base /= w;
  } else {
    base = texture(uScene, uv).rgb;
  }

  // chromatic aberration, strongest at the edges
  float ab = uAberration * (0.35 + r2*2.4);
  if(ab > 0.0002){
    base.r = mix(base.r, texture(uScene, uv + d*ab).r, 0.9);
    base.b = mix(base.b, texture(uScene, uv - d*ab).b, 0.9);
  }

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 col = base + bloom * uBloomAmt;

  // punchy grade
  col = pow(max(col, 0.0), vec3(0.92));
  col = mix(vec3(dot(col, vec3(0.299,0.587,0.114))), col, 1.22);
  col *= mix(vec3(1.02,0.99,0.96), vec3(1.0), 0.4);

  col += uFlashCol * uFlash;
  col = mix(col, vec3(0.72,0.05,0.06), uHurt * (0.25 + r2*1.4));

  float vig = smoothstep(0.95, 0.18, r2*2.0);
  col *= mix(1.0, vig, uVignette);

  // gentle filmic knee so explosions don't clip flat
  col = col / (1.0 + col*0.22);
  col *= 1.18;

  float g = (hash12(uv*vec2(1920.0,1080.0) + fract(uTime)*137.0)-0.5) * 0.035;
  col += g;

  oCol = vec4(col, 1.0);
}`;

  BA.shaders = {
    SCENE_VS, SCENE_FS, GROUND_VS, GROUND_FS, SKY_VS, SKY_FS,
    SHADOW_VS, SHADOW_FS, DECAL_VS, DECAL_FS,
    FS_QUAD_VS, BLUR_FS, COMPOSITE_FS,
  };
})();
