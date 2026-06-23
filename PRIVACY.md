# Privacy Policy — Image Transforms

_Last updated: June 2026_

Image Transforms is a client-side tool. It runs entirely in your browser; there is no backend server operated by this app.

## What the app does with your data

- **Images you warp** are read through the Miro Web SDK (or, in the standalone version, chosen by you from your device) purely to perform the perspective warp **locally in your browser**. The warped result is placed back onto your Miro board through the Miro Web SDK, or downloaded by you as a file.
- **Nothing is transmitted to any server** operated by this app or to any third party. There is no analytics, no tracking, no advertising, and no cookies.
- The **only data stored** is a small "stacking box" reference (image dimensions used to align stacked layers) kept in your browser's `localStorage`. It never leaves your device and can be cleared at any time with the in-app **Reset** control or by clearing your browser storage.

## Permissions

The Miro app requests:

- **`boards:read`** — to read the image you have selected, so it can be warped.
- **`boards:write`** — to add the warped copy back to your board.

These permissions are used only to carry out the warp action you explicitly trigger.

## Data retention and deletion

This app stores no personal data on any server, so there is nothing to retain or delete on our side. Local browser storage is under your control.

## Contact

Questions about this policy can be raised via the project's GitHub issues:
<https://github.com/R-Repo/image-transforms/issues>
