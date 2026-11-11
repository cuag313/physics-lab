"""Blender headless 探针：验证本机 Blender 能脚本化建模并导出 GLB。
用法：
  D:\\Blender\\blender.exe -b -P tools/blender/probe.py -- <out.glb>
"""
import sys
import os
import bpy

argv = sys.argv
out = argv[argv.index('--') + 1] if '--' in argv else 'D:/Temp/probe.glb'

# 清空默认场景
bpy.ops.wm.read_factory_settings(use_empty=True)

# 一个楔形块（模拟电表斜背外壳的形状）
mesh = bpy.data.meshes.new('wedge')
verts = [
    (-0.65, 0.0, 0.18), (0.65, 0.0, 0.18),
    (-0.65, 0.0, -0.18), (0.65, 0.0, -0.18),
    (-0.65, 1.5, 0.18), (0.65, 1.5, 0.18),
    (-0.65, 1.5, -0.38), (0.65, 1.5, -0.38),
]
faces = [
    (0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4),
    (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6),
]
mesh.from_pydata(verts, [], faces)
mesh.update()
obj = bpy.data.objects.new('wedge', mesh)
bpy.context.collection.objects.link(obj)

mat = bpy.data.materials.new('bakelite')
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.08, 0.08, 0.09, 1)
    bsdf.inputs['Roughness'].default_value = 0.55
obj.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False)
print('WROTE ' + out + ' size=' + str(os.path.getsize(out) if os.path.exists(out) else -1))
