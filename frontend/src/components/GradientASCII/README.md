# GradientASCII — React Bits

Based on upstream JS-CSS source retrieved on 2026-10-20:
https://reactbits.dev/r/GradientASCII-JS-CSS.json

Docs: https://reactbits.dev/backgrounds/gradient-ascii

Registry dependencies and npm dependencies: none. Reinstalled with:
npx shadcn@latest add @react-bits/GradientASCII-JS-CSS --yes --overwrite
components.json configures the CLI without replacing the app theme.
GradientASCII.d.ts is a local TypeScript bridge; CSS remains upstream.
Local JSX compatibility fix: cleanup deletes owned GPU resources, but does NOT
call WEBGL_lose_context. React StrictMode replays effects on the same canvas in
Vite dev; forcing context loss made the second initialization render white.
Keep this fix when updating from the registry. StrictMode remains enabled.

HeroBackground uses the requested palette, horizon, characters, cellSize 18 and
density 0.8. DPR uses the upstream default (device DPR, capped at 2).
The effect mounts immediately alongside the headline, without waiting for its
entrance animation or an idle callback.
Canvas fills 100% of the first viewport, with no mask, crop, filter or overlay.
Upstream pauses its render loop outside the viewport or in a hidden tab.
Reduced-motion preference uses the CSS background instead, including live changes.
The centered hero has no vault illustration or 3D scene; ASCII is its only canvas.
Unsupported WebGL keeps the CSS background. No backend/API behavior is changed.

Passive-hero optimizations (2026-10-21):
- HeroBackground explicitly uses mouseInteraction=false and clickEffect="none".
- No window pointer listeners are installed when those interactions are disabled.
- A compile-time POINTER_INPUT shader variant removes unused pointer uniforms
  and trail/click loops, while retaining the existing visual formulas and passes.
- Empty input buffers are no longer updated each frame.
- An unchanged ResizeObserver notification does not reset the drawing buffer or
  issue another startup draw; repeated StrictMode effects still clean up safely.
- The glyph atlas is not rebuilt/uploaded after fonts.load when its font is
  already available. Late-loading fonts still rebuild their atlas when ready.
- Interaction props remain available for other uses of this reusable component;
  changing them reinitializes the appropriate shader/listener variant.

Palette, horizon shape, density, glyph size, speed, intro duration, glow, flicker,
grain, and the original DPR cap are unchanged. Hero text entrance is unchanged.
