# OVERTONE

A local-first spectral sound studio. The objective is a polished public portfolio project with real, inspectable audio processing. Keep communication plain and claims grounded.

- TypeScript, React, Vite; static hosting, no secrets or backend.
- Audio stays in the browser. Never introduce upload endpoints or analytics.
- DSP must preserve channel count and exact sample length. Test reconstruction and measured frequency attenuation.
- Synthetic demos must be labeled as generated examples, not field recordings.
- Support pointer, touch, keyboard, small screens, and reduced motion.
- Read docs/design-system.md before UI edits; docs/product-brief.md defines scope.
- Run npm test, npm run build, and meaningful browser verification before release.
- Each agent owns separate files. Root owns App, styles, config, integration and publication.
