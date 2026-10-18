"""Branchlands 3D asset pipeline, run on the family's DGX Spark (ARM Linux, GB10).

concept image (SDXL-Turbo, already cached on the Spark)  ->  textured mesh (Hunyuan3D 2.1 shape + paint)  ->  small .glb

Setup once with spark_setup.sh. Then, inside ~/branchlands-3d with the venv active:

    python spark_gen.py                 # every asset in ASSETS that has no .glb yet
    python spark_gen.py bolt house      # just these
    python spark_gen.py --images-only   # concept images only
    python spark_gen.py --redo-image bolt   # throw away bolt's image and model and make new ones

Outputs land in ~/branchlands-3d/out/<name>.png and <name>.glb. Copy the .glb files into the repo at assets/models/
(scp rcs-spark:branchlands-3d/out/*.glb assets/models/). The renderer (js/render3d.js, ASSETS table) sizes and
orients them; a missing file simply means the built-in shape is drawn instead.

Memory: SDXL-Turbo ~7 GB, Hunyuan3D shape ~10 GB, paint ~15 GB. One stage is loaded at a time and freed after.
(FLUX.1-schnell would give nicer concept art but its weights now need a Hugging Face account to download.)
"""
import os, sys, gc, time
HOME = os.path.expanduser("~/branchlands-3d"); OUT = os.path.join(HOME, "out"); os.makedirs(OUT, exist_ok=True)
STYLE = (", single object centered, 3/4 front view, realistic PBR materials, soft studio lighting, "
         "plain pure white background, no shadow on ground, game asset concept, product photo, sharp focus")
ASSETS = {
 "bolt":     "a small friendly boxy robot rover on two black rubber tank treads, light grey matte body panels with dark charcoal joints, a dark glass visor with two round glowing cyan eyes, a thin antenna with a red ball on top, two little arms, a yellow light strip on the front",
 "house":    "a tiny cozy seaside cottage, cream plaster walls, terracotta tiled roof, wooden door, round porthole window, small stone chimney, a lantern by the door",
 "tree":     "a small round apple tree with a thick textured brown trunk, dense green leafy canopy and bright red apples, no ground",
 "crab":     "a small red beach crab with two big claws and cute white eyes on stalks, textured shell",
 "apple":    "a shiny red apple with a short stem and one green leaf",
 "gem":      "one large blue sapphire gemstone with sharp brilliant-cut facets, a single floating jewel, elongated diamond silhouette, nothing else",
 "key":      "an ornate antique golden key with a round bow and simple teeth",
 "lens":     "one golden magnifying glass with a round glass lens and one short handle, a single object alone",
 "villager": "3D game character model of one bearded fisherman in a knit sweater, flat cap and rubber boots, standing upright in a relaxed pose, full body head to toe, front view, one person only, isolated figure, no props, no boat, no other people",
 "villager2":"one single friendly shopkeeper woman standing alone holding a small basket, apron over a striped shirt, headscarf, full body, stylized realistic character, only one person, no background objects",
 "stall":    "a small wooden market stall with a red and white striped canvas awning and a counter with wooden crates of fruit",
 "rock":     "one cluster of three large rounded sandy beige boulders stacked together, a single isolated rock formation with lichen patches, no ground",
 "crate":    "a sturdy weathered wooden shipping crate with iron corner brackets",
 "pillar":   "a weathered square grey stone pillar block with moss on top, cobblestone texture",
 "crystal":  "a cluster of tall glowing teal translucent crystals growing from a dark rock base",
 "ice":      "a pale light blue frosted ice cube, opaque matte surface with white frost and snow on top, bright and glowing light blue, one cube alone",
}
# small things and repeated walls get fewer faces so phones stay smooth
FACES = {"bolt": 20000, "house": 20000, "villager": 15000, "villager2": 15000, "stall": 15000, "tree": 8000, "crab": 8000}

flags = [a for a in sys.argv[1:] if a.startswith("--")]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
if "--redo-image" in flags:
    for n in args:
        for ext in (".png", "_shape.glb", ".glb"):
            p = os.path.join(OUT, n + ext); os.path.exists(p) and os.remove(p)
names = args or [n for n in ASSETS if not os.path.exists(os.path.join(OUT, n + ".glb"))]
images_only = "--images-only" in flags
P = lambda n, ext: os.path.join(OUT, n + ext)

import torch
def free():
    gc.collect(); torch.cuda.empty_cache()

# ---- stage 1: concept images ----
todo = [n for n in names if not os.path.exists(P(n, ".png"))]
if todo:
    from diffusers import AutoPipelineForText2Image
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16", local_files_only=True).to("cuda")
    for n in todo:
        t0 = time.time()
        img = pipe(ASSETS[n] + STYLE, num_inference_steps=4, guidance_scale=0.0, width=768, height=768, generator=torch.Generator("cuda").manual_seed(7)).images[0]
        img.save(P(n, ".png")); print(n, "image", round(time.time() - t0, 1), "s", flush=True)
    del pipe; free()
if images_only: sys.exit(0)

# ---- stage 2: shape ----
sys.path.insert(0, os.path.join(HOME, "Hunyuan3D-2.1/hy3dshape")); sys.path.insert(0, os.path.join(HOME, "Hunyuan3D-2.1/hy3dpaint"))
from PIL import Image
from hy3dshape.rembg import BackgroundRemover
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
W = os.path.join(HOME, "weights/Hunyuan3D-2.1")
todo = [n for n in names if not os.path.exists(P(n, "_shape.glb"))]
if todo:
    shape = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(W)
    rembg = BackgroundRemover()
    for n in todo:
        t0 = time.time()
        img = Image.open(P(n, ".png")).convert("RGB"); img = rembg(img)
        mesh = shape(image=img, num_inference_steps=30, octree_resolution=320, num_chunks=20000, generator=torch.manual_seed(1234))[0]
        mesh.export(P(n, "_shape.glb")); print(n, "shape", round(time.time() - t0, 1), "s", len(mesh.faces), "faces", flush=True)
    del shape; free()

# ---- stage 3: PBR texture, on a decimated mesh ----
from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
import trimesh
todo = [n for n in names if not os.path.exists(P(n, ".glb"))]
if todo:
    os.chdir(os.path.join(HOME, "Hunyuan3D-2.1"))  # the paint pipeline uses paths relative to the repo
    conf = Hunyuan3DPaintConfig(max_num_view=6, resolution=512)
    conf.realesrgan_ckpt_path = "hy3dpaint/ckpt/RealESRGAN_x4plus.pth"
    conf.multiview_cfg_path = "hy3dpaint/cfgs/hunyuan-paint-pbr.yaml"
    conf.custom_pipeline = "hy3dpaint/hunyuanpaintpbr"
    paint = Hunyuan3DPaintPipeline(conf)
    for n in todo:
        t0 = time.time()
        src = P(n, "_shape.glb"); low = P(n, "_low.glb")
        m = trimesh.load(src, force="mesh"); target = FACES.get(n, 6000)
        if len(m.faces) > target:
            try: m = m.simplify_quadric_decimation(face_count=target)
            except Exception as e: print(n, "decimation skipped:", e)
        m.export(low)
        paint(mesh_path=low, image_path=P(n, ".png"), output_mesh_path=P(n, ".obj"))  # the painter writes OBJ + maps, then converts to .glb
        print(n, "textured", round(time.time() - t0, 1), "s", os.path.getsize(P(n, ".glb")) // 1024, "KB", flush=True)
print("done")
