import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import kdtree

DENSE_EDGE = 0.12
DENSE_PASSES = 8
AO_DISTANCE = 1.0
AO_CURVE = 1.6
AO_SAMPLES = 512
EDGE_WIDTH = 0.045
EDGE_ANGLE = 0.5
EDGE_STEP = 0.01
UV_ANGLE = math.radians(66)
UV_MARGIN = 0.02
UV_FILL = 0.55
BAKE_MARGIN = 8
MASK_MIN = 32
MASK_MAX = 1024
MARKER = "surfaceMask"
BAKE_NODE = "surface_mask_bake"
GLTF_GROUP = "glTF Material Output"


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    parser = argparse.ArgumentParser(prog="blender --background --python bake_mask.py --")
    parser.add_argument("src", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--version", type=int, required=True)
    parser.add_argument("--texel", type=float, required=True, help="meters per mask pixel")
    return parser.parse_args(argv)


def joined_mesh() -> bpy.types.Object:
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("model has no meshes")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.object


def unwrap(obj: bpy.types.Object) -> None:
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=UV_ANGLE, island_margin=UV_MARGIN, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def mask_side(obj: bpy.types.Object, texel: float) -> int:
    area = sum(p.area for p in obj.data.polygons)
    want = math.sqrt(area / UV_FILL) / texel
    side = MASK_MIN
    while side < want and side < MASK_MAX:
        side *= 2
    return side


def convex_edges(obj: bpy.types.Object) -> kdtree.KDTree | None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    points = []
    for e in bm.edges:
        if len(e.link_faces) != 2 or not e.is_convex or e.calc_face_angle(0.0) < EDGE_ANGLE:
            continue
        a, b = e.verts[0].co, e.verts[1].co
        n = max(1, math.ceil((b - a).length / EDGE_STEP))
        points += [a.lerp(b, i / n) for i in range(n + 1)]
    bm.free()
    if not points:
        return None
    tree = kdtree.KDTree(len(points))
    for i, p in enumerate(points):
        tree.insert(p, i)
    tree.balance()
    return tree


def dense_twin(obj: bpy.types.Object) -> bpy.types.Object:
    twin = obj.copy()
    twin.data = obj.data.copy()
    twin.name = f"{obj.name}_dense"
    bpy.context.scene.collection.objects.link(twin)
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    for _ in range(DENSE_PASSES):
        long = [e for e in bm.edges if e.calc_length() > DENSE_EDGE]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    else:
        raise RuntimeError(f"{obj.name} still has edges over {DENSE_EDGE} m after {DENSE_PASSES} passes")
    bm.to_mesh(twin.data)
    bm.free()
    twin.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    twin.data.color_attributes.active_color_name = "Col"
    return twin


def only_selected(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_ao(twin: bpy.types.Object, hidden: bpy.types.Object) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = AO_SAMPLES
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = AO_DISTANCE
    hidden.hide_render = True
    only_selected(twin)
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    hidden.hide_render = False


def write_masks(twin: bpy.types.Object, edges: kdtree.KDTree | None) -> None:
    col = twin.data.color_attributes["Col"]
    for d, vert in zip(col.data, twin.data.vertices):
        shadow = d.color[0] ** AO_CURVE
        wear = 0.0
        if edges:
            _, _, dist = edges.find(vert.co)
            wear = max(0.0, 1.0 - dist / EDGE_WIDTH)
        d.color = (shadow, wear, 0.0, 1.0)


def bake_material(image: bpy.types.Image) -> bpy.types.Material:
    mat = bpy.data.materials.new(BAKE_NODE)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    emit = nodes.new("ShaderNodeEmission")
    out = nodes.new("ShaderNodeOutputMaterial")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    links.new(attr.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    nodes.active = tex
    return mat


def bake_image(twin: bpy.types.Object, name: str, side: int) -> bpy.types.Image:
    image = bpy.data.images.new(f"{name}_mask", side, side, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "Non-Color"
    twin.data.materials.clear()
    twin.data.materials.append(bake_material(image))
    for poly in twin.data.polygons:
        poly.material_index = 0
    scene = bpy.context.scene
    scene.cycles.samples = 1
    scene.render.bake.margin = BAKE_MARGIN
    scene.render.bake.margin_type = "EXTEND"
    only_selected(twin)
    bpy.ops.object.bake(type="EMIT", target="IMAGE_TEXTURES")
    settings = scene.render.image_settings
    settings.file_format = "PNG"
    settings.color_mode = "RGB"
    settings.color_depth = "8"
    settings.compression = 100
    path = Path(bpy.app.tempdir) / f"{name}_mask.png"
    image.save_render(str(path), scene=scene)
    saved = bpy.data.images.load(str(path))
    saved.colorspace_settings.name = "Non-Color"
    saved.pack()
    return saved


def gltf_output_group() -> bpy.types.NodeTree:
    group = bpy.data.node_groups.get(GLTF_GROUP)
    if group:
        return group
    group = bpy.data.node_groups.new(GLTF_GROUP, "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def attach_mask(obj: bpy.types.Object, image: bpy.types.Image) -> None:
    group = gltf_output_group()
    for mat in obj.data.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        for old in [n for n in nodes if n.type in {"TEX_IMAGE", "SEPARATE_COLOR", "GROUP"}]:
            nodes.remove(old)
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        split = nodes.new("ShaderNodeSeparateColor")
        out = nodes.new("ShaderNodeGroup")
        out.node_tree = group
        links.new(tex.outputs["Color"], split.inputs["Color"])
        links.new(split.outputs["Red"], out.inputs["Occlusion"])


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.src))
    name = args.src.stem
    obj = joined_mesh()
    faces = len(obj.data.polygons)
    unwrap(obj)
    side = mask_side(obj, args.texel)
    edges = convex_edges(obj)
    twin = dense_twin(obj)
    bake_ao(twin, obj)
    write_masks(twin, edges)
    image = bake_image(twin, name, side)
    bpy.data.objects.remove(twin)
    attach_mask(obj, image)
    if len(obj.data.polygons) != faces:
        raise RuntimeError(f"{name} changed from {faces} to {len(obj.data.polygons)} faces during the bake")
    bpy.context.scene[MARKER] = {"version": args.version, "side": side}
    bpy.ops.object.select_all(action="SELECT")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.out),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_vertex_color="NONE",
        export_image_format="AUTO",
    )
    print(f"baked {name}: faces {faces}, mask {side}px")


main()
