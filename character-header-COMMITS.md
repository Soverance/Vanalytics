# Queued commit — Character header redesign (branch july-2)

`git commit` is blocked from Claude's tools; run this from the repo root. Reviewed clean.

```bash
git add src/Vanalytics.Web/src/components/character/CharacterProfileHeader.tsx
git commit -m "feat: redesign character header (two-column layout, server badge, title line)"
```

Also commit the design docs when convenient:
```bash
git add docs/superpowers/specs/2026-07-11-character-header-redesign-design.md \
        docs/superpowers/plans/2026-07-11-character-header-redesign.md
git commit -m "docs: character header redesign spec + plan"
```
