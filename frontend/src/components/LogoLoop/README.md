# LogoLoop (React Bits, JavaScript + Tailwind)

Installed from the official React Bits registry:

```sh
npx shadcn@latest add @react-bits/LogoLoop-JS-TW --path src/components/LogoLoop --yes
```

Registry: https://reactbits.dev/r/LogoLoop-JS-TW.json

`LogoLoop.jsx` is the installed upstream implementation, with no local animation edits. The registry lists no additional dependencies. `LogoLoop.d.ts` supplies types for this TypeScript project without modifying the JavaScript component.

The social proof section uses two instances:

- Technology names/logos: `direction="left"`, `speed={55}`.
- One testimonial row: `direction="right"`, `speed={34}`, custom `renderItem`.

Both use the component's existing hover pause, drag, edge fading, visibility handling and reduced-motion support. The shared pause control configures `speed={0}`; it does not introduce another animation engine.

`social-proof.css` provides the card layout and a static, readable layout for reduced motion. The logos describe the actual technology stack, not customers or endorsements; testimonials are explicitly labeled illustrative.

Technology SVGs were downloaded from Simple Icons via https://cdn.simpleicons.org/ and are served locally. Avatar PNG originals are the three files supplied by the user; small WebP derivatives are used for display.
