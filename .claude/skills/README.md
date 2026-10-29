# Design and motion skills

Agent skills for building and reviewing the demo web apps. Claude Code loads
them from this folder; other harnesses can read the `SKILL.md` files directly.

Source: [emilkowalski/skills](https://github.com/emilkowalski/skills) at commit
`a81dbca07f2217b7103e510c0f13f8d5b017afc9` (2026-10-28), MIT licensed
([license](LICENSE-emilkowalski-skills)). Copied unmodified. `animate-expo` and
`write-swift` are left out because the demos use neither React Native nor Swift.

| Skill | Use it to |
| --- | --- |
| `emil-design-eng` | Apply the overall UI polish and motion philosophy |
| `animate` | Build a new animation |
| `review-animations` | Review motion code strictly (invoke explicitly) |
| `improve-animations` | Audit all motion and plan fixes |
| `find-animation-opportunities` | Find places that should animate |
| `remove-animations` | Remove motion that does not earn its place |
| `animation-performance` | Fix dropped frames |
| `animation-vocabulary` | Name a motion effect |
| `apple-design` | Gesture, spring and material design for the web |
| `mobile-native` | Make the apps feel native on phones |
| `break-ui` | Stress-test components with worst-case data |
| `pick-ui-library` | Choose a library (invoke explicitly) |
| `prototype` | Compare UI variants (invoke explicitly) |
| `ask-sonner` | Work with the Sonner toast library |

To update, copy the `skills/` folders from a newer upstream commit and change
the commit above.
