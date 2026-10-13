// Fresnel rim shell / ground dome (port of vfx.js shell()). Use on a SphereMesh (is_hemisphere for ground domes,
// scale Y ×0.55). Animate scale 0.15→1.0 (ease-out cubic) and `fade` = (1-k)² over 0.22–0.4 s.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;

uniform vec3 color : source_color = vec3(1.0);
uniform float intensity = 2.4;
uniform float fade : hint_range(0.0, 1.0) = 1.0;

void fragment() {
	float f = 1.0 - abs(dot(NORMAL, VIEW));
	ALBEDO = color * intensity * pow(f, 2.6) * fade;
}
