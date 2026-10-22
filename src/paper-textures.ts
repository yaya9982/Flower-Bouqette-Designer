import { Scene, Texture } from '@babylonjs/core';
import type { PaperId } from './bouquet';

/**
 * A paper's two maps, made by tools/prepare_paper.py from photographed paper on Sketchfab: its fibre (greyscale, so any
 * paper colour can tint it) and its folds (a normal map). Both repeat, mirrored, so the paper never shows a seam.
 */
export interface PaperMaps {
  base: Texture;
  normal: Texture;
}

/** Where the paper looks come from. The designer loads files; the tests hand in plain pixels. */
export interface PaperTextureSource {
  get(kind: PaperId): PaperMaps | null;
}

const FILES: Record<Exclude<PaperId, 'none'>, { base: string; normal: string }> = {
  kraft: { base: 'kraft.jpg', normal: 'kraft-normal.jpg' },
  matte: { base: 'matte.jpg', normal: 'matte-normal.jpg' },
  tissue: { base: 'tissue.jpg', normal: 'tissue-normal.jpg' },
};

/** Loads each paper's maps once, when it is first used. A map that is still loading shows the plain colour until it lands. */
export class PaperTextures implements PaperTextureSource {
  private readonly maps = new Map<string, PaperMaps>();

  constructor(private readonly scene: Scene) {}

  get(kind: PaperId): PaperMaps | null {
    if (kind === 'none') return null;
    let maps = this.maps.get(kind);
    if (!maps) {
      const load = (file: string) => {
        const texture = new Texture(`${import.meta.env.BASE_URL}textures/paper/${file}`, this.scene);
        texture.wrapU = texture.wrapV = Texture.MIRROR_ADDRESSMODE;
        texture.anisotropicFilteringLevel = 4;
        return texture;
      };
      maps = { base: load(FILES[kind].base), normal: load(FILES[kind].normal) };
      this.maps.set(kind, maps);
    }
    return maps;
  }
}
