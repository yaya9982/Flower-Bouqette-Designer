# 3D flower model research for the bouquet designer

Retrieved: 2026-10-11. Prices, licences and availability change, so re-check on the model page before buying or downloading.

## Summary

- Good free options exist for **rose, carnation, tulip, lily, sunflower, daisy and (one) orchid**. They come from different artists, so they will not look like one matched family; expect to tune lighting and textures.
- **No acceptable free model found** for: **peony** (only a simple stylised one, a flower-cluster and a bloom-only scan), **hydrangea**, **ranunculus**, **gerbera** (only a cartoon-style potted one and a huge scan).
- The best free rose and carnation come from the same shop-style artist ("GardenBee"): the same flower is already published in 5-6 colours, which solves colour variety without any texture editing.
- Paid side: only one paid source could actually be read, **Blendkit (formerly BlenderKit)**. It is a subscription ($9.90 per month "Full Plan", $29 per month "Business Plan" for larger companies, as shown on its plans page), not a per-model price. Fab, CGTrader, TurboSquid, Free3D and the Sketchfab store blocked automated requests, so **no per-model prices were retrieved**. A matching paid set cost is therefore "not confirmed"; for Blendkit it would be roughly one or two months of subscription.
- **Best free path:** GardenBee rose + carnation (colour variants ready), plus the pink tulip by kapeluskin, the lily by laanita, the sunflower by Cosmic_dust and the daisy by Anežka Hájková. All are credit-required (CC-BY).
- **Best paid path:** Blendkit "cut flower on a stem" roses by James Middleton (red, pink, white, orange; only roses of that kind found). Other paid types need hand-checking on Fab / CGTrader / TurboSquid (links in "Not retrieved").

Important caveat for both paths: nearly every "royalty-free" licence allows commercial use but forbids re-selling the model file. Putting a model inside a public website means visitors can technically download it. Free CC-BY models explicitly allow sharing with credit; Blendkit's royalty-free licence wording is less clear for this case (see "Notes for integration").

## What a usable model needs

1. **Licence allows commercial use.** Terms used below:
   - **CC0**: no rights reserved; no credit needed.
   - **CC-BY 4.0 (CC Attribution)**: free to use commercially, but the author must be credited (name, title, link, licence) and you must say if you changed it. All free picks here are this.
   - **CC-BY-SA (share-alike)**: same, but anything built from it must carry the same licence; listed only if flagged. **CC-BY-ND**: no changes allowed; excluded. NC (non-commercial) models are excluded.
   - **Royalty-free (Blendkit)**: commercial use allowed, no credit needed, but you may not re-sell the model file itself.
2. **Format:** GLB/glTF directly, or FBX/OBJ/BLEND that can be converted to GLB (Blender does this for free).
3. **Size:** about 20,000 triangles per flower or fewer (triangles are the tiny flat shapes a model is built from; 40 flowers x 20,000 = 800,000, which is the practical limit for a browser). Larger models are listed but flagged.
4. **Recolouring:** petals should be a separate material or texture from stem and leaves so one flower can be offered in many colours. Where I could not tell, it says "unknown". Number of materials is a hint: 1 material usually means everything shares one texture, so petals cannot be tinted on their own.
5. **One flower (or easily separable), realistic look,** not a potted plant, tree, vase scene or cartoon.
6. **Style noted** (photoscan, hand-modelled realistic, stylised) so a matching set can be picked. Styles are judged from model thumbnails and descriptions only; I did not open the 3D models.

Notes on how counts are reported: "tris" below is the "faces" number shown by the site. Sketchfab reports triangulated faces. Blendkit reports polygons before subdivision modifiers (a smoothing step); it also publishes a "render" count with smoothing applied, shown as "x / y".

Poly Haven (checked earlier): only wildflowers and nothing for a bouquet flower. Poly Pizza (checked): only low-poly cartoon flowers, so excluded.

All Sketchfab models below show **"Downloadable: yes"** and licence "CC Attribution" (CC-BY 4.0) in the Sketchfab detail data. Downloading from Sketchfab requires a free login (the download call returned "unauthorized" without one), so I did not test the glTF download itself. Sketchfab normally offers glTF/GLB for downloadable models, plus the author's source format. Treat "glTF" as "expected, not tested".

## Free models

