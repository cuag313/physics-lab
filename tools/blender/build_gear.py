"""Blender 建模脚本：把 2D 实拍图的器材做成真 3D 网格并导出 GLB。

尺寸基准：与 2D 的 SVG 一致，1px = 1cm，1 世界单位 = 1m。
坐标约定：Blender 里 +Z 朝上、正面朝 -Y；glTF 导出后 Blender 的 -Y 变成 three 的 +Z，
所以 three 里"正面朝 +Z"正好对上。

用法：
  D:\\Blender\\blender.exe -b -P tools/blender/build_gear.py -- --type ammeter --out public/assets/models/ammeter.glb
"""
import sys
import os
import math
import bpy
import bmesh
from mathutils import Vector

ARGV = sys.argv
args = ARGV[ARGV.index('--') + 1:] if '--' in ARGV else []


def arg(name, default=None):
    key = '--' + name
    if key in args:
        i = args.index(key)
        if i + 1 < len(args):
            return args[i + 1]
    return default


G = arg('type', 'ammeter')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FIG = os.path.join(ROOT, 'public', 'assets', 'equipment', 'fig')
OUT = arg('out', os.path.join(ROOT, 'public', 'assets', 'models', G + '.glb'))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat_solid(name, rgb, rough=0.55, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = None
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            bsdf = n
            break
    if bsdf is None:
        bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out = next(n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
        m.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return m


def mat_photo(name, png):
    """照片材质：整幅图铺满 UV，走 Principled 的 Base Color（不是纯 Emission）。

    早先直接 Emission 直连会导致：glTF 里 baseColor 仍是白色，three 端受强光照射后
    面板整体发白（实拍深蓝的电池正面被冲成一片白），所以改成 PBR 贴图 + 极弱自发光，
    既能保住照片原色，又不会在阴影里变成灰板。
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tex = nt.nodes.new('ShaderNodeTexImage')
    img = bpy.data.images.load(png, check_existing=True)
    tex.image = img
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    # 印刷纸面板：粗糙、无金属
    bsdf.inputs['Roughness'].default_value = 0.82
    bsdf.inputs['Metallic'].default_value = 0.0
    if 'Emission Color' in bsdf.inputs:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    if 'Emission Strength' in bsdf.inputs:
        bsdf.inputs['Emission Strength'].default_value = 0.10
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m


def poly(name, verts, faces, mat=None, bevel=0.0, seg=2):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    if bevel > 0:
        bv = ob.modifiers.new('bev', 'BEVEL')
        bv.width = bevel
        bv.segments = seg
        bv.limit_method = 'ANGLE'
        bv.angle_limit = 0.5
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=bv.name)
    return ob


def cube(name, sx, sy, sz, x, y, z, mat, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.scale = (sx, sy, sz)
    ob.location = (x, y, z)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(scale=True)
    if mat:
        ob.data.materials.append(mat)
    if bevel > 0:
        bv = ob.modifiers.new('bev', 'BEVEL')
        bv.width = bevel
        bv.segments = 2
        bpy.ops.object.modifier_apply(modifier=bv.name)
    return ob


def cyl(name, r, h, x, y, z, mat, segs=24, axis='Z'):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=r, depth=h)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    # 默认沿 Z；若是柱朝面板前方（-Y）需要转 90°
    if axis == '-Y':
        ob.rotation_euler = (1.5708, 0, 0)
    ob.location = (x, y, z)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(rotation=True)
    if mat:
        ob.data.materials.append(mat)
    return ob


def plane(name, w, h, x, y, z, mat, uvbox=(0.0, 0.0, 1.0, 1.0)):
    me = bpy.data.meshes.new(name)
    verts = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    faces = [(0, 1, 2, 3)]
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = (x, y, z)
    u0, v0, u1, v1 = uvbox
    uvl = ob.data.uv_layers.new(name='UVMap')
    # 平面顶点顺序：左下、右下、右上、左上 → UV 与照片方向一致；
    # uvbox 用来只取照片里"表盘那一块"，避免把照片上印的柱、底台一起贴上去
    coords = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for i, loop in enumerate(ob.data.loops):
        uvl.data[i].uv = coords[loop.vertex_index]
    if mat:
        ob.data.materials.append(mat)
    return ob


# ────────────────────────────────────────────────────────────
# 电流表 / 电压表：楔形斜背壳 + 前面板（整幅实拍图）+ 底台 + 三个柱
# 依据 ammeter_c.png 130×152 / voltmeter_c.png 130×133
# ────────────────────────────────────────────────────────────
def build_meter(kind):
    if kind == 'voltmeter':
        W, H, PNG = 1.30, 1.33, os.path.join(FIG, 'voltmeter_c.png')
        posts = [(-0.34, 0.42), (0.0, 0.42), (0.35, 0.42)]
    else:
        W, H, PNG = 1.30, 1.52, os.path.join(FIG, 'ammeter_c.png')
        posts = [(-0.34, 0.42), (0.0, 0.42), (0.35, 0.42)]

    D = 0.38
    FRONT = -D / 2.0          # 前缘（glTF 后 = three 的 +Z）
    BACK = D / 2.0
    BACK_H = H * 0.66         # 斜背降到这里
    shell = mat_solid('bakelite', (0.055, 0.06, 0.065), 0.5, 0.05)
    white = mat_solid('panelwhite', (0.86, 0.84, 0.80), 0.72)
    # 底台在图纸上是"深色斜台"（前面低、后面厚，斜面上印着 −/0.6A/3A），不是浅灰紫板
    darkbase = mat_solid('meterbase', (0.085, 0.09, 0.10), 0.55, 0.10)
    brass = mat_solid('brass', (0.72, 0.53, 0.16), 0.35, 0.85)

    # 楔形壳（前全高、后斜降）
    v = [
        (-W / 2, FRONT, 0.0), (W / 2, FRONT, 0.0),
        (W / 2, BACK, 0.0), (-W / 2, BACK, 0.0),
        (-W / 2, FRONT, H), (W / 2, FRONT, H),
        (W / 2, BACK, BACK_H), (-W / 2, BACK, BACK_H),
    ]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    poly('shell', v, f, shell, bevel=0.014, seg=2)

    # 前面板（白塑料薄板）
    cube('panel', W * 0.99, 0.05, H * 0.985, 0, FRONT - 0.022, H / 2.0, white, bevel=0.010)

    # 表盘实拍图：只取照片里的"白表盘"（上方黑壳、下方柱与底台都不能取进来）。
    # glTF 导出后 UV 的 v 会被翻转（导出数据里 y=+顶 对应 v 较小），所以要取
    # 照片的 [0.055, 0.80] 就必须写 (1-0.80, 1-0.055) = (0.2, 0.945)。
    plane('dial', W * 0.985, H * 0.86, 0, FRONT - 0.049, H * 0.56 + 0.02,
          mat_photo('dialphoto', PNG), uvbox=(0.02, 0.20, 0.98, 0.945))

    # 底台：宽出台阶、深色、**前低后高的斜台**（图纸上那圈黑色斜沿就在这里），
    # 三个接线柱坐在斜台后缘（柱由 three 侧 placePosts 摆）。
    yF = FRONT - 0.20
    yB = BACK + 0.03
    bv = [
        (-W / 2 - 0.05, yF, 0.0), (W / 2 + 0.05, yF, 0.0),
        (W / 2 + 0.05, yB, 0.0), (-W / 2 - 0.05, yB, 0.0),
        (-W / 2 - 0.05, yF, 0.022), (W / 2 + 0.05, yF, 0.022),
        (W / 2 + 0.05, yB, 0.085), (-W / 2 - 0.05, yB, 0.085),
    ]
    bf = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    poly('base', bv, bf, darkbase, bevel=0.010, seg=2)

    # 接线柱不在这里建：柱必须与 2D 的 terminals 像素坐标一一对应（热区也用它），
    # 统一由 three 侧的 placePosts 摆，模型只负责形体。

    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False,
                              export_image_format='AUTO', export_apply=True)


def build_battery():
    """电池组：俯视长方形（1.50×0.90）、平视近正方形（1.32 高）。
    实拍图 175×180 的顶部约 14% 是顶面，其余 86% 是正面，+/− 在正面顶部。"""
    W, H, D = 1.50, 1.32, 0.90
    PNG = os.path.join(FIG, 'battery_c.png')
    blue = mat_solid('batteryblue', (0.069, 0.176, 0.384), 0.55, 0.03)
    light = mat_solid('batterycap', (0.46, 0.53, 0.64), 0.58)

    cube('shell', W, D, H, 0, 0, H / 2.0, blue, bevel=0.05)
    # 正面贴图：只裁上下（顶部 14% 是顶面 + 白圆环柱，底部 7% 是桌面白边）。
    # 宽度必须取满（0.02..0.98）：照片里电池主体几乎占满画幅，收窄会把右下角的 "+"
    # 号一起裁掉，看上去 −/+ 只剩半截。
    # 方向实测：glTF 导出后 UV 的 v 与照片上下相反，取照片 [0.17, 0.93] 要写 (0.07, 0.83)。
    plane('frontphoto', W * 0.99, H * 0.985, 0, -D / 2.0 - 0.002, H / 2.0,
          mat_photo('batteryfront', PNG), uvbox=(0.02, 0.07, 0.98, 0.83))
    # 顶盖：浅蓝台面（柱由 three 侧的 placePosts 摆，位置与 2D terminals 一致）
    cube('cap', W * 0.99, D * 0.99, 0.025, 0, 0, H - 0.012, light, bevel=0.008)


def revolve(name, prof, segs, mat=None):
    """把 (半径, 高度) 剖面绕 Z 轴旋转成回转体 —— 灯泡玻壳这种"上圆下收颈"的
    形体，用立方体/球体拼永远差点意思，只能靠剖面回转。"""
    verts = []
    faces = []
    n = len(prof)
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ca, sa = math.cos(a), math.sin(a)
        for (r, z) in prof:
            verts.append((r * ca, r * sa, z))
    for i in range(segs):
        j = (i + 1) % segs
        for k in range(n - 1):
            a0 = i * n + k
            b0 = i * n + k + 1
            c0 = j * n + k + 1
            d0 = j * n + k
            faces.append((a0, b0, c0, d0))
    return poly(name, verts, faces, mat)


def build_bulb():
    """小灯泡：浅灰塑料底板 + 黑胶木矮灯座 + 金属螺纹灯口 + A 型玻璃泡。
    尺寸按 bulb_c.png 176×83（1px = 1cm）：总高 0.83，泡径 0.55。
    灯丝与引线仍由 three 侧画（发光强度要随电流实时变，放进 GLB 就没法调）。"""
    base_m = mat_solid('bulbbase', (0.80, 0.82, 0.85), 0.62)
    bakelite = mat_solid('bulbsocket', (0.075, 0.085, 0.10), 0.62, 0.03)
    steel = mat_solid('bulbsteel', (0.55, 0.57, 0.60), 0.34, 0.85)
    glass = mat_solid('bulbglass', (0.92, 0.95, 0.98), 0.08)
    glass.blend_method = 'BLEND'

    W, D = 1.76, 0.70
    # 底板加厚：图纸上前缘能看到明显的一条板边（0.045 太薄，看着像纸片）
    cube('base', W * 0.96, D, 0.075, 0, 0, 0.0375, base_m, bevel=0.016)
    # 黑胶木灯座：图纸是"矮而粗"的圆台（座径 0.45、座高 0.245），细高就成了瓷柱
    revolve('socket', [(0.200, 0.075), (0.225, 0.090), (0.225, 0.300), (0.208, 0.320),
                       (0.185, 0.325)], 32, bakelite)
    # 金属承口 + 4 圈螺纹（实物灯口就是这种连续螺纹）
    revolve('cup', [(0.142, 0.325), (0.148, 0.340), (0.148, 0.440), (0.128, 0.450)], 32, steel)
    for k in range(4):
        z = 0.345 + k * 0.026
        revolve('thread%d' % k, [(0.142, z), (0.150, z + 0.006), (0.150, z + 0.015),
                                 (0.142, z + 0.021)], 32, steel)
    # 灯口内芯（玻璃颈从这里插进去）
    revolve('core', [(0.104, 0.450), (0.104, 0.520)], 24, steel)
    # A 型玻璃泡：泡径按图纸放到 0.61（原 0.548 偏小），顶到总高 0.83
    revolve('globe', [
        (0.135, 0.320), (0.140, 0.345), (0.165, 0.375), (0.215, 0.420),
        (0.262, 0.470), (0.292, 0.520), (0.305, 0.575), (0.300, 0.630),
        (0.282, 0.690), (0.250, 0.745), (0.205, 0.790), (0.145, 0.815),
        (0.070, 0.828), (0.008, 0.830),
    ], 40, glass)


def main():
    reset()
    if G == 'ammeter' or G == 'voltmeter':
        build_meter(G)
    elif G == 'battery':
        build_battery()
    elif G == 'bulb':
        build_bulb()
    else:
        raise SystemExit('unknown type: ' + G)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False,
                              export_image_format='AUTO', export_apply=True)
    print('WROTE %s size=%s' % (OUT, os.path.getsize(OUT) if os.path.exists(OUT) else -1))


main()
