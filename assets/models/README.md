# 3D models

Real models for the realistic renderer. Each file is a small textured glTF (`.glb`) named after an entry in the
`ASSETS` table at the top of `js/render3d.js`, which decides how big it is in tiles and which way it faces.

| file | used for |
|---|---|
| `bolt.glb` | the robot (tinted with the paint colour from the Style shop) |
| `house.glb` | the 🏠 goal |
| `tree.glb`, `rock.glb`, `crate.glb`, `pillar.glb`, `crystal.glb`, `ice.glb` | walls, one per zone |
| `crab.glb` | crabs |
| `apple.glb`, `key.glb`, `lens.glb` | pick-ups (gems keep their glowing built-in shape) |
| `villager.glb` … `villager6.glb`, `stall.glb` | Harbor Town folk (fisherman, shopkeeper, sailor, old woman, blacksmith, girl) and market stalls; `js/hub.js` says who wears which |

If a file is missing the game draws its built-in shape instead, so you can add or remove models freely.

How they are made: `tools/assets3d/` holds the pipeline that runs on the family's DGX Spark. A text prompt becomes a
concept picture (SDXL-Turbo, already on the Spark), the picture becomes a textured mesh (Hunyuan3D 2.1), and the mesh is shrunk to a
few thousand faces so phones stay smooth. Want a new look for something? Change its prompt in `spark_gen.py`,
re-run it for that one name, and copy the new `.glb` here. People are made standing with arms a little out (the `PEOPLE` prompts in `spark_gen.py`); the game animates their legs, arms and head in the shader, and `ARM_DOWN` in `js/render3d.js` tucks each one's arms in. If SDXL-Turbo draws two people, crop the concept picture to one and re-run (that is what happened to the sailor).
