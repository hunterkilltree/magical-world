// Velocity-stretched additive sparks (port of the Streaks instanced mesh in vfx.js). The quad
// (QuadMesh, -0.5..0.5) is stretched in view space from the spark back along its velocity.
// Instance COLOR = colour / 4 with alpha; INSTANCE_CUSTOM = (velocity * stretch time, width).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

void vertex() {
	vec3 at = MODEL_MATRIX[3].xyz;
	vec4 a = VIEW_MATRIX * vec4(at, 1.0);
	vec4 b = VIEW_MATRIX * vec4(at - INSTANCE_CUSTOM.xyz, 1.0);
	vec2 d = b.xy - a.xy;
	float L = length(d);
	vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
	vec2 perp = vec2(-dir.y, dir.x);
	float w = INSTANCE_CUSTOM.w;
	float y = VERTEX.y + 0.5;
	vec4 p = mix(a, b, y);
	p.xy += perp * VERTEX.x * w + dir * w * (y - 0.5);
	POSITION = PROJECTION_MATRIX * p;
}

void fragment() {
	float x = 1.0 - abs(UV.x * 2.0 - 1.0);
	float a = x * x * (1.0 - UV.y * 0.8) * COLOR.a;
	ALBEDO = COLOR.rgb * 4.0 * a;
}
