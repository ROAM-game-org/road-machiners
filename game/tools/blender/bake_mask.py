import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy

DENSE_EDGE = 0.12
DENSE_PASSES = 14
AO_DISTANCE = 1.0
AO_CURVE = 1.6
AO_SAMPLES = 512
UV_ANGLE = math.radians(66)
WELD = 1e-4
SHRINK = 0.01
ISLAND_GAP_PX = 2
BAKE_MARGIN_PX = 8
MASK_MIN = 16
WHITE_BLOCK_PX = 4
SOURCE_FACE = "source_face"
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
    parser.add_argument("--max-side", type=int, required=True, help="largest mask side in pixels")
    parser.add_argument("--min-island", type=float, required=True, help="least thickness in pixels of a masked UV island")
    parser.add_argument("--least-fill", type=float, required=True, help="least masked share of a mask that misses the texel at the largest side")
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


class Packing:
    def __init__(self, side: int, white: set[int], texel: float, fill: float, thin: list[int]) -> None:
        self.side = side
        self.white = white
        self.texel = texel
        self.fill = fill
        self.thin = thin
        self.overlaps = 0


def uv_area(faces: list[bmesh.types.BMFace], uv: bmesh.types.BMLayerItem) -> float:
    total = 0.0
    for f in faces:
        loops = [l[uv].uv for l in f.loops]
        for k in range(1, len(loops) - 1):
            a, b = loops[k] - loops[0], loops[k + 1] - loops[0]
            total += abs(a.x * b.y - a.y * b.x) / 2
    return total


def perimeters(faces: list[bmesh.types.BMFace], uv: bmesh.types.BMLayerItem) -> tuple[float, float]:
    edges: dict[tuple, tuple[float, float]] = {}
    for f in faces:
        for l in f.loops:
            a, b = l[uv].uv, l.link_loop_next[uv].uv
            key = tuple(sorted([(round(a.x, 7), round(a.y, 7)), (round(b.x, 7), round(b.y, 7))]))
            edges[key] = (0.0, 0.0) if key in edges else ((a - b).length, l.edge.calc_length())
    return sum(e[0] for e in edges.values()), sum(e[1] for e in edges.values())


def thickness_px(faces: list[bmesh.types.BMFace], uv: bmesh.types.BMLayerItem, side: int) -> float:
    perimeter = perimeters(faces, uv)[0]
    return 4 * uv_area(faces, uv) * side / perimeter if perimeter > 0 else 0.0


def thickness_m(faces: list[bmesh.types.BMFace], uv: bmesh.types.BMLayerItem) -> float:
    perimeter = perimeters(faces, uv)[1]
    return 4 * sum(f.calc_area() for f in faces) / perimeter if perimeter > 0 else 0.0


def uv_twin(obj: bpy.types.Object) -> bpy.types.Object:
    twin = obj.copy()
    twin.data = obj.data.copy()
    twin.name = f"{obj.name}_uv"
    bpy.context.scene.collection.objects.link(twin)
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    source = bm.faces.layers.int.new(SOURCE_FACE)
    for f in bm.faces:
        f[source] = f.index
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=WELD)
    bm.to_mesh(twin.data)
    bm.free()
    while twin.data.uv_layers:
        twin.data.uv_layers.remove(twin.data.uv_layers[0])
    twin.data.uv_layers.new(name="UVMap")
    only_selected(twin)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=UV_ANGLE, island_margin=0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    folded = overlapping_faces(twin, set())
    edit_uvs(twin, lambda bm, uv: split_off(bm, uv, folded))
    return twin


def split_off(bm: bmesh.types.BMesh, uv: bmesh.types.BMLayerItem, faces: set[int]) -> None:
    for n, f in enumerate(bm.faces[i] for i in sorted(faces)):
        for l in f.loops:
            l[uv].uv.x += 2 * (n + 1)


def side_of(p, a, b) -> float:
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / length if length > 0 else 0.0


def strictly_inside(p, tri, eps: float) -> bool:
    signs = [side_of(p, tri[k], tri[(k + 1) % 3]) for k in range(3)]
    return all(v > eps for v in signs) or all(v < -eps for v in signs)


def edges_cross(a, b, c, d, eps: float) -> bool:
    return side_of(c, a, b) * side_of(d, a, b) < -eps * eps and side_of(a, c, d) * side_of(b, c, d) < -eps * eps


