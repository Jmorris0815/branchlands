"""Make Hunyuan3D 2.1's texture pipeline work without Blender.

The only thing it uses Blender (bpy) for is turning its OBJ + MTL + texture files into one .glb.
bpy has no build for ARM Linux (the DGX Spark), so this swaps in a trimesh converter that keeps the
PBR maps: base colour, roughness + metallic packed the glTF way, and the normal map.
Run once after cloning: python patch_no_blender.py ~/branchlands-3d/Hunyuan3D-2.1
"""
import sys, os
repo = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/branchlands-3d/Hunyuan3D-2.1")
p = os.path.join(repo, "hy3dpaint/DifferentiableRenderer/mesh_utils.py")
s = open(p, encoding="utf-8").read()
if "_convert_obj_to_glb_trimesh" in s:
    print("already patched"); sys.exit(0)

s = s.replace("import bpy\n", "try:\n    import bpy\nexcept ImportError:  # no Blender on this machine (ARM Linux): a trimesh converter is used instead\n    bpy = None\n", 1)

FALLBACK = '''
def _convert_obj_to_glb_trimesh(obj_path: str, glb_path: str) -> bool:
    """OBJ (+ MTL + jpg maps written by save_obj_mesh) -> .glb with PBR textures, no Blender needed."""
    import trimesh
    from PIL import Image
    base = os.path.splitext(obj_path)[0]
    m = trimesh.load(obj_path, force="mesh", process=False)
    uv = m.visual.uv if hasattr(m.visual, "uv") else None
    def img(suffix):
        for ext in (".jpg", ".png"):
            f = base + suffix + ext
            if os.path.exists(f):
                im = Image.open(f)
                if max(im.size) > 1024: im = im.resize((1024, 1024))  # phones: 1k maps are plenty at tile size
                return im
        return None
    albedo, metal, rough, normal = img(""), img("_metallic"), img("_roughness"), img("_normal")
    mr = None
    if rough is not None or metal is not None:
        ref = (rough or metal).convert("L"); size = ref.size
        r = (rough.convert("L").resize(size) if rough is not None else Image.new("L", size, 255))
        mt = (metal.convert("L").resize(size) if metal is not None else Image.new("L", size, 0))
        mr = Image.merge("RGB", (Image.new("L", size, 255), r, mt))  # glTF: G = roughness, B = metallic
    mat = trimesh.visual.material.PBRMaterial(
        baseColorTexture=albedo.convert("RGB") if albedo is not None else None,
        metallicRoughnessTexture=mr,
        normalTexture=normal.convert("RGB") if normal is not None else None,
        metallicFactor=1.0 if mr is not None else 0.0, roughnessFactor=1.0,
    )
    m.visual = trimesh.visual.TextureVisuals(uv=uv, material=mat)
    m.export(glb_path)
    return os.path.exists(glb_path)

'''
anchor = "def convert_obj_to_glb("
assert anchor in s
s = s.replace(anchor, FALLBACK + anchor, 1)
s = s.replace('''    """Convert OBJ file to GLB format using Blender."""
    try:
        _setup_blender_scene()''', '''    """Convert OBJ file to GLB format using Blender (or trimesh when Blender is not installed)."""
    if bpy is None:
        try: return _convert_obj_to_glb_trimesh(obj_path, glb_path)
        except Exception as e:
            print("glb conversion failed:", e); return False
    try:
        _setup_blender_scene()''', 1)
open(p, "w", encoding="utf-8").write(s)
print("patched", p)
