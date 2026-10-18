# 3D models

Real models for the realistic renderer. Each file is a small textured glTF (`.glb`) named after an entry in the
`ASSETS` table at the top of `js/render3d.js`, which decides how big it is in tiles and which way it faces.

| file | used for |
|---|---|
| `bolt.glb` | the robot (tinted with the paint colour from the Style shop) |
| `house.glb` | the 🏠 goal |
| `tree.glb`, `rock.glb`, `crate.glb`, `pillar.glb`, `crystal.glb`, `ice.glb` | walls, one per zone |
| `crab.glb` | crabs |
| `apple.glb`, `gem.glb`, `key.glb`, `lens.glb` | the four pick-ups |
| `villager.glb`, `villager2.glb`, `stall.glb` | Harbor Town folk and market stalls |

If a file is missing the game draws its built-in shape instead, so you can add or remove models freely.

How they are made: `tools/assets3d/` holds the pipeline that runs on the family's DGX Spark. A text prompt becomes a
concept picture (FLUX.1-schnell), the picture becomes a textured mesh (Hunyuan3D 2.1), and the mesh is shrunk to a
few thousand faces so phones stay smooth. Want a new look for something? Change its prompt in `spark_gen.py`,
re-run it for that one name, and copy the new `.glb` here.
