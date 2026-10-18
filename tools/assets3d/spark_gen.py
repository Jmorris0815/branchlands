"""Branchlands 3D asset pipeline, run on the family's DGX Spark (ARM Linux, GB10).

concept image (FLUX.1-schnell)  ->  textured mesh (Hunyuan3D 2.1 shape + paint)  ->  small .glb for the game

Setup once with spark_setup.sh. Then, inside ~/branchlands-3d with the venv active:

    python spark_gen.py                 # every asset in ASSETS that has no .glb yet
    python spark_gen.py bolt house      # just these
    python spark_gen.py --images-only   # concept images only (cheap, ~25 GB of GPU memory for FLUX)

Outputs land in ~/branchlands-3d/out/<name>.png and <name>.glb. Copy the .glb files into the repo at assets/models/
(scp rcs-spark:branchlands-3d/out/*.glb assets/models/). The renderer (js/render3d.js, ASSETS table) sizes and
orients them; a missing file simply means the built-in shape is drawn instead.

Memory: FLUX needs ~25 GB, Hunyuan3D shape ~10 GB, paint ~15 GB. The script loads one stage at a time and frees it.
"""
import os, sys, gc, time
HOME = os.path.expanduser("~/branchlands-3d"); OUT = os.path.join(HOME, "out"); os.makedirs(OUT, exist_ok=True)
STYLE = (", single object centered, 3/4 front view, realistic PBR materials, soft studio lighting, "
         "plain pure white background, no shadow on ground, game asset concept")
ASSETS = {
 "bolt":     "a small friendly boxy robot rover on two black rubber tank treads, light grey matte body panels with dark charcoal joints, a dark glass visor with two round glowing cyan eyes, a thin antenna with a red ball on top, two little arms, a yellow light strip on the front",
 "house":    "a tiny cozy seaside cottage, cream plaster walls, terracotta tiled roof, wooden door, round porthole window, small stone chimney, a lantern by the door",
 "tree":     "a small round apple tree with a thick textured brown trunk, dense green leafy canopy and bright red apples, no ground",
 "crab":     "a small red beach crab with two big claws and cute white eyes on stalks, textured shell",
 "apple":    "a shiny red apple with a short stem and one green leaf",
 "gem":      "a glowing light blue faceted crystal gem, elongated octahedron shape",
 "key":      "an ornate antique golden key with a round bow and simple teeth",
 "lens":     "a golden magnifying glass with a glass lens and short handle",
 "villager": "a friendly harbor town fisherman villager character, full body standing, knit sweater, bushy beard, flat cap, rubber boots, stylized realistic",
 "villager2":"a friendly harbor town shopkeeper woman character, full body standing, apron over a striped shirt, headscarf, holding a basket, stylized realistic",
 "stall":    "a small wooden market stall with a red and white striped canvas awning and a counter with wooden crates of fruit",
 "rock":     "a cluster of three rounded sandy beige coastal boulders with lichen, no ground",
 "crate":    "a sturdy weathered wooden shipping crate with iron corner brackets",
 "pillar":   "a weathered square grey stone pillar block with moss on top, cobblestone texture",
 "crystal":  "a cluster of tall glowing teal translucent crystals growing from a dark rock base",
 "ice":      "a translucent block of blue glacier ice with a frozen pale core and frost",
}
# small things and repeated walls get fewer faces so phones stay smooth
FACES = {"bolt": 20000, "house": 20000, "villager": 15000, "villager2": 15000, "stall": 15000, "tree": 8000, "crab": 8000}

args = [a for a in sys.argv[1:] if not a.startswith("--")]
names = args or [n for n in ASSETS if not os.path.exists(os.path.join(OUT, n + ".glb"))]
images_only = "--images-only" in sys.argv

import torch
def free():
    gc.collect(); torch.cuda.empty_cache()

# ---- stage 1: concept images ----
todo = [n for n in names if not os.path.exists(os.path.join(OUT, n + ".png"))]
if todo:
    from diffusers import FluxPipeline
    pipe = FluxPipeline.from_pretrained(os.path.join(HOME, "weights/FLUX.1-schnell"), torch_dtype=torch.bfloat16).to("cuda")
    for n in todo:
        t0 = time.time()
        img = pipe(ASSETS[n] + STYLE, num_inference_steps=4, guidance_scale=0.0, width=1024, height=1024, generator=torch.Generator("cuda").manual_seed(7)).images[0]
        img.save(os.path.join(OUT, n + ".png")); print(n, "image", round(time.time() - t0, 1), "s", flush=True)
    del pipe; free()
if images_only: sys.exit(0)

# ---- stage 2: shape ----
sys.path.insert(0, os.path.join(HOME, "Hunyuan3D-2.1/hy3dshape")); sys.path.insert(0, os.path.join(HOME, "Hunyuan3D-2.1/hy3dpaint"))
from PIL import Image
from hy3dshape.rembg import BackgroundRemover
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
W = os.path.join(HOME, "weights/Hunyuan3D-2.1")
shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(W)
rembg = BackgroundRemover()
todo = [n for n in names if not os.path.exists(os.path.join(OUT, n + "_shape.glb"))]
for n in todo:
    t0 = time.time()
    img = Image.open(os.path.join(OUT, n + ".png")).convert("RGBA"); img = rembg(img.convert("RGB"))
    mesh = shape(image=img, num_inference_steps=30, octree_resolution=320, num_chunks=20000, generator=torch.manual_seed(1234))[0]
    mesh.export(os.path.join(OUT, n + "_shape.glb")); print(n, "shape", round(time.time() - t0, 1), "s", flush=True)
del shape; free()

# ---- stage 3: PBR texture + decimation ----
from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
conf = Hunyuan3DPaintConfig(max_num_view=6, resolution=512)
conf.realesrgan_ckpt_path = os.path.join(HOME, "Hunyuan3D-2.1/hy3dpaint/ckpt/RealESRGAN_x4plus.pth")
conf.multiview_cfg_path = os.path.join(HOME, "Hunyuan3D-2.1/hy3dpaint/cfgs/hunyuan-paint-pbr.yaml")
conf.custom_pipeline = os.path.join(HOME, "Hunyuan3D-2.1/hy3dpaint/hunyuanpaintpbr")
paint = Hunyuan3DPaintPipeline(conf)
import trimesh
for n in names:
    if os.path.exists(os.path.join(OUT, n + ".glb")): continue
    t0 = time.time()
    src = os.path.join(OUT, n + "_shape.glb")
    # decimate before painting so the texture is baked onto the mesh the game will actually draw
    m = trimesh.load(src, force="mesh"); target = FACES.get(n, 6000)
    if len(m.faces) > target:
        try: m = m.simplify_quadric_decimation(face_count=target); m.export(src)
        except Exception as e: print(n, "decimation skipped:", e)
    paint(mesh_path=src, image_path=os.path.join(OUT, n + ".png"), output_mesh_path=os.path.join(OUT, n + ".glb"))
    print(n, "textured", round(time.time() - t0, 1), "s", os.path.getsize(os.path.join(OUT, n + ".glb")) // 1024, "KB", flush=True)
print("done")
