# PageShot icon

Generated with the built-in Imagegen tool. Source: `logo-original.png`; preview: `logo.png`; extension sizes: `public/icons/`. The source PNG has an alpha channel, preserved by the size exports.

Prompt:

> Use case: logo-brand. Asset type: Chrome extension toolbar icon for PageShot. Primary request: a camera emoji inspired compact camera with a crisp crosshair centered inside the circular lens. Front-facing camera, dark charcoal slightly rounded camera body, small top shutter button and flash, blue glass lens with white crosshair. Style: polished familiar 3D emoji, very simple bold silhouette readable at 16 pixels. Large centered single camera filling square canvas with small transparent margin. Genuinely transparent background, no plate, no backdrop, no text, no watermark, no extra objects. Do not use sleeping characters or mascots.

Run `sh scripts/generate-icons.sh` on macOS to recreate PNG exports with ImageMagick (`magick`). Exports fit the visible camera to the square canvas, ignoring alpha below 5% when measuring its bounds. The original image stays intact. Explicit toolbar icon sizes let Chrome use the matching Retina asset.
