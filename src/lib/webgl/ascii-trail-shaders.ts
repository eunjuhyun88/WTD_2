export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vUv = aPos * 0.5 + 0.5;
}
`;

export const TRAIL_PAINT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uMouse, uMousePrev, uRes;
uniform float uSize, uTime;
out vec4 o;

const float FADE = 0.988, RAD = 0.008, STR = 0.65, CUT = 0.003;

float dSeg(vec2 p, vec2 a, vec2 b) {
  vec2 d = b - a; float l2 = dot(d, d);
  if (l2 < 1e-6) return length(p - a);
  return length(p - (a + d * clamp(dot(p - a, d) / l2, 0.0, 1.0)));
}
float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x),
             mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}
float fbm4(vec2 p) {
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * vn(p); p = m * p; a *= 0.5; }
  return v;
}

void main() {
  vec3 prev = texture(uPrev, vUv).rgb * FADE;
  float asp = uRes.x / max(1.0, uRes.y);
  vec2 p = vec2(vUv.x * asp, vUv.y);
  vec2 a = vec2(uMousePrev.x * asp, uMousePrev.y);
  vec2 b = vec2(uMouse.x * asp, uMouse.y);
  float d = dSeg(p, a, b);
  float segLen = length(b - a);
  float mask = smoothstep(0.00025, 0.0015, segLen);
  float dynR = mix(RAD, RAD * 8.0, clamp(uSize, 0.0, 1.0));
  vec2 nuv = vUv * vec2(7.0, 4.8) + vec2(uTime * 0.35, -uTime * 0.22);
  float wX = fbm4(nuv + vec2(1.7, 5.1)), wY = fbm4(nuv + vec2(8.3, 2.4));
  float edge = (fbm4(nuv + (vec2(wX, wY) - 0.5) * 1.35) - 0.5) * 2.0;
  float nD = d + edge * dynR * 0.22;
  float brush = exp(-pow(nD / max(1e-4, dynR), 2.0) * 2.0) * mask * STR;
  vec3 trail = max(clamp(prev + vec3(brush), 0.0, 1.0) - CUT, 0.0);
  o = vec4(trail, 1.0);
}
`;

export const TRAIL_GROW_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
out vec4 o;

const float GROW = 0.18, DISS = 0.990, CUT = 0.003;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x),
             mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 tx = 1.0 / max(uRes, vec2(1.0));
  vec3 c = texture(uPrev, vUv).rgb;
  vec3 n = max(max(max(texture(uPrev, vUv + vec2(tx.x, 0)).rgb,
                       texture(uPrev, vUv - vec2(tx.x, 0)).rgb),
                   max(texture(uPrev, vUv + vec2(0, tx.y)).rgb,
                       texture(uPrev, vUv - vec2(0, tx.y)).rgb)),
               max(max(texture(uPrev, vUv + tx).rgb,
                       texture(uPrev, vUv + vec2(-tx.x, tx.y)).rgb),
                   max(texture(uPrev, vUv + vec2(tx.x, -tx.y)).rgb,
                       texture(uPrev, vUv - tx).rgb)));
  vec3 grown = mix(c, max(c, n), GROW);
  float ns = vn(vUv * vec2(5.0, 3.4) + vec2(uTime * 0.18, -uTime * 0.12)) * 2.0 - 1.0;
  o = vec4(max(grown * clamp(DISS + ns * 0.04, 0.0, 1.0) - CUT, 0.0), 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail, uLogo;
uniform vec2 uRes, uMouse;
uniform vec4 uLogoRect;
uniform float uTime;
out vec4 o;

const float CELL = 10.0, THRESH = 0.14;

float gs(float d, float r, float e) { return 1.0 - smoothstep(r, r + e, d); }
float gd(vec2 p, vec2 c, float r) { return gs(length(p - c), r, 0.03); }
float gl2(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  return gs(length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)), w, 0.02);
}

