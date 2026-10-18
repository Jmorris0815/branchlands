"""Shrink the models in assets/models/ for the web: textures re-encoded as JPEG and sized for their job.
Hero models (Bolt, the cottage, townsfolk, stalls) keep 1024 px colour maps; walls, pick-ups and crabs get 512.
Run from the repo root: python tools/assets3d/shrink.py [names...]   (idempotent; originals stay on the Spark)
"""
import sys, os, io, glob
import trimesh
from PIL import Image
HERO = {"bolt", "house", "villager", "villager2", "stall"}
def jpeg(im, size, q):
    im = im.convert("RGB")
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, format="JPEG", quality=q, optimize=True); b.seek(0)
    return Image.open(b)  # .format == "JPEG", so trimesh stores it as-is
names = sys.argv[1:] or [os.path.basename(f)[:-4] for f in glob.glob("assets/models/*.glb")]
for n in names:
    f = f"assets/models/{n}.glb"; before = os.path.getsize(f)
    scene = trimesh.load(f); geoms = list(scene.geometry.values()) if hasattr(scene, "geometry") else [scene]
    for m in geoms:
        mat = getattr(m.visual, "material", None)
        if mat is None or not hasattr(mat, "baseColorTexture"): continue
        big = 1024 if n in HERO else 512
        if mat.baseColorTexture is not None: mat.baseColorTexture = jpeg(mat.baseColorTexture, big, 85)
        if mat.metallicRoughnessTexture is not None: mat.metallicRoughnessTexture = jpeg(mat.metallicRoughnessTexture, 512, 80)
        if getattr(mat, "normalTexture", None) is not None: mat.normalTexture = jpeg(mat.normalTexture, big, 85)
    scene.export(f); print(f"{n:10s} {before/1048576:5.2f} MB -> {os.path.getsize(f)/1048576:5.2f} MB")
