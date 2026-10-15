// Impact frames (wow.js). Full-screen ColorRect on a CanvasLayer above the 3D view.
// Drive from impact_frames.gd: frame 1 → mode 0 (inverted), frame 2 → mode 1 (hard black/white), then strength 0.
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform float strength = 0.0;   // 0 off, 1 on
uniform float mode = 0.0;       // 0 = inverted, 1 = black & white
uniform vec3 tint : source_color = vec3(1.0);

void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	vec3 inv = (vec3(1.0) - clamp(c, 0.0, 1.0)) * mix(vec3(1.0), tint, 0.35);
	vec3 bw = mix(vec3(0.03, 0.02, 0.05), mix(vec3(1.0), tint, 0.2) * 1.15, smoothstep(0.3, 0.4, l));
	COLOR = vec4(mix(c, mix(inv, bw, mode), strength), 1.0);
}