float glyph(vec2 u, float lv) {
  if (lv < 0.5) return 0.0;
  if (lv < 1.5) return gd(u, vec2(0.5), 0.08);
  if (lv < 2.5) return max(gd(u, vec2(0.5, 0.33), 0.08), gd(u, vec2(0.5, 0.68), 0.08));
  if (lv < 3.5) return max(gl2(u, vec2(0.18, 0.5), vec2(0.82, 0.5), 0.05),
                            gl2(u, vec2(0.5, 0.18), vec2(0.5, 0.82), 0.05));
  if (lv < 4.5) return max(gl2(u, vec2(0.2, 0.2), vec2(0.8, 0.8), 0.05),
                            gl2(u, vec2(0.8, 0.2), vec2(0.2, 0.8), 0.05));
  if (lv < 5.5) { float r = abs(length(u - vec2(0.5)) - 0.24); return gs(r, 0.06, 0.02); }
  if (lv < 6.5) return max(max(gl2(u, vec2(0.2, 0.32), vec2(0.8, 0.32), 0.045),
                                gl2(u, vec2(0.2, 0.68), vec2(0.8, 0.68), 0.045)),
                            max(gl2(u, vec2(0.32, 0.2), vec2(0.32, 0.8), 0.045),
                                gl2(u, vec2(0.68, 0.2), vec2(0.68, 0.8), 0.045)));
  if (lv < 7.5) return max(gs(abs(length(u - vec2(0.5, 0.37)) - 0.16), 0.05, 0.02),
                            gs(abs(length(u - vec2(0.5, 0.65)) - 0.16), 0.05, 0.02));
  return max(max(gs(abs(length(u - vec2(0.5)) - 0.24), 0.06, 0.02),
                 gd(u, vec2(0.52, 0.48), 0.09)),
             gl2(u, vec2(0.55, 0.55), vec2(0.82, 0.76), 0.045));
}

vec3 brand(vec2 uv, float t) {
  float v = (sin(uv.x * 4.7 + t * 0.3) + cos(uv.y * 3.3 - t * 0.2)) * 0.5 + 0.5;
  vec3 rose = vec3(0.858, 0.604, 0.624);
  vec3 sage = vec3(0.678, 0.792, 0.486);
  vec3 gold = vec3(0.949, 0.820, 0.576);
  return v < 0.5 ? mix(rose, sage, v * 2.0) : mix(sage, gold, v * 2.0 - 1.0);
}

void main() {
  vec2 px = vUv * uRes;
  vec2 grid = floor(px / CELL);
  vec2 cell = fract(px / CELL);
  vec2 suv = ((grid + 0.5) * CELL) / uRes;

  float trail = texture(uTrail, suv).r;
  vec3 pal = brand(suv, uTime);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (trail > THRESH) {
    float lv = floor(clamp(pow(trail, 0.9), 0.0, 1.0) * 8.0 + 0.5);
    float ch = glyph(cell, lv);
    vec2 sh = vec2(10.2 / uRes.x, 0.0);
    float tR = texture(uTrail, suv + sh).r;
    float tB = texture(uTrail, suv - sh).r;
    vec3 chroma = clamp(vec3(tR, trail, tB) * 1.45 + 0.08, 0.0, 1.0);
    col = pal * chroma * ch;
    alpha = ch * min(trail * 1.2, 0.72);
  }

  if (alpha < 0.01) {
    vec2 lr = uLogoRect.xy, lt = uLogoRect.zw;
    vec2 logoUv = (suv - lr) / max(lt - lr, vec2(1e-4));
    if (logoUv.x >= 0.0 && logoUv.x <= 1.0 && logoUv.y >= 0.0 && logoUv.y <= 1.0) {
      vec4 ls = texture(uLogo, logoUv);
      float lum = dot(ls.rgb, vec3(0.2126, 0.7152, 0.0722)) * ls.a;
      if (lum > 0.02) {
        float lv = floor(min(lum * 6.0, 4.0) + 0.5);
        float ch = glyph(cell, lv);
        float asp = uRes.x / uRes.y;
        float dist = length((suv - uMouse) * vec2(asp, 1.0));
        float glow = exp(-dist * dist * 8.0) * 0.45;
        float la = ch * lum * (0.10 + glow);
        col = pal * la;
        alpha = la;
      }
    }
  }

  vec2 duv = vUv * uRes + vec2(uTime * 60.0, uTime * 37.0);
  float grain = (fract(sin(dot(duv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.03;
  col += grain * alpha;

  o = vec4(col, alpha);
}
`;