Sketchfab URL pattern: the links go to the model page. Rank 1 is best.

### Rose

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 | Single flower / rose (red, pink, blue, yellow, orange, green: 6 separate listings, same model) | GardenBee (pocketpastel456) | CC-BY 4.0, credit required | glTF expected (Sketchfab) | 14,860 | hand-modelled realistic, whole stem with leaves | already published in 6 colours; 2 materials (petals probably separate from stem/leaves, not confirmed) | https://sketchfab.com/3d-models/single-flower-rose-pink-339bd12179614121a66fd38400a22148 (pink); red: https://sketchfab.com/3d-models/single-flower-rose-red-45742e6e3ffa449996f70bc87556db93 ; blue: https://sketchfab.com/3d-models/single-flower-rose-blue-f802fa9c582b47f2bf1a2e123d688bf8 ; yellow: https://sketchfab.com/3d-models/single-flower-rose-yellow-a79bb30f852d4d3d98a76d99b571e4ec ; orange: https://sketchfab.com/3d-models/single-flower-rose-orange-d831be1106424d19b53d44f06e485c16 ; green: https://sketchfab.com/3d-models/single-flower-rose-green-64761ed2dd0044ac8dbc6bba2d25d2b3 |
| 2 | Rose 3D | Julialovehearts | CC-BY 4.0, credit required | glTF expected | 19,760 | realistic, nice open bloom, stem and 3 leaves | 1 material, 3 textures: petals not separately recolourable (unknown, likely one texture) | https://sketchfab.com/3d-models/rose-3d-4aad2c8cd1564bc49fddb00df80d5776 |
| 3 | Red Rose | smcafee-3d | CC-BY 4.0, credit required | glTF expected | 3,508 | realistic, bud-like single rose; maps 1024 px (Substance Painter) | 2 materials, 6 textures, probably flower vs stem; not confirmed | https://sketchfab.com/3d-models/red-rose-22d655ade2d24ababeb509f69b4a9cc7 |
| 4 | Red Rose | Asia Matusik | CC-BY 4.0, credit required | glTF expected | 11,652 | realistic, ruffled bloom, long bare stem (no leaves visible) | 2 materials, "only colour textures" per the author: likely easy to tint | https://sketchfab.com/3d-models/red-rose-2371d8b532664ec7a6e6536091f9e093 |
| - | Red rose flower | Soran Mohammadi (Blendkit) | royalty-free (no credit), free plan | .blend only (convert to GLB) | 1,053 (16,925 with smoothing) | realistic | 5 separate materials | https://www.blenderkit.com/asset-gallery-detail/f357a769-16a9-4ece-a9fe-17d322d6e8ee/ |
| flagged | Rose (photoscan) | alban | CC-BY 4.0 | glTF expected | 59,171 | photoscan with leaves; needs heavy reduction | 1 material: no | https://sketchfab.com/3d-models/rose-4cc57c2bf76b43b49395e06f84b34538 |

Why this order: #1 is the only option that already comes in several colours and is under 15k triangles with stem and leaves. #2 looks best but has one texture. #3 is the lightest. #4 has no leaves. Soran's rose cannot be downloaded as glTF directly and the thumbnail shows a stylised, spiky bloom.

### Tulip

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 | a pink tulip. | kapeluskin (kapelushkin_3d) | CC-BY 4.0, credit required | glTF expected | 20,444 | realistic ("HD"), stem and two leaves | 1 material, 5 textures: unknown | https://sketchfab.com/3d-models/a-pink-tulip-81b1e9be6b3543e99f6706182189da4d |
| 2 | Tulip | TIS (tistvan) | CC-BY 4.0, credit required | glTF expected | 30,956 | realistic, closed bud, stem and one leaf; only the outer 3 petals modelled (author note) | 3 materials: petals likely separate; not confirmed. Needs reduction | https://sketchfab.com/3d-models/tulip-172fa50b49754408b5030ee9b23b2523 |
| 3 | tulip (yellow + red, two stems in one file) | Joseph_Wardle | CC-BY 4.0, credit required | glTF expected | 2,648 | semi-realistic, slim; two tulips (separate them in Blender) | 3 materials, 4 textures | https://sketchfab.com/3d-models/tulip-c0901260385a4f268cf3211e1f3b664b |
| 4 | The lonely tulip | Antrea | CC-BY 4.0, credit required | glTF expected | 26,992 including a glass vase; author says the tulip alone is about 4,000 quads, and offers it unsubdivided by request | realistic | tulip is 1 material, 4 textures: not separately recolourable | https://sketchfab.com/3d-models/the-lonely-tulip-7cddf395b63b471bba9442de9313113c |

