// Full-screen post: shockwave ripples, heat haze, chromatic aberration, colour flash (port of wow.js SCREEN pass).
// Put on a ColorRect (full rect) in a CanvasLayer above the 3D view. ScreenFx.gd feeds the uniforms each frame.
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform vec4 waves[6];   // (uv.x, uv.y, age 0..1 or -1 = off, strength)
uniform vec4 heat[8];    // (uv.x, uv.y, radius in aspect-corrected uv, strength 0 = off)
uniform float aspect = 1.777;
uniform float aberration = 0.0;
uniform vec4 flash = vec4(1.0, 1.0, 1.0, 0.0);

void fragment() {
	vec2 uv0 = SCREEN_UV;
	vec2 off = vec2(0.0);
	float ring = 0.0;
	for (int i = 0; i < 6; i++) {
		vec4 w = waves[i];
		if (w.z < 0.0) continue;
		vec2 d = uv0 - w.xy; d.x *= aspect;
		float L = length(d), r = w.z * (0.16 + 0.42 * w.w);
		float band = 1.0 - smoothstep(0.0, 0.05 + 0.04 * w.w, abs(L - r));
		float fade = (1.0 - w.z) * (1.0 - w.z);
		vec2 dir = d / max(L, 0.0001); dir.x /= aspect;
		off += dir * band * fade * w.w * 0.04;
		ring += band * fade * w.w;
	}
	for (int i = 0; i < 8; i++) {
		vec4 h = heat[i];
		if (h.w <= 0.0) continue;
		vec2 d = uv0 - h.xy; d.x *= aspect;
		float f = smoothstep(h.z, 0.0, length(d)) * h.w;
		off += vec2(sin(uv0.y * 95.0 + TIME * 11.0 + float(i) * 1.7), cos(uv0.x * 80.0 - TIME * 8.0)) * 0.0032 * f;
	}
	vec2 uv = uv0 - off, cd = uv - 0.5;
	float ab = aberration * (0.002 + 0.014 * length(cd)) + ring * 0.006;
	vec2 ad = normalize(cd + 0.0001) * ab;
	vec3 c = texture(screen_tex, uv).rgb;
	c.r = texture(screen_tex, uv + ad).r;
	c.b = texture(screen_tex, uv - ad).b;
	c += flash.rgb * flash.a + vec3(ring * 0.05);
	COLOR = vec4(c, 1.0);
}
