// Soft cloud billboards for flame, smoke, dust, mist, steam... (port of the Smoke points in vfx.js).
// One MultiMesh instance per particle. Instance COLOR = colour / 4 (so HDR values up to 4 fit) with
// alpha; INSTANCE_CUSTOM = (rotation, atlas cell 0..3, glow 0..1, unused). glow 1 adds (flame), glow 0
// blends normally (smoke); premultiplied alpha lets one material do both.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D atlas : source_color, filter_linear;

varying float v_glow;
varying float v_cell;

void vertex() {
	mat4 w = mat4(normalize(INV_VIEW_MATRIX[0]), normalize(INV_VIEW_MATRIX[1]), normalize(INV_VIEW_MATRIX[2]), MODEL_MATRIX[3]);
	float r = INSTANCE_CUSTOM.x;
	w = w * mat4(vec4(cos(r), -sin(r), 0.0, 0.0), vec4(sin(r), cos(r), 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	float s = length(MODEL_MATRIX[0].xyz);
	MODELVIEW_MATRIX = VIEW_MATRIX * w * mat4(vec4(s, 0.0, 0.0, 0.0), vec4(0.0, s, 0.0, 0.0), vec4(0.0, 0.0, s, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	v_cell = INSTANCE_CUSTOM.y;
	v_glow = INSTANCE_CUSTOM.z;
}

void fragment() {
	vec2 cell = vec2(mod(v_cell, 2.0), floor(v_cell / 2.0));
	vec4 t = texture(atlas, (clamp(UV, 0.01, 0.99) + cell) * 0.5);
	float a = t.a * COLOR.a;
	ALBEDO = COLOR.rgb * 4.0 * (0.5 + 0.5 * t.r) * a;
	ALPHA = a * (1.0 - v_glow);
}
