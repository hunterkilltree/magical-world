// Noise-displaced fireball that cools from white-hot to soot and dissolves (port of vfx.js fireball()).
// Use on a SphereMesh (radial_segments 64, rings 32). Animate `age` 0→1 over life, scale 0.3→1.05 over first 40%.
shader_type spatial;
render_mode unshaded, cull_back;

uniform float age : hint_range(0.0, 1.0) = 0.0;
uniform float speed = 2.2;
uniform vec3 c0 : source_color = vec3(1.0, 0.957, 0.839); // core
uniform vec3 c1 : source_color = vec3(1.0, 0.702, 0.251); // body
uniform vec3 c2 : source_color = vec3(0.847, 0.251, 0.047); // edge
uniform vec3 c3 : source_color = vec3(0.086, 0.051, 0.039); // soot
uniform float emission = 3.4;

varying float n;

vec3 hash3(vec3 p) {
	p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
	return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec3 p) {
	vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
	               mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
	           mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
	               mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

void vertex() {
	vec3 q = VERTEX * 1.5 + vec3(0.0, -TIME * speed, 0.0);
	n = gnoise(q) * 1.2 + gnoise(q * 2.4 + 7.1) * 0.6 + gnoise(q * 5.0 - 3.0) * 0.25;
	VERTEX *= 1.0 + n * 0.32;
}

void fragment() {
	float fr = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float h = clamp(0.3 + fr * 0.8 + n * 0.5 - age * 1.3, 0.0, 1.0);
	if (n * 0.5 + 0.5 < age * 1.45 - 0.35) discard; // dissolve, never alpha-fade
	vec3 c = h > 0.66 ? mix(c1, c0, (h - 0.66) / 0.34) : h > 0.33 ? mix(c2, c1, (h - 0.33) / 0.33) : mix(c3, c2, h / 0.33);
	ALBEDO = c * (0.3 + h * h * emission); // HDR > 1 → bloom
}
