import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { D4nTokens } from '@d4n/tokens';

/**
 * The `HighlightStyle` for both Data4Now editor themes (PRD §7.5).
 *
 * WHY THIS LIST IS LONG
 * ---------------------
 * PRD §7.5 makes coverage a hard requirement: "any lezer tag that falls through
 * to the default color in any of [Python, R, Julia, SQL, Markdown, JSON, YAML,
 * TOML, Bash, TypeScript, LaTeX] is a bug". The sample list in the PRD — and
 * every published CM6 theme it was cribbed from — covers maybe a third of the
 * tag vocabulary, which is exactly why third-party grammars come out grey.
 *
 * So the list below is exhaustive over `@lezer/highlight`'s tag set rather than
 * illustrative. It is safe to be exhaustive because tags form a tree: a rule on
 * `t.literal` is the fallback for `t.number`, `t.bool`, `t.regexp`, `t.escape`,
 * `t.color` and `t.url`; a rule on `t.name` catches every identifier variant a
 * grammar can invent. The eight roots — `comment`, `name`, `literal`, `keyword`,
 * `operator`, `punctuation`, `content`, `meta` — plus the four orphans
 * (`inserted`, `deleted`, `changed`, `invalid`) are all present, so nothing can
 * reach the default colour no matter what a grammar emits.
 *
 * A NOTE ON THE SIX STREAM-PARSED LANGUAGES
 * -----------------------------------------
 * R, Julia, YAML, TOML, Bash and LaTeX have no Lezer grammar in JupyterLab 4.5;
 * they run through `StreamLanguage`, whose token table resolves a CM5 style name
 * straight to `tags[name]`, with a dozen legacy aliases on top
 * (`variable-2` → `special(variableName)`, `def` → `definition(variableName)`,
 * `builtin` → `standard(variableName)`, `error` → `invalid`, `qualifier` →
 * `modifier`, `header` → `heading`, `string-2` → `special(string)`, …). Those
 * aliased forms are enumerated explicitly below — they are the tags a
 * Lezer-only tag list silently misses.
 *
 * ORDERING
 * --------
 * `HighlightStyle` emits CSS in spec order, so later entries win when a single
 * node carries several tags. Markup styling is therefore last: markdown emphasis
 * inside a link should still read as emphasis.
 */
