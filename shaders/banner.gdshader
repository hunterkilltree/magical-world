// A hanging cloth banner (R-064): a travelling wave runs down it, pinned at the top edge, so the
// free end swings most (the wave principle: the motion flows along the cloth, not all at once).
shader_type spatial;
render_mode cull_disabled;

uniform vec4 color : source_color = vec4(0.42, 0.07, 0.12, 1.0);
uniform vec4 trim : source_color = vec4(0.94, 0.78, 0.29, 1.0);
uniform float wave = 0.14;   // sway at the free end, metres
uniform float speed = 2.0;   // how fast the wave travels down
uniform float phase = 0.0;   // offset per banner so they don't move in step

void vertex() {
	float down = UV.y; // 0 at the pinned top, 1 at the free end
	float k = down * down;
	VERTEX.z += sin(down * 5.0 - TIME * speed + phase) * wave * k;
	VERTEX.x += sin(down * 2.5 - TIME * speed * 0.55 + phase * 1.7) * wave * 0.35 * k;
}

void fragment() {
	vec3 c = color.rgb;
	float edge = step(UV.x, 0.07) + step(0.93, UV.x) + step(0.9, UV.y);
	float stripe = step(abs(UV.y - 0.35), 0.025);
	c = mix(c, trim.rgb, clamp(edge + stripe, 0.0, 1.0));
	// a simple rune: a diamond in the middle of the cloth
	vec2 d = abs(UV - vec2(0.5, 0.58)) * vec2(1.0, 0.55);
	float rune = step(abs(d.x + d.y - 0.16), 0.015);
	c = mix(c, trim.rgb, rune);
	ALBEDO = c;
	ROUGHNESS = 0.92;
}
