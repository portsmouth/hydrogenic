var Shaders = {

'axis-fragment-shader': `#version 300 es
precision highp float;

out vec4 outputColor;
uniform vec4 color;

void main() 
{
	outputColor = color;
}
`,

'axis-vertex-shader': `#version 300 es
precision highp float;

uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;

in vec3 Position;

void main()
{
	gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(Position, 1.0);
}
`,

'raymarcher-fragment-shader': `#version 300 es
precision highp float;
in vec2 vTexCoord;
layout(location = 0) out vec4 gbuf_rad;

uniform vec2 resolution;
uniform vec3 camPos;
uniform vec3 camDir;
uniform vec3 camX;
uniform vec3 camY;
uniform float camFovy; // degrees
uniform float camAspect;
uniform vec3 bg_color;

uniform float radialScale; // Bohr radius, in box units
uniform float density_scale;
uniform float emission_scale;
uniform vec2 phase1;
uniform vec2 phase2;
uniform vec2 phase3;
uniform vec2 phase4;
uniform vec2 overall_phase;

#define FLT_EPSILON 5.0e-7
#define M_PI 3.1415926535897932384626433832795

//////////////////////////////////////////////////////////////
// Dynamically injected code
//////////////////////////////////////////////////////////////

float R10(float r) { float p = 2.0*r/(1.0*radialScale); return exp(-0.5*p) * 2.0;                                                        }
float R20(float r) { float p = 2.0*r/(2.0*radialScale); return exp(-0.5*p) * 1.0/(2.0*sqrt(2.0))   * (2.0 - p);                          }
float R21(float r) { float p = 2.0*r/(2.0*radialScale); return exp(-0.5*p) * 1.0/(2.0*sqrt(6.0))   * p;                                  }
float R30(float r) { float p = 2.0*r/(3.0*radialScale); return exp(-0.5*p) * 1.0/(9.0*sqrt(3.0))   * (6.0 - 6.0*p + p*p);                }
float R31(float r) { float p = 2.0*r/(3.0*radialScale); return exp(-0.5*p) * 1.0/(9.0*sqrt(6.0))   * (4.0 - p)*p;                          }
float R32(float r) { float p = 2.0*r/(3.0*radialScale); return exp(-0.5*p) * 1.0/(9.0*sqrt(30.0))  * p*p;                                }
float R40(float r) { float p = 2.0*r/(4.0*radialScale); return exp(-0.5*p) * 1.0/(96.0)            * (24.0 - 36.0*p + 12.0*p*p - p*p*p); }
float R41(float r) { float p = 2.0*r/(4.0*radialScale); return exp(-0.5*p) * 1.0/(32.0*sqrt(15.0)) * (20.0 - 10.0*p + p*p)*p;            }
float R42(float r) { float p = 2.0*r/(4.0*radialScale); return exp(-0.5*p) * 1.0/(96.0*sqrt(5.0))  * (6.0 - p)*p*p;                      }
float R43(float r) { float p = 2.0*r/(4.0*radialScale); return exp(-0.5*p) * 1.0/(96.0*sqrt(35.0)) * p*p*p;                              }

float P00(float x) { return 1.0;                                  }
float P11(float x) { return -sqrt(1.0 - x*x);                     }
float P10(float x) { return x;                                    }
float P22(float x) { return 3.0*(1.0 - x*x);                      }
float P21(float x) { return -3.0*x*sqrt(1.0 - x*x);               }
float P20(float x) { return (3.0*x*x - 1.0)/2.0;                  }
float P33(float x) { return -15.0*pow(sqrt(1.0-x*x), 3.0);        }
float P32(float x) { return 15.0*x*(1.0 - x*x);                   }
float P31(float x) { return -3.0/2.0*(5.0*x*x-1.0)*sqrt(1.0-x*x); }
float P30(float x) { return (5.0*x*x - 3.0)*x/2.0;                }

// l=0 wavefunction (s-orbital)
float Y00_re(float mu, float phi) { return 0.28209479177387814 * P00(mu); }
float Y00_im(float mu, float phi) { return 0.0; }

// l=1 wavefunctions (p-orbitals)
float Y11_re(float mu, float phi)  { return -0.3454941494713355 * P11(mu) * cos(phi); }
float Y11_im(float mu, float phi)  { return -0.3454941494713355 * P11(mu) * sin(phi); }
float Y10_re(float mu, float phi)  { return  0.4886025119029199 * P10(mu); }
float Y10_im(float mu, float phi)  { return  0.0; }
float Y1m1_re(float mu, float phi) { return -Y11_re(mu, phi); }
float Y1m1_im(float mu, float phi) { return  Y11_im(mu, phi); }

// l=2 wavefunctions (d-orbitals)
float Y22_re(float mu, float phi)  { return  0.12875806734106318 * P22(mu) * cos(2.0*phi); }
float Y22_im(float mu, float phi)  { return  0.12875806734106318 * P22(mu) * sin(2.0*phi); }
float Y21_re(float mu, float phi)  { return -0.25751613468212636 * P21(mu) * cos(phi); }
float Y21_im(float mu, float phi)  { return -0.25751613468212636 * P21(mu) * sin(phi); }
float Y20_re(float mu, float phi)  { return  0.6307831305050401  * P20(mu); }
float Y20_im(float mu, float phi)  { return  0.0; }
float Y2m1_re(float mu, float phi) { return -Y21_re(mu, phi); }
float Y2m1_im(float mu, float phi) { return  Y21_im(mu, phi); }
float Y2m2_re(float mu, float phi) { return  Y22_re(mu, phi); }
float Y2m2_im(float mu, float phi) { return -Y22_im(mu, phi); }

// l=3 wavefunctions (f-orbitals)
float Y33_re(float mu, float phi)  { return -0.027814921575518937 * P33(mu) * cos(3.0*phi); }
float Y33_im(float mu, float phi)  { return -0.027814921575518937 * P33(mu) * sin(3.0*phi); }
float Y32_re(float mu, float phi)  { return  0.06813236509555216  * P32(mu) * cos(2.0*phi); }
float Y32_im(float mu, float phi)  { return  0.06813236509555216  * P32(mu) * sin(2.0*phi); }
float Y31_re(float mu, float phi)  { return -0.21545345607610045  * P31(mu) * cos(phi); }
float Y31_im(float mu, float phi)  { return -0.21545345607610045  * P31(mu) * sin(phi); }
float Y30_re(float mu, float phi)  { return  0.7463526651802308   * P30(mu); }
float Y30_im(float mu, float phi)  { return 0.0; }
float Y3m1_re(float mu, float phi) { return -Y31_re(mu, phi); }
float Y3m1_im(float mu, float phi) { return  Y31_im(mu, phi); }
float Y3m2_re(float mu, float phi) { return  Y32_re(mu, phi); }
float Y3m2_im(float mu, float phi) { return -Y32_im(mu, phi); }
float Y3m3_re(float mu, float phi) { return -Y33_re(mu, phi); }
float Y3m3_im(float mu, float phi) { return  Y33_im(mu, phi); }

__COLORMAP__

vec2 orbital_1s(float r, float mu, float phi)  { return R10(r) * vec2(Y00_re(mu, phi), Y00_im(mu, phi)); } // s-orbitals (l=0)
vec2 orbital_2s(float r, float mu, float phi)  { return R20(r) * vec2(Y00_re(mu, phi), Y00_im(mu, phi)); } 
vec2 orbital_3s(float r, float mu, float phi)  { return R30(r) * vec2(Y00_re(mu, phi), Y00_im(mu, phi)); }
vec2 orbital_4s(float r, float mu, float phi)  { return R40(r) * vec2(Y00_re(mu, phi), Y00_im(mu, phi)); }
vec2 orbital_2p1(float r, float mu, float phi) { return R21(r) * vec2(Y11_re(mu, phi), Y11_im(mu, phi)); } // p-orbitals (l=1)
vec2 orbital_2p0(float r, float mu, float phi) { return R21(r) * vec2(Y10_re(mu, phi), Y10_im(mu, phi)); }
vec2 orbital_3p1(float r, float mu, float phi) { return R31(r) * vec2(Y11_re(mu, phi), Y11_im(mu, phi)); }
vec2 orbital_3p0(float r, float mu, float phi) { return R31(r) * vec2(Y10_re(mu, phi), Y10_im(mu, phi)); }
vec2 orbital_4p1(float r, float mu, float phi) { return R41(r) * vec2(Y11_re(mu, phi), Y11_im(mu, phi)); }
vec2 orbital_4p0(float r, float mu, float phi) { return R41(r) * vec2(Y10_re(mu, phi), Y10_im(mu, phi)); }
vec2 orbital_3d2(float r, float mu, float phi) { return R32(r) * vec2(Y22_re(mu, phi), Y22_im(mu, phi)); } // d-orbitals (l=2)
vec2 orbital_3d1(float r, float mu, float phi) { return R32(r) * vec2(Y21_re(mu, phi), Y21_im(mu, phi)); }
vec2 orbital_3d0(float r, float mu, float phi) { return R32(r) * vec2(Y20_re(mu, phi), Y20_im(mu, phi)); }
vec2 orbital_4d2(float r, float mu, float phi) { return R42(r) * vec2(Y22_re(mu, phi), Y22_im(mu, phi)); }
vec2 orbital_4d1(float r, float mu, float phi) { return R42(r) * vec2(Y21_re(mu, phi), Y21_im(mu, phi)); }
vec2 orbital_4d0(float r, float mu, float phi) { return R42(r) * vec2(Y20_re(mu, phi), Y20_im(mu, phi)); }
vec2 orbital_4f3(float r, float mu, float phi) { return R43(r) * vec2(Y33_re(mu, phi), Y33_im(mu, phi)); } // f-orbitals (l=3)
vec2 orbital_4f2(float r, float mu, float phi) { return R43(r) * vec2(Y32_re(mu, phi), Y32_im(mu, phi)); }
vec2 orbital_4f1(float r, float mu, float phi) { return R43(r) * vec2(Y31_re(mu, phi), Y31_im(mu, phi)); }
vec2 orbital_4f0(float r, float mu, float phi) { return R43(r) * vec2(Y30_re(mu, phi), Y30_im(mu, phi)); }

vec2 orbital_2px(float r, float mu, float phi) { return R21(r) * vec2( Y1m1_re(mu, phi)-Y11_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_2py(float r, float mu, float phi) { return R21(r) * vec2(-Y1m1_im(mu, phi)-Y11_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_2pz(float r, float mu, float phi) { return R21(r) * vec2(                  Y10_re(mu, phi), FLT_EPSILON);           }
vec2 orbital_3px(float r, float mu, float phi) { return R31(r) * vec2( Y1m1_re(mu, phi)-Y11_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_3py(float r, float mu, float phi) { return R31(r) * vec2(-Y1m1_im(mu, phi)-Y11_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_3pz(float r, float mu, float phi) { return R31(r) * vec2(                  Y10_re(mu, phi), FLT_EPSILON);           }
vec2 orbital_4px(float r, float mu, float phi) { return R41(r) * vec2( Y1m1_re(mu, phi)-Y11_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4py(float r, float mu, float phi) { return R41(r) * vec2(-Y1m1_im(mu, phi)-Y11_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4pz(float r, float mu, float phi) { return R41(r) * vec2(                  Y10_re(mu, phi), FLT_EPSILON);           }

vec2 orbital_3dz2(float r, float mu, float phi) { return R32(r) * vec2(Y20_re(mu, phi), FLT_EPSILON); }
vec2 orbital_3dxz(float r, float mu, float phi) { return R32(r) * vec2( Y2m1_re(mu, phi)-Y21_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_3dyz(float r, float mu, float phi) { return R32(r) * vec2(-Y2m1_im(mu, phi)-Y21_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_3dxy(float r, float mu, float phi) { return R32(r) * vec2(-Y2m2_im(mu, phi)+Y22_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_3dx2y2(float r, float mu, float phi) { return R32(r) * vec2(Y2m2_re(mu, phi)+Y22_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4dz2(float r, float mu, float phi) { return R42(r) * vec2(Y20_re(mu, phi), FLT_EPSILON); }
vec2 orbital_4dxz(float r, float mu, float phi) { return R42(r) * vec2( Y2m1_re(mu, phi)-Y21_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4dyz(float r, float mu, float phi) { return R42(r) * vec2(-Y2m1_im(mu, phi)-Y21_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4dxy(float r, float mu, float phi) { return R42(r) * vec2(-Y2m2_im(mu, phi)+Y22_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4dx2y2(float r, float mu, float phi) { return R42(r) * vec2(Y2m2_re(mu, phi)+Y22_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }

vec2 orbital_4fz3(float r, float mu, float phi) { return R43(r) * vec2(Y30_re(mu, phi), FLT_EPSILON); }
vec2 orbital_4fxz2(float r, float mu, float phi) { return R43(r) * vec2(Y3m1_re(mu, phi)-Y31_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4fyz2(float r, float mu, float phi) { return R43(r) * vec2(-Y3m1_im(mu, phi)-Y31_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4fxyz(float r, float mu, float phi) { return R43(r) * vec2(-Y3m2_im(mu, phi)+Y32_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4fzx2y2(float r, float mu, float phi) { return R43(r) * vec2(Y3m2_re(mu, phi)+Y32_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4fxx23y2(float r, float mu, float phi) { return R43(r) * vec2(Y3m3_re(mu, phi)-Y33_re(mu, phi), FLT_EPSILON)/sqrt(2.0); }
vec2 orbital_4fy3x2y2(float r, float mu, float phi) { return R43(r) * vec2(-Y3m3_im(mu, phi)-Y33_im(mu, phi), FLT_EPSILON)/sqrt(2.0); }

vec2 complex_mul(in vec2 a, in vec2 b)
{
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

vec2 wavefunction(in vec3 X)
{
    float r = length(X);
    float mu = X.z / max(r, 1.0e-10);
    float phi = atan(X.y, X.x); 
    vec2 psi = ORBITAL_FUNC(r, mu, phi);
    psi = complex_mul(overall_phase, psi);
    float phase = atan(psi.y, psi.x);
    float electron_density = dot(psi, psi);
    return vec2(electron_density, phase);
}


////////////////////////////////////////////////////////////////////////////////
// Pathtracing integrator
////////////////////////////////////////////////////////////////////////////////

void constructPrimaryRay(in vec2 pixel,
                         inout vec3 ro, inout vec3 rd)
{
    // Compute world ray direction for given (possibly jittered) fragment
    vec2 ndc = -1.0 + 2.0*(pixel/resolution.xy);
    float fh = tan(0.5*radians(camFovy)); // frustum height
    float fw = camAspect*fh;
    vec3 s = -fw*ndc.x*camX + fh*ndc.y*camY;
    rd = normalize(camDir + s);
    ro = camPos;
}

#define sort2(a,b) { vec3 tmp=min(a,b); b=a+b-tmp; a=tmp; }

bool boxHit( in vec3 rayPos, in vec3 rayDir, in vec3 bbMin, in vec3 bbMax,
             inout float t0, inout float t1 )
{
    vec3 dL = 1.0/rayDir;
    vec3 lo = (bbMin - rayPos) * dL;
    vec3 hi = (bbMax - rayPos) * dL;
    sort2(lo, hi);
    bool hit = !( lo.x>hi.y || lo.y>hi.x || lo.x>hi.z || lo.z>hi.x || lo.y>hi.z || lo.z>hi.y );
    t0 = max(max(lo.x, lo.y), lo.z);
    t1 = min(min(hi.x, hi.y), hi.z);
    return hit;
}

vec3 raymarch(inout vec3 ro, inout vec3 rd)
{
    float Transmittance = 1.0;
    
    // intersect with bounds
    const float maxR = 1.0;
    vec3 boundsMin = vec3(-maxR);
    vec3 boundsMax = vec3( maxR);
    float t0, t1;
    if (!boxHit(ro, rd, boundsMin, boundsMax, t0, t1))
        return bg_color;

    float dl = (t1 - t0)/float(__MAX_MARCH_STEPS__);
    vec3 start = ro + t0*rd;
    
    vec3 L = vec3(0.0);
    float emission = 1.0e6 * emission_scale;
    float density = 1.0e6 * density_scale;
    for (int n=0; n<__MAX_MARCH_STEPS__; n++)
    {
        vec3 pW = start + (float(n)+0.5)*dl*rd;

        vec2 psi = wavefunction(pW);
        float electron_density = psi.x;
        float phase            = psi.y;
        float t = mod(phase + 2.0*M_PI, 2.0*M_PI) / (2.0*M_PI);
        vec4 color = (t<0.5) ? colormap(2.0*t) : colormap(2.0*(1.0-t));
        vec3 emission = electron_density * color.rgb * dl * emission;
        L += Transmittance*emission;
        float optical_depth = electron_density * density * dl;
        Transmittance *= exp(-optical_depth);
    }
    return L + Transmittance*bg_color;
}

void main()
{
    vec2 pixel = gl_FragCoord.xy;
    vec3 RGB = vec3(0.0);

    // @todo: Jitter over pixel
    vec2 pixelj = pixel + (-0.5 + vec2(0.5, 0.5));
    vec3 ro, rd;
    constructPrimaryRay(pixel, ro, rd);
    vec3 L = raymarch(ro, rd);

    gbuf_rad = vec4(L, 1.0);
}
`,

'raymarcher-vertex-shader': `#version 300 es
precision highp float;

in vec3 Position;
in vec2 TexCoord;

out vec2 vTexCoord;

void main() 
{
    gl_Position = vec4(Position, 1.0);
    vTexCoord = TexCoord;
}
`,

'tonemapper-fragment-shader': `#version 300 es
precision highp float;

uniform sampler2D Radiance;
in vec2 vTexCoord;

uniform float exposure;
uniform float contrast;
uniform float saturation;

out vec4 g_outputColor;

float toneMap(float L)
{
  return L / (1.0 + L);
}

void main()
{
    vec3 RGB = texture(Radiance, vTexCoord).rgb;
        
    // deal with out-of-gamut RGB.
    float delta = -min(0.0, min(min(RGB.r, RGB.g), RGB.b));
    RGB.r += delta;
    RGB.g += delta;
    RGB.b += delta;

    // apply tonemapping
    RGB *= pow(2.0, exposure);
    float R = RGB.r;
    float G = RGB.g;
    float B = RGB.b;
    R = toneMap(R);
    G = toneMap(G);
    B = toneMap(B);

    // apply saturation
    float mean = (R + G + B)/3.0;
    float dR = R - mean;
    float dG = G - mean;
    float dB = B - mean;
    R = mean + sign(dR)*pow(abs(dR), 1.0/saturation);
    G = mean + sign(dG)*pow(abs(dG), 1.0/saturation);
    B = mean + sign(dB)*pow(abs(dB), 1.0/saturation);

    // apply contrast
    dR = R - 0.5;
    dG = G - 0.5;
    dB = B - 0.5;
    R = 0.5 + sign(dR)*pow(abs(dR), 1.0/contrast);
    G = 0.5 + sign(dG)*pow(abs(dG), 1.0/contrast);
    B = 0.5 + sign(dB)*pow(abs(dB), 1.0/contrast);

    g_outputColor = vec4(vec3(R,G,B), 1.0);
}
`,

'tonemapper-vertex-shader': `#version 300 es
precision highp float;

in vec3 Position;
in vec2 TexCoord;
out vec2 vTexCoord;

void main() 
{
    gl_Position = vec4(Position, 1.0);
    vTexCoord = TexCoord;
}
`,

}