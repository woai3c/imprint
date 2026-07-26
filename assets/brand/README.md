# Imprint Brand Assets

Official names:

- Chinese: **印记**
- English: **Imprint**
- English wordmark styling: lowercase **imprint**

## Canonical palette

- Ink: `#1D2531`
- Vermilion: `#D83425`
- Paper: `#FAF7F2`
- Reverse ink: `#FAF7F2`

These values are sampled from the selected `02-ink-first.png` concept. They intentionally replace the earlier theoretical
prompt values so production output matches the image that was approved.

## Files

- `imprint-mark.svg`: standalone mark for light and neutral surfaces
- `imprint-mark-reverse.svg`: mark for dark surfaces
- `imprint-app-icon.svg`: paper-tile application icon master
- `imprint-lockup-en.svg`: English horizontal lockup
- `imprint-lockup-zh.svg`: Chinese horizontal lockup
- `imprint-lockup-bilingual.svg`: bilingual stacked lockup
- `imprint-lockup-bilingual-on-paper.png`: repository and documentation preview

The SVG mark geometry is the production source. Lockup SVGs retain text elements so the wording stays editable; convert
the text to outlines before sending the files to an external print vendor.

## Usage

- Use the mark alone inside application icons. Do not put “印记” or “imprint” inside the icon.
- Use the Chinese lockup in Chinese-only brand contexts and the English lockup in English-only contexts.
- Use the bilingual lockup in repositories, presentations, press material, and mixed-language distribution.
- Keep clear space around the mark equal to at least the width of one internal white gap.
- Do not recolor vermilion to match an active theme.
- In dark themes, use the reverse mark or let the in-app mark inherit the foreground color.

Desktop packages consume the generated files under `assets/icons/`.
