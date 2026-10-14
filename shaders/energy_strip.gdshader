// Additive ribbon for lightning bolts and projectile trails (port of vfx.js stripMat).
// Mesh UV.x runs 0→1 across the ribbon width; COLOR.a carries per-vertex fade (branch/trail taper).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;

uniform vec3 color : source_color = vec3(1.0);
uniform float intensity = 1.7;   // glow pass 1.7, core pass 3.2 (#fff8e8)
uniform float falloff = 2.2;     // glow 2.2, core 0.9
uniform float alpha : hint_range(0.0, 1.0) = 1.0; // flicker × (1 - k²)

void fragment() {
	float f = 1.0 - abs(UV.x * 2.0 - 1.0);
	ALBEDO = color * intensity * pow(f, falloff) * COLOR.a * alpha;
}