export function buildHighlightStyle(tk: D4nTokens): HighlightStyle {
  const c = tk.color;
  const syn = c.syntax;
  const weight = tk.font.weight;

  return HighlightStyle.define([
    // ── Comments ────────────────────────────────────────────────────────────
    {
      tag: [t.comment, t.lineComment, t.blockComment],
      color: syn.comment,
      fontStyle: 'italic'
    },
    { tag: t.docComment, color: syn.comment, fontStyle: 'italic' },

    // ── Identifiers ─────────────────────────────────────────────────────────
    { tag: [t.name, t.variableName, t.local(t.variableName)], color: syn.name },
    // `def` in every stream mode (R, Julia, Bash function names) and
    // `AssignStatement/VariableName` in Python land here.
    { tag: t.definition(t.variableName), color: syn.function },
    // `variable-2` — instance variables, YAML anchors, LaTeX math variables.
    {
      tag: [t.special(t.variableName), t.special(t.name)],
      color: syn.property
    },
    // `builtin` — R/Julia/Bash builtins and, via JupyterLab's `pythonBuiltin`
    // extension, `len`/`print`/`range`. SQL's builtins arrive as standard(name).
    {
      tag: [t.standard(t.variableName), t.standard(t.name)],
      color: syn.function
    },
    // Constants read as literals, not as identifiers — that is the convention
    // every language in the list shares.
    { tag: t.constant(t.variableName), color: syn.number },
    {
      tag: [
        t.function(t.variableName),
        t.function(t.definition(t.variableName)),
        t.function(t.propertyName),
        t.function(t.definition(t.propertyName)),
        t.macroName,
        t.labelName
      ],
      color: syn.function
    },
    {
      tag: [t.propertyName, t.definition(t.propertyName), t.attributeName],
      color: syn.property
    },
    {
      tag: [
        t.typeName,
        t.className,
        t.definition(t.className),
        t.namespace,
        t.tagName
      ],
      color: syn.type
    },

    // ── Literals ────────────────────────────────────────────────────────────
    // Root fallback: anything a grammar tags as a bare literal.
    { tag: t.literal, color: syn.number },
    {
      tag: [t.string, t.docString, t.character, t.attributeValue],
      color: syn.string
    },
    // `string-2` / f-strings / template literals — interpolating strings get the
    // regexp colour so the reader can tell at a glance that they contain code.
    { tag: t.special(t.string), color: syn.regexp },
    {
      tag: [
        t.number,
        t.integer,
        t.float,
        t.bool,
        t.null,
        t.atom,
        t.unit,
        t.color
      ],
      color: syn.number
    },
    { tag: [t.regexp, t.escape], color: syn.regexp },
    { tag: t.url, color: syn.link, textDecoration: 'underline' },

    // ── Keywords ────────────────────────────────────────────────────────────
    { tag: t.keyword, color: syn.keyword },
    {
      tag: [t.controlKeyword, t.definitionKeyword, t.moduleKeyword],
      color: syn.controlKeyword,
      fontWeight: weight.semibold
    },
    // `and` / `or` / `not` / `in` / `isa` behave like operators, so they are
    // coloured like operators even though the grammar files them as keywords.
    { tag: t.operatorKeyword, color: syn.operator },
    { tag: t.modifier, color: syn.keyword },
    // `self` / `this` / `it`: italic is the only signal that separates it from
    // its neighbours, and it costs no extra colour (A7).
    { tag: t.self, color: syn.keyword, fontStyle: 'italic' },

    // ── Operators ───────────────────────────────────────────────────────────
    {
      tag: [
        t.operator,
        t.derefOperator,
        t.arithmeticOperator,
        t.logicOperator,
        t.bitwiseOperator,
        t.compareOperator,
        t.updateOperator,
        t.definitionOperator,
        t.typeOperator,
        t.controlOperator
      ],
      color: syn.operator
    },

    // ── Punctuation & brackets ──────────────────────────────────────────────
    // Deliberately quieter than identifiers: in JSON, YAML and TOML punctuation
    // is most of the document, and colouring it as loudly as content turns the
    // file into noise.
    { tag: [t.punctuation, t.separator], color: c.text.secondary },
    {
      tag: [t.bracket, t.angleBracket, t.squareBracket, t.paren, t.brace],
      color: c.text.secondary
    },

    // ── Metadata ────────────────────────────────────────────────────────────
    // Python decorators, YAML tags, TOML table headers, LaTeX preamble
    // directives, TypeScript triple-slash references.
    { tag: [t.meta, t.documentMeta, t.annotation], color: syn.meta },

    // ── Change tracking ─────────────────────────────────────────────────────
    // Diff-flavoured tags. `t.deleted` is a change-tracking tag, not an
    // identifier tag — several published themes group it with `t.name`, which is
    // where the "deleted lines are the same colour as variables" bug comes from.
    { tag: t.inserted, color: c.success.default },
    { tag: t.deleted, color: c.danger.default },
    { tag: t.changed, color: c.warning.default },

    // ── Markup / prose (last: wins over the code tags above) ────────────────
    // `t.content` is markdown's paragraph tag and `t.list` covers a list's whole
    // body, so both must be plain body text or prose reads as syntax.
    { tag: [t.content, t.list], color: c.text.primary },
    { tag: t.heading, color: syn.heading, fontWeight: weight.semibold },
    {
      tag: [t.heading1, t.heading2],
      color: syn.heading,
      fontWeight: weight.bold
    },
    {
      tag: [t.heading3, t.heading4, t.heading5, t.heading6],
      color: syn.heading,
      fontWeight: weight.semibold
    },
    { tag: t.contentSeparator, color: c.border.strong },
    { tag: t.quote, color: c.text.secondary, fontStyle: 'italic' },
    // Inline code and fenced `CodeText` inside markdown.
    { tag: t.monospace, color: syn.property },
    { tag: t.link, color: syn.link, textDecoration: 'underline' },
    { tag: t.emphasis, color: c.text.primary, fontStyle: 'italic' },
    { tag: t.strong, color: c.text.strong, fontWeight: weight.semibold },
    {
      tag: t.strikethrough,
      color: c.text.muted,
      textDecoration: 'line-through'
    },
    // Markdown's structural marks (`#`, `>`, `-`, `*`, backticks) and XML
    // processing instructions. Muting them is what makes a markdown cell read as
    // prose rather than as source.
    { tag: t.processingInstruction, color: c.text.muted },

    // ── Errors ──────────────────────────────────────────────────────────────
    // `error` in every stream mode resolves here. The wavy underline is the
    // non-colour signal A7 asks for.
    {
      tag: t.invalid,
      color: syn.invalid,
      textDecoration: 'underline wavy'
    }
  ]);
}
