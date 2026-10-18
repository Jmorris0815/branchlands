#!/usr/bin/env bash
# Branchlands asset pipeline on the DGX Spark: Hunyuan3D 2.1 (image -> textured glTF) + FLUX.1-schnell (concept images).
# Disk + network only; nothing here touches GPU memory until gen.py runs.
set -x
mkdir -p ~/branchlands-3d && cd ~/branchlands-3d
python3 -m venv venv && . venv/bin/activate
pip install -q --upgrade pip wheel setuptools
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130 || pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
python -c "import torch; print('torch', torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
[ -d Hunyuan3D-2.1 ] || git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git
cd Hunyuan3D-2.1
grep -vE "^(torch|torchvision|torchaudio)" requirements.txt > req.txt && pip install -r req.txt
pip install -U "huggingface_hub[cli]" diffusers transformers accelerate sentencepiece protobuf trimesh pillow rembg onnxruntime
# texture pipeline needs these two compiled extensions (nvcc is at /usr/local/cuda-13.0)
(cd hy3dpaint/custom_rasterizer && pip install -e . --no-build-isolation) || echo "custom_rasterizer build failed"
(cd hy3dpaint/DifferentiableRenderer && bash compile_mesh_painter.sh) || echo "mesh painter build failed"
nice -n 15 hf download tencent/Hunyuan3D-2.1 --local-dir ~/branchlands-3d/weights/Hunyuan3D-2.1
nice -n 15 hf download black-forest-labs/FLUX.1-schnell --local-dir ~/branchlands-3d/weights/FLUX.1-schnell --exclude "flux1-schnell.safetensors" "ae.safetensors"
du -sh ~/branchlands-3d/weights
echo SETUP_DONE