def triangles_overlap(t: tuple, u: tuple, eps: float) -> bool:
    for one, other in ((t, u), (u, t)):
        middle = (sum(p[0] for p in one) / 3, sum(p[1] for p in one) / 3)
        if strictly_inside(middle, other, eps) or any(strictly_inside(p, other, eps) for p in one):
            return True
    return any(edges_cross(t[i], t[(i + 1) % 3], u[j], u[(j + 1) % 3], eps) for i in range(3) for j in range(3))


def shrunk(corners: list[tuple[float, float]]) -> tuple:
    mx, my = sum(c[0] for c in corners) / 3, sum(c[1] for c in corners) / 3
    return tuple((mx + (x - mx) * (1 - SHRINK), my + (y - my) * (1 - SHRINK)) for x, y in corners)


def overlapping_faces(twin: bpy.types.Object, skip: set[int]) -> set[int]:
    mesh = twin.data
    uv = mesh.uv_layers.active.data
    tris = []
    for poly in mesh.polygons:
        if poly.index in skip:
            continue
        loops = list(poly.loop_indices)
        for k in range(1, len(loops) - 1):
            corners = (loops[0], loops[k], loops[k + 1])
            tris.append((poly.index, shrunk([tuple(uv[l].uv) for l in corners])))
    if not tris:
        return set()
    span = max(max(max(abs(c) for c in p) for p in t[1]) for t in tris)
    cell = span / 512
    eps = span * 1e-3
    grid: dict[tuple[int, int], list[int]] = {}
    for n, (_, pts) in enumerate(tris):
        for x in range(int(min(p[0] for p in pts) // cell), int(max(p[0] for p in pts) // cell) + 1):
            for y in range(int(min(p[1] for p in pts) // cell), int(max(p[1] for p in pts) // cell) + 1):
                grid.setdefault((x, y), []).append(n)
    found: set[int] = set()
    tested: set[tuple[int, int]] = set()
    for members in grid.values():
        for i, a in enumerate(members):
            for b in members[i + 1 :]:
                if (a, b) in tested:
                    continue
                tested.add((a, b))
                ta, tb = tris[a], tris[b]
                if ta[0] != tb[0] and triangles_overlap(ta[1], tb[1], eps):
                    found |= {ta[0], tb[0]}
    return found


def islands_of(twin: bpy.types.Object) -> list[list[int]]:
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    uv = bm.loops.layers.uv.active
    parent = list(range(len(bm.faces)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for f in bm.faces:
        for l in f.loops:
            for other in l.edge.link_loops:
                if other.face is not f and shares_uv_edge(l, other, uv):
                    parent[root(other.face.index)] = root(f.index)
    groups: dict[int, list[int]] = {}
    for f in bm.faces:
        groups.setdefault(root(f.index), []).append(f.index)
    bm.free()
    return sorted(groups.values())


def shares_uv_edge(l: bmesh.types.BMLoop, other: bmesh.types.BMLoop, uv: bmesh.types.BMLayerItem) -> bool:
    ends = {l.vert: l[uv].uv, l.link_loop_next.vert: l.link_loop_next[uv].uv}
    return all((ends[o.vert] - o[uv].uv).length < 1e-9 for o in (other, other.link_loop_next))


def edit_uvs(twin: bpy.types.Object, change) -> None:
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    bm.faces.ensure_lookup_table()
    change(bm, bm.loops.layers.uv.active)
    bm.to_mesh(twin.data)
    bm.free()


def pack(twin: bpy.types.Object, start: list[float], islands: list[list[int]], white: set[int], side: int) -> None:
    twin.data.uv_layers.active.data.foreach_set("uv", start)
    white_faces = {i for n in white for i in islands[n]}
    edit_uvs(twin, lambda bm, uv: to_white(bm, uv, white_faces, side))
    only_selected(twin)
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, rotate_method="AXIS_ALIGNED", scale=True, margin_method="FRACTION", margin=ISLAND_GAP_PX / side, pin=True, pin_method="LOCKED", shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")
    edit_uvs(twin, lambda bm, uv: clear_block(bm, uv, white_faces, side))


def to_white(bm: bmesh.types.BMesh, uv: bmesh.types.BMLayerItem, white_faces: set[int], side: int) -> None:
    center = WHITE_BLOCK_PX / 2 / side
    for f in bm.faces:
        for l in f.loops:
            l[uv].pin_uv = f.index in white_faces
            if l[uv].pin_uv:
                l[uv].uv = (center, center)


def clear_block(bm: bmesh.types.BMesh, uv: bmesh.types.BMLayerItem, white_faces: set[int], side: int) -> None:
    shift = (WHITE_BLOCK_PX + ISLAND_GAP_PX) / side
    for f in bm.faces:
        if f.index in white_faces:
            continue
        for l in f.loops:
            c = l[uv].uv
            l[uv].uv = (shift + c.x * (1 - shift), c.y * (1 - shift))


def measure(twin: bpy.types.Object, islands: list[list[int]], white: set[int], side: int, min_island: float) -> Packing:
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    masked = [n for n in range(len(islands)) if n not in white]
    faces = {n: [bm.faces[i] for i in islands[n]] for n in masked}
    area = sum(f.calc_area() for n in masked for f in faces[n])
    covered = sum(uv_area(faces[n], uv) for n in masked)
    texel = math.sqrt(area / (covered * side * side)) if covered > 0 else 0.0
    thin = [n for n in masked if thickness_px(faces[n], uv, side) < min_island]
    bm.free()
    return Packing(side, white, texel, covered, thin)


def thin_at(twin: bpy.types.Object, islands: list[list[int]], least: float) -> set[int]:
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    thin = {n for n, faces in enumerate(islands) if thickness_m([bm.faces[i] for i in faces], uv) < least}
    bm.free()
    return thin


def first_side(twin: bpy.types.Object, islands: list[list[int]], white: set[int], texel: float, max_side: int) -> int:
    area = sum(twin.data.polygons[i].area for n, faces in enumerate(islands) if n not in white for i in faces)
    side = MASK_MIN
    while side < math.sqrt(area) / texel and side < max_side:
        side *= 2
    return side


def unwrap(obj: bpy.types.Object, texel: float, max_side: int, min_island: float) -> Packing:
    twin = uv_twin(obj)
    islands = islands_of(twin)
    start = [0.0] * (len(twin.data.loops) * 2)
    twin.data.uv_layers.active.data.foreach_get("uv", start)
    white = thin_at(twin, islands, min_island * texel)
    side = first_side(twin, islands, white, texel, max_side)
    pack(twin, start, islands, white, side)
    packing = measure(twin, islands, white, side, min_island)
    while packing.texel > texel and side < max_side:
        side *= 2
        pack(twin, start, islands, white, side)
        packing = measure(twin, islands, white, side, min_island)
    while packing.thin:
        white |= set(packing.thin)
        pack(twin, start, islands, white, side)
        packing = measure(twin, islands, white, side, min_island)
    collapse_white(twin, islands, packing)
    white_faces = {i for n in packing.white for i in islands[n]}
    packing.overlaps = len(overlapping_faces(twin, white_faces))
    copy_uvs(twin, obj, packing.side)
    bpy.data.objects.remove(twin)
    return packing


def collapse_white(twin: bpy.types.Object, islands: list[list[int]], packing: Packing) -> None:
    center = WHITE_BLOCK_PX / 2 / packing.side

    def collapse(bm: bmesh.types.BMesh, uv: bmesh.types.BMLayerItem) -> None:
        for l in (l for f in bm.faces for l in f.loops):
            l[uv].pin_uv = False
        for n in packing.white:
            for l in (l for i in islands[n] for l in bm.faces[i].loops):
                l[uv].uv = (center, center)

    edit_uvs(twin, collapse)


def copy_uvs(twin: bpy.types.Object, obj: bpy.types.Object, side: int) -> None:
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name="UVMap")
    src, dst = twin.data.uv_layers.active.data, obj.data.uv_layers.active.data
    welded = {s.value: twin.data.polygons[n] for n, s in enumerate(twin.data.attributes[SOURCE_FACE].data)}
    white = WHITE_BLOCK_PX / 2 / side
    for b in obj.data.polygons:
        a = welded.get(b.index)
        for k in b.loop_indices:
            dst[k].uv = (white, white) if a is None else src[nearest_corner(twin, a, obj.data.vertices[obj.data.loops[k].vertex_index].co)].uv
    coords = [c for d in dst for c in d.uv]
    if min(coords) < 0 or max(coords) > 1:
        raise RuntimeError(f"{obj.name} UVs reach {min(coords):.3f} to {max(coords):.3f}, outside the mask")


def nearest_corner(twin: bpy.types.Object, face: bpy.types.MeshPolygon, co) -> int:
    mesh = twin.data
    best = min(face.loop_indices, key=lambda l: (mesh.vertices[mesh.loops[l].vertex_index].co - co).length)
    if (mesh.vertices[mesh.loops[best].vertex_index].co - co).length > WELD * 2:
        raise RuntimeError(f"{twin.name} face {face.index} lost a corner when welded")
    return best


def dense_twin(obj: bpy.types.Object) -> bpy.types.Object:
    twin = obj.copy()
    twin.data = obj.data.copy()
    twin.name = f"{obj.name}_dense"
    bpy.context.scene.collection.objects.link(twin)
    bm = bmesh.new()
    bm.from_mesh(twin.data)
    longest = math.inf
    for _ in range(DENSE_PASSES):
        long = [e for e in bm.edges if e.calc_length() > DENSE_EDGE]
        now = max((e.calc_length() for e in long), default=0.0)
        if not long or now >= longest:
            break
        longest = now
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    stuck = max((e.calc_length() for e in bm.edges), default=0.0)
    if stuck > DENSE_EDGE * 2:
        raise RuntimeError(f"{obj.name} still has a {stuck:.2f} m edge after {DENSE_PASSES} passes")
    bm.to_mesh(twin.data)
    bm.free()
    twin.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    twin.data.color_attributes.active_color_name = "Col"
    return twin


def only_selected(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_shadow(twin: bpy.types.Object, hidden: bpy.types.Object) -> None:
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
    for d in twin.data.color_attributes["Col"].data:
        shadow = d.color[0] ** AO_CURVE
        d.color = (shadow, shadow, shadow, 1.0)


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
    scene.render.bake.margin = BAKE_MARGIN_PX
    scene.render.bake.margin_type = "EXTEND"
    only_selected(twin)
    bpy.ops.object.bake(type="EMIT", target="IMAGE_TEXTURES")
    paint_white_block(image, side)
    settings = scene.render.image_settings
    settings.file_format = "PNG"
    settings.color_mode = "BW"
    settings.color_depth = "8"
    settings.compression = 100
    path = Path(bpy.app.tempdir) / f"{name}_mask.png"
    image.save_render(str(path), scene=scene)
    saved = bpy.data.images.load(str(path))
    saved.colorspace_settings.name = "Non-Color"
    saved.pack()
    return saved


def paint_white_block(image: bpy.types.Image, side: int) -> None:
    pixels = list(image.pixels)
    for y in range(WHITE_BLOCK_PX):
        for x in range(WHITE_BLOCK_PX):
            at = (y * side + x) * 4
            pixels[at : at + 3] = [1.0, 1.0, 1.0]
    image.pixels[:] = pixels


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


def check(name: str, packing: Packing, texel: float, max_side: int, least_fill: float) -> None:
    if packing.thin:
        raise RuntimeError(f"{name} keeps {len(packing.thin)} masked UV islands under the least thickness")
    if packing.overlaps:
        raise RuntimeError(f"{name} has {packing.overlaps} masked faces that share mask pixels")
    if packing.texel > texel and (packing.side < max_side or packing.fill < least_fill):
        raise RuntimeError(f"{name} mask texel is {packing.texel:.3f} m at {packing.side} px and {packing.fill:.0%} fill, over the {texel} m asked")


def main() -> None:
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.src))
    name = args.src.stem
    obj = joined_mesh()
    faces = len(obj.data.polygons)
    packing = unwrap(obj, args.texel, args.max_side, args.min_island)
    check(name, packing, args.texel, args.max_side, args.least_fill)
    side = packing.side
    twin = dense_twin(obj)
    bake_shadow(twin, obj)
    image = bake_image(twin, name, side)
    bpy.data.objects.remove(twin)
    attach_mask(obj, image)
    if len(obj.data.polygons) != faces:
        raise RuntimeError(f"{name} changed from {faces} to {len(obj.data.polygons)} faces during the bake")
    bpy.context.scene[MARKER] = {"version": args.version, "side": side, "texel": round(packing.texel, 4), "fill": round(packing.fill, 4), "white": WHITE_BLOCK_PX}
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
    print(f"baked {name}: faces {faces}, mask {side}px, texel {packing.texel:.3f} m, fill {packing.fill:.0%}, {len(packing.white)} white islands")


main()
