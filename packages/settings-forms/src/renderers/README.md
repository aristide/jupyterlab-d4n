# `@d4n/settings-forms` — targeted field renderers

This directory is empty on purpose. It holds the **targeted pass** of PRD §7.7:
the handful of settings fields where the global CSS pass in
`style/settings-forms.css` provably cannot reach spec, and only a replacement
React component will do.

Each renderer is registered from `src/index.ts` by adding an entry to the
`RENDERERS` table. Remember the §7.7 constraint that shapes this whole
directory: `IFormRendererRegistry` keys on `<plugin-id>.<property>`, so a
renderer is bound to one property of one plugin. There is no way to say "every
field of type X". If a field is not listed below, it is served by CSS.

## The five renderers, and why CSS cannot do them

| TODO id | Renderer           | Registry key                                                                                    | Why it needs a component                                                                                                                                                      |
| ------- | ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-03   | Keybinding capture | `@jupyterlab/shortcuts-extension:shortcuts.shortcuts`                                           | The field must _listen_ for a chord and render it as key caps. A text input asking the user to type `Accel Shift P` is a different interaction, not a differently styled one. |
| P4-04   | Theme picker       | `@jupyterlab/apputils-extension:themes.theme`                                                   | A swatch/preview grid. The stock control is a `<select>`, whose popup list is OS-rendered and unstylable — PRD §14 R5. Replacing the control is the only way past that.       |
| P4-05   | Editor config      | `@jupyterlab/fileeditor-extension:plugin.editorConfig`                                          | A flat object of ~15 unrelated properties rendered as one undifferentiated stack. Needs grouping and a live preview, which is structure, not paint.                           |
| P4-06   | Font picker        | `@jupyterlab/apputils-extension:themes.font-family` (code and content variants)                 | Options must be previewed **in the face they name**, and the list must be filtered to fonts actually available to the browser. Both are runtime questions.                    |
| P4-07   | Colour picker      | `@jupyterlab/terminal-extension:plugin` ANSI overrides, and any plugin exposing a colour string | A hex string in a text box gives no feedback and no contrast check. The picker is also where the §10.2 contrast gate surfaces to the user.                                    |

The registry keys above are the intended targets, **not verified ids**. Confirm
each one against the running build before wiring it up — a wrong key fails
silently (the stock field simply renders), which is exactly the failure mode
that survives a code review. `jlpm test:selectors` is the gate.

## Contingency

PRD §7.7 step 3: if CSS plus these five still do not reach spec, the escalation
is a full T3 replacement of `@jupyterlab/settingeditor-extension:form-ui`. That
is scoped as a contingency with a decision point at the **end of Phase 4** — do
not start it early, and do not treat a hard field here as evidence for it until
the five above are done.

## Conventions for a renderer added here

- One file per renderer, default-exporting the RJSF `Field` (or `Widget`).
- Read every literal from `@d4n/tokens`; a component is not an exemption from
  the no-hardcoded-values rule, it just moves the values from CSS to TS.
- Degrade to the stock control rather than throwing: an exception inside an
  RJSF field takes down the whole settings form, not just that row.