### Peony - no acceptable free model

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 (weak) | Peony 1 | AlysiaC | CC-BY 4.0, credit required | glTF expected | 6,928 | simple, stylised-looking single pink bloom on stem; not a convincing peony | 1 material, 4 textures | https://sketchfab.com/3d-models/peony-1-6bee135aefb64aaab797609d69380b14 |
| 2 (weak) | Moranhwa (peony) | Korea Heritage Service (KHS_Asset) | CC-BY 4.0; the author asks commercial users to name "Korea Heritage Service" as the source | glTF expected | 8,164 | realistic cluster of several blooms on one plant; not a single flower | 2 materials, 7 textures | https://sketchfab.com/3d-models/moranhwapeony-77eee05730d049979c86ee46e1bb15a4 |
| flagged | Peony Scan | jeanniehuang | CC-BY 4.0 | glTF expected | 58,900 | photoscan of a bloom only, no stem; needs heavy reduction | 1 material: no | https://sketchfab.com/3d-models/peony-scan-362706d5511c4250bc419c6f5ef4f2ae |

### Lily

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 | Lily | laanita | CC-BY 4.0, credit required | glTF expected | 5,816 | realistic white lily with stem and dark leaves ("basic lily model") | 3 materials: likely petals / stem / leaves, not confirmed | https://sketchfab.com/3d-models/lily-f904c01714f8433f9c37795d44a73346 |
| 2 | lily flower | quyrommap | CC-BY 4.0, credit required | glTF expected | 2,466 | realistic-ish pink lily spike with several buds on a leafy stalk; stylised leaves | 4 materials, 5 textures | https://sketchfab.com/3d-models/lily-flower-b58f68ed6cbe4e4d8070185a888a8dc6 |
| 3 | Lilium | TahirNilin | CC-BY 4.0, credit required | glTF expected | 17,160 | stylised-realistic bloom with short stem; no leaves | 1 material | https://sketchfab.com/3d-models/lilium-cc518ec481154c51b1effbc67dd685ff |
| 4 | lily UVW | AnnaWachulec | CC-BY 4.0, credit required | glTF expected | 17,022 | realistic bloom, almost no stem | 1 material | https://sketchfab.com/3d-models/lily-uvw-2eef50c0a1fb44b88158e6a03c15bd5c |

### Sunflower

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 | Sunflower | Cosmic_dust | CC-BY 4.0, credit required | glTF expected | 9,865 (file holds 3 sunflowers at different heights; separate in Blender) | realistic, stem and leaves | 2 materials, 5 textures: unknown | https://sketchfab.com/3d-models/sunflower-d9925ea428a441deb34de06434b4bf1d |
| 2 | Sunflower | zvanstone | CC-BY 4.0, credit required | glTF expected | 1,008 | hand-modelled (Maya), clean realistic bloom, stem and large leaves; very light | 1 material, 5 textures | https://sketchfab.com/3d-models/sunflower-3a9514b8df044abe809432201b8f1c6e |
| 3 | Flowers (Rose and Sunflower) | nick2046 | CC-BY 4.0, credit required | glTF expected | 8,242 for the whole file: 3 coloured roses + 1 sunflower, all with stems and leaves | hand-modelled realistic; separable | 2 materials, 4 textures | https://sketchfab.com/3d-models/flowersrose-and-sunflower-c9def2748a3643458b7115572743ad62 |

(Sunflowers are not normally recoloured; one yellow variety is probably enough.)

