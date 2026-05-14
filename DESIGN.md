# Design System: Uptime Monitor v2
**Project ID:** local repo `uptime-monitor-v2` (no Stitch project ID found in repository analysis)

## 1. Visual Theme & Atmosphere
This interface follows a calm operational aesthetic: airy, softly lit, and intentionally low-noise. The authenticated product surfaces feel like a quiet control plane rather than a high-pressure analytics cockpit. White and near-white cards float over a pale gray-green shell, with broad diffused shadows and restrained borders doing the structural work instead of heavy chrome.

The mood is practical, trustworthy, and scan-first. Health semantics are explicit, but the base UI stays quiet. Green is the house accent for product energy and healthy states; red and amber only appear when something is wrong or needs attention. The public status page belongs to the same product family, but shifts cooler with blue-slate accents so it reads as a readable external trust surface instead of an internal operator dashboard.

## 2. Color Palette & Roles
- Soft Sage Shell (`#EDF5EF`): the primary application background. Used for the overall shell and large ambient fields.
- Clouded Mint Gradient (`#F7FAF8`, `#EFF5F1`): the vertical wash that keeps the shell from feeling flat or sterile.
- Clean Paper White (`#FFFFFF`): the main card, modal, and control surface color.
- Frosted Surface Tint (`#F2F6F3`): hover states and secondary lifted surfaces.
- Quiet Border Moss (`#DBE6DE`): low-contrast strokes for cards, inputs, toggles, and separators.
- Midnight Ink (`#102036`): the dominant text color for titles, metrics, and critical readable content.
- Slate Utility (`#63748A`) and Muted Slate (`#64748B`): supporting copy, helper text, labels, timestamps, and secondary metadata.
- Vital Product Green (`#1D9A5E`): the core product accent. Used for primary actions, active controls, and green-forward emphasis.
- Deep Action Green (`#15754C`): the darker side of the primary gradient, hover state, and operator kicker text.
- Healthy Signal Green (`#15803D`): used for positive status semantics and uptime/success emphasis.
- Healthy Wash (`rgba(21, 128, 61, 0.12)`): soft background for success badges and semantic panels.
- Incident Red (`#EF4444`): destructive actions, outages, and failure semantics.
- Incident Wash (`rgba(239, 68, 68, 0.12)`): soft destructive backgrounds and warning rows.
- Watch Amber (`#B7791F`): degraded, warning, flapping, and SSL attention states.
- Warning Wash (`rgba(245, 158, 11, 0.14)`): muted warning panels and attention badges.
- Paused Gray (`#64748B`): paused, unknown, and intentionally inactive states.
- Public Trust Blue (`#2563EB`): a public-only accent for the external status surface, incident focus, and selection states.

## 3. Typography Rules
The product uses Inter as its primary typeface. Typography is compact, operational, and clean rather than editorial. Large titles use tight tracking and strong weight so pages feel decisive without becoming loud. Internal page titles typically sit around `2rem` with negative letter-spacing; hero titles on login and public status expand to roughly `3.2rem` to `3.3rem` with even tighter tracking.

Section titles are calmer and smaller, usually in the `1.05rem` to `1.55rem` range. Support text stays in muted slate at roughly `0.82rem` to `0.95rem` with generous line-height so dense screens still read easily. Micro-labels, kickers, chip labels, and table heads use uppercase or near-uppercase utility styling with heavier weight and letter-spacing around `0.05em` to `0.14em`. Monospace is reserved for machine-like content such as tokens, timestamps, and command snippets, using `Courier New`.

## 4. Component Stylings
* **Buttons:** Primary buttons are softly rounded rectangles with a green diagonal gradient (`#1D9A5E` to `#15754C`), white text, and a gentle hover lift. Secondary buttons are clean white pills or rounded rectangles with quiet borders and no dramatic fill. Destructive controls stay visibly separate with pale red surfaces and warmer border treatment. Compact icon controls on monitor cards collapse into small square chips to keep action rails dense and readable.
* **Cards/Containers:** Cards use generous rounded corners, usually between `24px` and `32px`, with low-contrast borders and whisper-soft wide shadows. Internal cards feel like matte paper surfaces with a green-gray atmosphere around them. Public status cards use a cooler frosted-glass variant with light transparency and subtle backdrop blur. Section cards are larger rounded shells; metric tiles and meta blocks are smaller inset capsules inside them.
* **Inputs/Forms:** Inputs are softly inset fields with subtly rounded corners around `14px` to `16px`, pale tinted backgrounds, and thin moss borders. Focus states use a soft green halo rather than a hard outline. Form groups are clearly labeled, helper text is quiet but present, and form sections sit inside their own rounded cards so longer operational forms remain chunked and safe to scan.
* **Badges/Chips:** Status badges are pill-shaped, compact, uppercase, and semantically tinted rather than fully saturated. Metadata chips use soft mint or neutral washes with tiny uppercase labels and a stronger value line. Dots and small pills carry most of the state work so cards themselves can remain visually calm.
* **Depth & Elevation:** Shadows are broad, low-contrast, and diffused. Surfaces lift gently instead of popping sharply. High elevation is reserved for modals, hero cards, and key public-status containers; ordinary operational cards sit on lighter, flatter shadows.

## 5. Layout Principles
Layout favors progressive density over spectacle. Internal pages sit inside a centered shell around `1200px`, while the public status page narrows slightly to around `1060px` for cleaner reading. Major screens are built from stacked section cards with gaps mostly in the `14px` to `24px` range. Summary metrics appear in compact grids, service groups are separated into softly raised containers, and detail depth moves into modals, lower panels, or dedicated history pages instead of flooding the overview.

Geometry follows a clear hierarchy: pills for navigation, chips, toggles, and status markers; subtly rounded rectangles for buttons and inputs; generously rounded cards for the main structural surfaces. The system is explicitly responsive, collapsing from multi-column overview layouts into single-column stacks without changing the visual language. On mobile, the design keeps the same calm tone by preserving card shapes, simplifying grids, and moving side action rails below content instead of inventing a separate mobile aesthetic.
