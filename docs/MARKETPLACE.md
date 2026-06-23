# Miro Marketplace — submission guide

This app is **Marketplace-eligible**: its entry point is the stable app-icon click
(`board.ui.on('icon:click', …)`), with no experimental or custom-action APIs
(those are private-app only and disqualify a listing).

## 1. Configure the app (Miro dev dashboard)

1. **App URL** → `https://image-transforms.vercel.app/`
2. **Scopes** → `boards:read`, `boards:write`
3. **Web SDK** enabled, and **upload an app icon** (`docs/brand/app-icon.svg`, or a PNG export).
   ⚠️ **Required for the app to work:** the `icon:click` flow only fires when the app
   has a toolbar icon. Without one, the app never appears in the board toolbar.
4. **Test on a board:** select an image → click the **Image Transforms** toolbar icon →
   the editor modal opens → warp → **Apply** places a copy beside the original.

## 2. Listing copy (draft — edit to taste)

- **Name:** Image Transforms
- **Tagline:** Perspective-warp images into 3D planes, right on your board.
- **Short description:**
  Warp any board image into a perspective plane — drag the four corners freely or
  apply one-click presets (floor, walls, isometric, recede, stack). Non-destructive
  and instant; the warped copy lands beside your original.
- **Long description:**
  Image Transforms turns flat board images into perspective planes without leaving
  Miro. Select an image, open the editor, and drag its corners to any quad — or tap a
  preset to drop it onto a floor, wall, isometric, or receding plane. Warps are
  non-destructive (a new copy is created; your original is untouched) and run instantly
  on the GPU via a WebGL homography. The **Stack** preset plus **Match first layer**
  normalises multiple same-extent layers to one shared box, so you can lay map or design
  layers onto a single co-planar 3D plane. Fully client-side — your images never leave
  your browser.
- **Suggested categories:** Visualization, Design & UX, Diagramming
- **Privacy policy URL:** `https://github.com/R-Repo/image-transforms/blob/main/PRIVACY.md`
  (or host `PRIVACY.md` as a page on the Vercel site for a cleaner URL)
- **Support contact:** GitHub issues — `https://github.com/R-Repo/image-transforms/issues`

## 3. Assets

- **App icon:** `docs/brand/app-icon.svg` — export to PNG at the square sizes Miro's
  submission form requests.
- **Screenshots (3–5):** capture the standalone demo and a board showing warped /
  stacked layers (use your existing examples). Miro typically asks for landscape images.
- **Optional:** a short demo GIF/video.

## 4. Submit

Dashboard → your app → Marketplace / "Share your app" → complete the form with the copy
and assets above → submit for review. Miro reviews submissions (typically a few business
days) and may request changes.

## References

- [Publish a Miro app](https://developers.miro.com/docs/publish-a-miro-app)
- [Miro Marketplace](https://developers.miro.com/docs/miro-marketplace)
