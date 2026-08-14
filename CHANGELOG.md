# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Release notes are generated from Conventional Commits by `pnpm release`.

## [0.0.3] - 2026-08-14

### Added

- support cancelling active analysis (bcb6c37)
- improve DESIGN.md extraction and evidence (01e72d6)
- align design analysis with Google DESIGN.md (4cac6c1)
- complete accuracy and performance plan (analyzer) (16ec38c)
- streamline design intelligence pipeline (analyzer) (0b06d7b)
- add AI master switch and polish validation-scenario typography (renderer) (47a7550)
- quantify validation results in the design DNA status (renderer) (e43d3c0)
- strengthen design system extraction (analyzer) (e090e97)
- restore extracted theme workflows (themes) (0476bbc)
- improve validation theme switching (9cb9c76)
- add design language profiles to all built-in themes (7f89cc7)
- persist preferences to settings.json, add tech stack detection and reasoning controls (af10f91)
- two-pass design intelligence, quality benchmark, and curated model catalog (e5cfa8a)
- add CLI vision attachments, three-way model choice, and plain-language UX (81ffbe4)
- add deterministic design evidence and AI design DNA pipeline (6dc786b)
- improve history previews and AI examples (5a47845)
- detect agent CLIs asynchronously with caching and refresh (settings) (15e0106)
- add persistent runtime logging (main) (2baf79e)
- add token-grounded design principles and localize design docs (export) (ac2c783)
- add history batch delete, screenshot lightbox navigation, and live example previews (cd10b3f)
- reopen full analysis results from history (renderer) (7860d5f)

### Changed

- migrate generated copy to i18n (5737e39)
- remove duplicate and unused code (bdc1f85)
- remove extracted theme library (6c956de)
- reduce analysis and history overhead (66aba36)
- consolidate shared utilities (af24341)
- score component detection evidence (analyzer) (58636be)
- simplify shared application infrastructure (12860be)
- bake backdrop filters into assets and drop backdrop blur (themes) (2298e5e)
- consolidate theme art direction, state, and analyze page structure (renderer) (24e2bfe)
- add semantic state tokens and shared UI primitives (renderer) (be6d02b)

### Fixed

- use template icon for macOS menu bar (e3d403e)
- improve design evidence reliability (f61f374)
- refine design evidence localization (183d0ee)
- portal confirmation dialogs (renderer) (b70f1b3)
- improve analysis accuracy and history metadata (db5ea03)
- improve evidence accuracy and AI settings (analyzer) (2b65742)
- restore macOS aurora glass (renderer) (150b827)
- improve evidence accuracy and diagnostics (analyzer) (de6f53f)
- close accuracy and performance gaps (analyzer) (afb5aae)
- improve page analysis reliability (analyzer) (c5f01cc)
- keep validation theme swatches circular (renderer) (0547df6)
- refine Windows aurora glass theme (renderer) (2137073)
- simplify AI result controls (renderer) (398ce35)
- smooth history and platform theme rendering (app) (1e02b37)
- restore aurora glass and add performance diagnostics (app) (a5e1214)
- drop live chrome blur on cyberpunk/nordic and restore aurora backdrop (themes) (1dae960)
- demote under-supported claims instead of dropping them (design-intelligence) (42df76b)
- dedupe normalized colors and validate rename roles (analyzer) (ce04f57)
- reserve completion budget for thinking models (ai) (a675811)
- harden design evidence and AI examples (analyzer) (8ed15bf)
- keep macOS analysis silent (analyzer) (6f50d29)
- set macOS dock icon in development (c056e14)
- use ai to generate example component (30a750d)
- text mode cannot analyze url (ac0ecb4)
- ai parse error with ai agent cli (58a6142)
- persist language, color mode, and theme across restarts (3a88c93)
- downgrade interaction claims instead of rejecting, pass tech stack to example prompt (cd1d2c3)
- deduplicate design.md content, improve example prompt fidelity, and polish UI copy (2b62a37)
- auto-detect language, kimi intl url, ai failure reason, kimi temperature (b0708a7)
- cjk heading font clarity, ui polish, proxy support, and kimi coding plan (858672c)
- validate semantic color renames (ai) (b265458)
- preserve extracted usage frequencies (analyzer) (20fec6e)
- run enhancement through agent cli (ai) (eff9367)
- clarify active AI engine selection (settings) (cf9f5d4)
- apply theme-card hover instantly under art themes (themes) (68fd7c4)
- tidy settings buttons, profile header overlap, and card paint isolation (renderer) (f4e8b4f)
- remove theme-switch jank and strengthen card hover borders (themes) (5b1c631)
- align interaction-state colors with the primary hue family (themes) (2c31146)
- improve authenticated analysis and screenshot preview (ad53ffe)

## [0.0.2] - 2026-07-28

### Added

- switch Windows build from Squirrel installer to portable zip (f0f24f6)
- add example HTML components to website analysis DESIGN.md export (e38c8b3)
- enhance builtin theme export and remove validation page CSS export (da14c93)
- enhance website analysis workflow (ba1a744)

### Fixed

- improve analysis page UX (f8505d1)
- improve color token matching in example component generation (9306291)

## [0.0.1] - 2026-07-27

### Added

- refine themes and automate desktop releases (8ec575c)
- refine desktop design experience (a05622f)
- refine product design system and branding (d5a5948)
- visual redesign of analysis results page (bed1e0a)
- dark mode extraction and export support (a13ebcb)
- templates layout, manual save, multi-page analysis (190987f)
- implement all stub functions in settings/IPC (fbe0f3a)
- add SCSS and PDF export, remove design plan (4b3c91a)
- implement Phase 4 - advanced capabilities (6b01d9c)
- implement Phase 3 - CLI and core module separation (9c1f83d)
- complete Phase 2 - semantic enhancement (a18ebe8)
- implement Phase 2 core features (947d80b)
- add light/dark mode toggle and move controls to header (c36fc08)
- rewrite as Electron desktop app (Imprint) (7e46127)
- add cross-agent skill installation (b8ca4ff)
- add copy-design skill MVP (ea734a9)

### Changed

- remove duplicated analyzer/export code (11f16f7)

### Fixed

- build error (c29de5d)
- build error (e4fd218)
- theme dots, chinese theme, state persistence, screenshots (1bb9bfc)
- devtools, screenshot display, and result persistence (402beae)
- i18n progress text, devtools, cursor-pointer (0327693)