### Carnation

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 | Single flower / Carnation (red, pink, magenta, white, orange, yellow-green: 6 listings, same model) | GardenBee (pocketpastel456) | CC-BY 4.0, credit required | glTF expected | 10,905 each; the thumbnail shows a small glass bottle that must be deleted | hand-modelled realistic; same style as the GardenBee rose | already published in 6 colours; 4 materials (includes the bottle) | red: https://sketchfab.com/3d-models/single-flower-carnation-red-1f051fc353e746869844ca45412c850b ; pink: https://sketchfab.com/3d-models/single-flower-carnation-pink-0ce93a5db10d493f8d439b110426165a ; magenta: https://sketchfab.com/3d-models/single-flower-carnation-magenta-d187108ded554afb886b40f01d059703 ; white: https://sketchfab.com/3d-models/single-flower-carnation-white-0dca5c197241466599d50620beba31c1 ; orange: https://sketchfab.com/3d-models/single-flower-carnation-orange-1c6bcdc8d4d6429086543120862e3919 ; yellow-green: https://sketchfab.com/3d-models/single-flowercarnation-yellow-green-b036c6dffa60494c9b060c765ff8ab46 |
| 2 (weak) | Carnation | sv.stats | CC-BY 4.0, credit required | glTF expected | 26,000 | photoscan, bloom only, no stem; rough | 1 material: no | https://sketchfab.com/3d-models/carnation-5940c0dabc0448d8bc003280c62ebaa0 |

### Gerbera / daisy

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 (daisy) | Daisy | Anežka Hájková (anezka) | CC-BY 4.0, credit required | glTF expected | 9,736 | realistic (Blender + Substance Painter, 4K textures per tags) with stem and leaves; a pink-tinged white daisy | 1 material, 3 textures | https://sketchfab.com/3d-models/daisy-11c17847f9804d559974b7c97cd63a6f |
| 2 (daisy) | Daisy Flower | Rukh3D | CC-BY 4.0, credit required | glTF expected | 28,864 | realistic white daisy on a stem with two leaves; needs reduction | 1 material | https://sketchfab.com/3d-models/daisy-flower-5c5f55c10f434d65bdc118a951ec137a |
| gerbera: none | Gerbera (Compositae, 16,060, potted, cartoon-like) and Gerbera Daisies (trbaker, 58,785 photoscan of a whole plant) were found; neither is acceptable. | | | | | | | https://sketchfab.com/3d-models/gerbera-a77bdac41aa045cf83ad1690488a9776 and https://sketchfab.com/3d-models/gerbera-daisies-b4f61f6c4e764e18aa641da251624e96 |

### Hydrangea - no acceptable free model

