// Stylised breaking-wave sheet (cartoon water: deep blue body, lighter streaked face, blobby white
// foam on the curling lip). UV.x runs 0 -> 1 across the cone's arc; UV.y runs along the profile:
// ~0 at the feet, 0.72 at the crest, 1 at the lip tip. Unshaded and kept below 1.0 so the
// Compatibility glow never blows it out.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_always, blend_mix;

uniform vec3 deep : source_color = vec3(0.07, 0.24, 0.56);
uniform vec3 mid : source_color = vec3(0.15, 0.46, 0.82);
uniform vec3 light : source_color = vec3(0.42, 0.78, 0.95);
uniform vec3 foam : source_color = vec3(0.92, 0.97, 1.0);
uniform float foam_from = 0.84; // profile position where the lip turns to foam
uniform float fade : hint_range(0.0, 1.0) = 1.0;
uniform float t = 0.0; // effect time: the foam edge churns

float hash(float n) { return fract(sin(n) * 43758.5453); }

float noise(float x) {
	float i = floor(x);
	float f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(hash(i), hash(i + 1.0), f);
}

void fragment() {
	float v = UV.y;
	vec3 c = mix(deep, mid, smoothstep(0.0, 0.45, v));
	c = mix(c, light, smoothstep(0.5, 0.8, v));
	// lighter streaks running up the face, never evenly spaced
	float streak = smoothstep(0.7, 1.0, sin(UV.x * 64.0 + v * 9.0 + noise(UV.x * 11.0) * 5.0));
	c = mix(c, light, streak * 0.35 * smoothstep(0.15, 0.7, v));
	// blobby foam along the lip, churning and uneven across the arc
	float edge = foam_from - 0.08 * noise(UV.x * 23.0 + t * 1.7) - 0.05 * noise(UV.x * 57.0 - t * 2.3);
	c = mix(c, foam, step(edge, v));
	// a thin ragged foam line where the sheet meets the ground
	float foot = step(v, 0.035 + 0.03 * noise(UV.x * 31.0 + t));
	c = mix(c, foam, foot * 0.85);
	// the inside of the curl is in its own shadow
	if (!FRONT_FACING) {
		c *= 0.72;
	}
	ALBEDO = c;
	ALPHA = 0.94 * fade * smoothstep(0.0, 0.06, UV.x) * smoothstep(1.0, 0.94, UV.x);
}
