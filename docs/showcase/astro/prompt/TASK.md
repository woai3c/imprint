# Task: Harbor Deploy

Build an original, responsive developer deployment console named **Harbor Deploy** as a static local application.

Use hash routes so these three views can be opened directly:

- `#/overview`
- `#/deployments`
- `#/settings`

## Overview

- Workspace heading, environment selector, and primary deployment action
- Four metric cards: successful builds, median build time, active previews, and failed builds
- A seven-day deployment activity visualization
- A recent deployments list with project, branch, commit, environment, status, duration, and timestamp

## Deployments

- Search input and status/environment filters
- At least eight realistic deployment rows
- Clear success, building, cancelled, and failed states
- Pagination and a compact summary of the current result set

## Settings

- Project identity and default production branch
- Build command, output directory, and runtime version
- Notification preferences with usable switches
- A clearly separated danger zone

## Design and behavior

- Read `DESIGN.md` before implementation.
- Load `variables.css` globally and reuse the exported values.
- Apply core design rules only within their documented scope. Use contextual component patterns only where this product has a matching need.
- Preserve the functional requirements above even when the source design did not observe a matching component.
- Use realistic neutral English copy and data; do not use lorem ipsum.
- Create active navigation, filters, search, settings controls, and responsive layouts.
- Do not copy Astro branding, logos, illustrations, product names, text, or page composition.
- Do not add remote assets or dependencies.