Found only bush or garden-shrub models (for example "Hydrangea" 1,240 tris by hui.an.michelle.li: https://sketchfab.com/3d-models/hydrangea-d2213888b4974bd8a58a8c82e70a79db , a whole bush) and a stylised pot plant. A hydrangea head would have to be cut out of one of these by hand.

### Ranunculus - no model found

The searches for "ranunculus", "ranunculus asiaticus", "ranunculus flower" and "persian buttercup" returned nothing usable (results were cartoon characters named Buttercup).

### Orchid

| # | Name | Author | Licence / credit | Format | Tris | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| 1 | 3December2020 / Plant orchid flower | tasha.kosaykina | CC-BY 4.0, credit required | glTF expected | 7,732 | realistic spray of lilac orchids on a stem, no pot | 1 material, 5 textures | https://sketchfab.com/3d-models/3december2020-plant-orchid-flower-a30118c4d0b84fcc964e07a3824f7f8d |
| 2 | Orchid | puppet_lee | CC-BY 4.0, credit required | glTF expected | 19,420 | potted white phalaenopsis; the pot must be removed | 7 materials, no textures | https://sketchfab.com/3d-models/orchid-f1091068cc89468f9c7f7490b3247238 |

### Free "flower packs" (checked, rejected)

"flowers_pack_1/2/4" by Daniel.Marquez2 (CC-BY, 7 / 6 flowers with colour variants) and similar are hand-painted cartoon style, so they do not meet the realistic requirement.

### Recommended free set (7 types)

These match best by style (hand-modelled realistic, no scans, mostly 5-20k triangles). They are still by different artists, so plan to match brightness and leaf green in the shop's own lighting.

| Flower | Model | Tris |
|---|---|---|
| Rose | GardenBee rose (pick colours) | 14,860 |
| Carnation | GardenBee carnation (pick colours; delete the bottle) | 10,905 |
| Tulip | kapeluskin "a pink tulip." | 20,444 |
| Lily | laanita "Lily" | 5,816 |
| Sunflower | Cosmic_dust "Sunflower" | 9,865 |
| Daisy (instead of gerbera) | Anežka Hájková "Daisy" | 9,736 |
| Orchid (optional alternate) | tasha.kosaykina orchid | 7,732 |

Peony, hydrangea, ranunculus and gerbera cannot be offered from free models.

Credit lines the shop would have to display (CC-BY 4.0 wording; add "modified" if you reduced polygons or changed colours, as CC-BY requires you to say so). Licence link for every line: https://creativecommons.org/licenses/by/4.0/

- "Single flower / rose" and "Single flower / Carnation" by GardenBee, https://sketchfab.com/pocketpastel456 , licensed under CC BY 4.0.
- "a pink tulip." by kapeluskin, https://sketchfab.com/3d-models/a-pink-tulip-81b1e9be6b3543e99f6706182189da4d , licensed under CC BY 4.0.
- "Lily" by laanita, https://sketchfab.com/3d-models/lily-f904c01714f8433f9c37795d44a73346 , licensed under CC BY 4.0.
- "Sunflower" by Cosmic_dust, https://sketchfab.com/3d-models/sunflower-d9925ea428a441deb34de06434b4bf1d , licensed under CC BY 4.0.
- "Daisy" by Anežka Hájková, https://sketchfab.com/3d-models/daisy-11c17847f9804d559974b7c97cd63a6f , licensed under CC BY 4.0.
- "3December2020 / Plant orchid flower" by tasha.kosaykina, https://sketchfab.com/3d-models/3december2020-plant-orchid-flower-a30118c4d0b84fcc964e07a3824f7f8d , licensed under CC BY 4.0 (only if the orchid is used).

A single "Credits" page on the shop's site listing these lines is the usual way to meet the requirement.

## Paid models (for later)

**What I could and could not read.** Only **Blendkit** (https://www.blenderkit.com, renamed from BlenderKit) answered. It is a subscription library, not per-model pricing. Fab, CGTrader, TurboSquid, Free3D and the Sketchfab store blocked automated requests (see "Not retrieved"). So there are no per-model prices below.

Blendkit plans (from its plans page, retrieved 2026-10-11): Free Plan $0 (free models only); **Full Plan $9.90 per month**; **Business Plan $29 per month** (for companies with more than 5 employees or more than $100k yearly revenue; the Full Plan is described for smaller companies). A 50% student discount and a yearly option are mentioned; the yearly price was not confirmed separately. Licence ("royalty free"): commercial use, no credit needed, but you may not re-sell the 3D model itself, even modified. Paid ("Full Plan") models cannot be downloaded without logging in. Page: https://www.blenderkit.com/docs/licenses/ and https://www.blenderkit.com/plans/pricing/

### Multi-flower packs

None found that fit the brief. The nearest things are ready-made bouquets or vases (not usable as single stems): "Purple Peony Flower Arrangement" (397,766 polygons), "Artificial Peony" bouquet in a vase (41,795), "Decorative Rose Bouquet" (61,911), "Pink Roses in Vase" (8,656 / 138,496). Cartoon-style packs ("flowers_pack" by Daniel.Marquez2) were rejected as not realistic.

### Individual paid models (all Blendkit, royalty-free, Full Plan, no credit needed)

Price column: included in the $9.90 per month Full Plan (or $29 Business); per-model price: none.

| Type | # | Name | Author | Format | Tris (base / with smoothing) | Style | Recolouring | URL |
|---|---|---|---|---|---|---|---|---|
| Rose | 1 | Red Rose, also Pink Rose, White Rose, Sunset Rose (4 listings of one model, tagged "cutting, cut, stem") | James Middleton | .blend + glTF | 1,635 / 26,160 | realistic cut rose on stem with bud and leaves | materials: petal material separate from "Rose.Stem" and "Rose.Leaf" (confirmed from material names) | red: https://www.blenderkit.com/asset-gallery-detail/4a898865-aafb-4b1a-a8ae-bdfb282b2264/ ; pink: https://www.blenderkit.com/asset-gallery-detail/b8d2bbc5-2c52-4d60-b45e-b6d3a0a11a9c/ ; white: https://www.blenderkit.com/asset-gallery-detail/111a5db7-18f8-46fb-b5db-d2032f7551d3/ ; orange (Sunset Rose): https://www.blenderkit.com/asset-gallery-detail/06bbbb56-6c6c-4ae9-9041-24a0c2f40a95/ |
| Rose | 2 | Rose | webtion studios | .blend + glTF | 1,934 / 7,736 | realistic, bloom with bud and stem piece (short, 13 cm) | 1 material: no | https://www.blenderkit.com/asset-gallery-detail/aefcbef8-0b40-49b8-a66c-ffaf7734265d/ |
| Tulip | 1 | Tulip Flower | Hue Ghass | .blend + glTF | 2,514 / 952,384 (very high with smoothing; check what the glTF contains) | realistic, hand-sculpted, "colour is adjustable" per author | separate materials: Stem, Seed, Petals | https://www.blenderkit.com/asset-gallery-detail/0f105999-ce5f-42c2-9998-ad97ded0a71a/ |
| Sunflower | 1 | Sunflower Plant / Bent Sunflower Plant | Haseeb Ahmed | .blend + glTF | 1,346 and 1,156 | realistic full plant (about 1 m), thin | 1 material | https://www.blenderkit.com/asset-gallery-detail/8fd9fd73-8f8f-42bd-bdd0-5cc7ed4eb4de/ ; https://www.blenderkit.com/asset-gallery-detail/70159859-d880-44f5-ab74-1baaf0e51446/ |
| Sunflower | 2 | Sunflower Flower | kid kaito | .blend + glTF | 48,311 / 193,244 | realistic single bloom, short stem; heavy, needs reduction | 3-4 materials, unknown | https://www.blenderkit.com/asset-gallery-detail/916ff138-a61c-4b97-afda-73a11c01e0ff/ |
| Carnation | 1 | Carnations | Gabriel Pastor | .blend only (convert) | 1,456 / 21,712 | painterly look, a plant with several carnations (separable) | separate materials: Petal, Leave, Stem | https://www.blenderkit.com/asset-gallery-detail/c6814c39-c6e4-46cc-9699-6b3d0c76cfdf/ |
| Orchid | 1 | Realistic Phalaenopsis Orchid Flower | Ilya Esmailzadeh | .blend + glTF | 14,235 / 227,760 | realistic, sits in a white vase (remove) | 6 materials | https://www.blenderkit.com/asset-gallery-detail/117153a2-e801-4665-966c-e45d7624fca1/ |
| Orchid | 2 | Orchid Tropical Flower Large | Amanpreet Bajwa | .blend + glTF | 6,744 | realistic plant with roots, not a cut stem | 1 material | https://www.blenderkit.com/asset-gallery-detail/2106381c-f99e-4c5b-be3d-6663a84e2252/ |
| Hydrangea | 1 (weak) | Hydrangea | Gabriel Pastor | .blend only | 2,546 / 3,584 | painterly bush, not a cut stem | separate: flower centre, petal, leaves | https://www.blenderkit.com/asset-gallery-detail/9d9b62bf-c2a9-48d8-81a4-41369cdf5e7a/ |
| Lily | 1 (weak) | White lily | Almir Jusufovic | .blend only | 5,041 / 188,576 | realistic vase of lilies, not single; "non-manifold" tags | separate: petal, stem, leaf, pollen | https://www.blenderkit.com/asset-gallery-detail/86e1fd16-4613-45d8-bd30-3a63b1160cb2/ |

All four James Middleton rose listings share the same mesh (1,635 polygons) and differ in colour, so buying one gives you the model and the other three are only colour variants.

Peony, ranunculus, gerbera: **no acceptable paid model found on Blendkit** (peony is only arrangements in vases; gerbera is two untextured low-poly meshes by ali alipour, https://www.blenderkit.com/asset-gallery-detail/b995f9e8-4699-4e2b-a605-1be6506f2c67/ , which fail the "no UV, no material" test).

### Recommended paid options

- **Blendkit subscription** is the cheapest way to get roses (four colours of one cut-rose model, correct material split, glTF supplied) plus a realistic tulip and sunflower. One month of Full Plan ($9.90) is enough to download the handful of models, but the subscription terms and the "do not re-sell the model" wording need a check with Blendkit support before putting them in a public website.
- **One pack versus individual models:** no multi-flower pack was found, so "one pack" is not an option from the retrievable data. If Fab or CGTrader (blocked) have a realistic cut-flower pack, it would beat buying six unrelated single models, because style and texture quality would match. Open the search links under "Not retrieved" and look for: one seller, 6+ flowers, GLB/FBX/OBJ included, "commercial / standard / professional" licence that allows use inside a web app. A matching paid set price is not confirmed.

## Not retrieved

| Site | What happened | Search URL to open by hand |
|---|---|---|
| Sketchfab store (paid models) | page returned an empty "please wait" response; the search API has no store filter, and price fields came back empty | https://sketchfab.com/store/3d-models?q=cut+rose and tulip, peony, lily, carnation, sunflower |
| CGTrader | empty "please wait" response (bot check), also for free-models page | https://www.cgtrader.com/3d-models?keywords=rose+flower and https://www.cgtrader.com/free-3d-models?keywords=rose |
| TurboSquid | HTTP 403 | https://www.turbosquid.com/Search/3D-Models/rose%20flower |
| Fab (includes Quixel Megascans) | HTTP 403 (bot check); one earlier response worked once but was not saved, and later calls were blocked, so nothing was recorded | https://www.fab.com/search?q=flower%20bouquet and https://www.fab.com/search?q=cut%20rose |
| Free3D | HTTP 403 | https://free3d.com/3d-models/rose |
| Quixel Megascans | now sold through Fab; the old site is only a JavaScript page. Its plants are mostly wild plants anyway | https://www.fab.com/search?q=megascans%20flower |
| GardenBee website (more flowers than the rose/carnation on Sketchfab) | domain did not resolve | https://garden-bee.net/ ; also https://sketchfab.com/pocketpastel456 |
| Blendkit (full plan prices per model) | no per-model price exists; only plan prices | https://www.blenderkit.com/plans/pricing/ |
| Sketchfab actual glTF download test | needs a free login | n/a |
| Visual check of 3D models | I looked only at thumbnails, not the 3D models | open each URL in the Sketchfab / Blendkit viewer |

## Notes for integration

Polygon reduction (about 20k limit; do it in Blender with a Decimate step, or in glTF-Transform / gltfpack):
- Needs it: TIS tulip (30,956), Antrea tulip (26,992 incl. vase), Rukh3D daisy (28,864), kid kaito sunflower (48,311), alban rose scan (59,171), Peony Scan (58,900), sv.stats carnation scan (26,000), Hue Ghass tulip and others whose "with smoothing" count is very high.
- Close to the limit: kapeluskin tulip (20,444), Rose 3D (19,760), puppet_lee orchid (19,420).
- Everything else is under 15k. At 10k per flower, 40 flowers is 400k triangles, fine for a desktop browser.
- Blendkit counts are polygons before smoothing; once the smoothing modifier is applied the real count can be much higher (the "with smoothing" figures above). Check the exported glTF.

Format conversion:
- Sketchfab models: glTF expected from the download button (login needed, not tested).
- Blendkit: free Soran rose, Gabriel Pastor carnation/hydrangea and Almir Jusufovic lily are .blend only; open in Blender and export GLB. The others list glTF.

Recolouring (petals separate from stem/leaves):
- Confirmed separate: Blendkit James Middleton rose, Hue Ghass tulip, Gabriel Pastor carnation, plus lily (Almir).
- Likely separate but not confirmed: GardenBee rose and carnation (2 and 4 materials), smcafee-3d rose, laanita lily.
- One material, so petals cannot be tinted on their own without editing the texture or splitting the mesh: Rose 3D (Julialovehearts), Anežka daisy, kapeluskin tulip, Rukh3D daisy, TahirNilin lily, scans.
- GardenBee already ships rose and carnation in several colours, which avoids recolouring.

Other things that affect fitting:
- Remove the bottle from the GardenBee carnation; split the multi-flower files (Cosmic_dust sunflower, Joseph_Wardle tulips, nick2046 roses/sunflower).
- All free Sketchfab models are CC-BY: add a credits page (see lines above) and write "modified" if edited. Also, do not strip author names from the files you ship.
- Blendkit "royalty-free": no credit, but the licence says you may not re-sell the model file. Showing it inside a customer-facing web app might count as distribution; check with Blendkit before relying on it.
- Visual consistency: the picks come from different artists, so match the shop's lighting, the green of the leaves, and the texture resolution (GardenBee models are lower resolution than the Blendkit ones).
- Whether stems curve like a hand-tied bouquet is unknown; most models are straight single stems and may need slight bending in the designer.
