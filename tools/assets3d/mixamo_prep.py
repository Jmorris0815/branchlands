# Turn a townsperson .glb into a zip Mixamo's auto-rigger accepts: an OBJ 180 units (cm) tall, feet at 0, with the
# vertices welded across texture seams (Mixamo fails with "Unknown error while generating motion" on a mesh split
# into hundreds of pieces), stray specks removed, and the texture beside it.
# Usage: python tools/assets3d/mixamo_prep.py villager villager5   -> villager.zip, villager5.zip in the current folder
# A hat the auto-rigger chokes on (the sailor's cap): CUT=166 SUF=_nocap python ... villager3 drops everything above
# 166 cm into villager3_nocap.zip; rig that, then mixamo_convert.html?n=villager3&from=villager3_nocap&cut=166 puts the cap back.
# In Mixamo: Upload Character, place the markers, keep the Standard skeleton (No Fingers failed for us), Next.
import trimesh, zipfile, numpy as np, sys, os
MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "models")
CUT = float(os.environ.get("CUT", "1e9"))
for n in sys.argv[1:]:
    m = trimesh.load(os.path.join(MODELS, n + ".glb")).to_geometry()
    s = 180.0 / (m.bounds[1][1] - m.bounds[0][1])
    V = m.vertices * s
    V -= [(V[:,0].min()+V[:,0].max())/2, V[:,1].min(), (V[:,2].min()+V[:,2].max())/2]
    UV = m.visual.uv
    key = np.round(V, 3)
    uniq, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    F = m.faces
    # drop specks
    g = trimesh.Trimesh(uniq, inv[F], process=False)
    lab = trimesh.graph.connected_component_labels(g.face_adjacency, node_count=len(F))
    keep = np.bincount(lab)[lab] >= 50
    # duplicate faces, zero-area faces and faces on edges shared by more than two faces confuse the auto-rigger
    WF = inv[F]; key = np.sort(WF, axis=1)
    _, first = np.unique(key, axis=0, return_index=True); dup = np.ones(len(F), bool); dup[first] = False
    area = np.linalg.norm(np.cross(uniq[WF[:, 1]] - uniq[WF[:, 0]], uniq[WF[:, 2]] - uniq[WF[:, 0]]), axis=1)
    E = np.sort(np.concatenate([WF[:, [0, 1]], WF[:, [1, 2]], WF[:, [2, 0]]]), axis=1)
    ue, ei, cnt = np.unique(E, axis=0, return_inverse=True, return_counts=True); bad = (cnt[ei.ravel()] > 2).reshape(3, -1).any(0)
    keep &= ~dup & (area > 1e-8) & ~bad & (uniq[WF][:, :, 1].max(1) < CUT)
    lines = [f"mtllib {n}.mtl", "usemtl mat0"]
    lines += [f"v {a:.4f} {b:.4f} {c:.4f}" for a,b,c in uniq]
    lines += [f"vt {u:.5f} {v:.5f}" for u,v in UV]
    for f in F[keep]:
        lines.append("f " + " ".join(f"{inv[i]+1}/{i+1}" for i in f))
    img = m.visual.material.baseColorTexture if hasattr(m.visual.material, "baseColorTexture") else m.visual.material.image
    import io; buf = io.BytesIO(); img.convert("RGB").save(buf, "PNG")
    mtl = "newmtl mat0\nKd 1 1 1\nmap_Kd texture.png\n"
    with zipfile.ZipFile(n + os.environ.get("SUF", "") + ".zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(n + ".obj", "\n".join(lines) + "\n"); z.writestr(n + ".mtl", mtl); z.writestr("texture.png", buf.getvalue())
    print(n, "welded verts", len(uniq), "faces", int(keep.sum()), "watertight", trimesh.Trimesh(uniq, inv[F][keep]).is_watertight)
