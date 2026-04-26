# Newshock Design System

Single source of truth for visual & component conventions across all `.radar-page` routes (home, events, themes, themes/[id], tickers, tickers/[symbol]).

All styling is scoped under `.radar-page` in `app/radar.css`. Pages must wrap their root in `<div className="radar-page">` to opt in to the token system.

---

## 1. Color tokens (CSS custom properties)

Defined in `app/radar.css` (light = `.radar-page`, dark = `[data-theme="dark"] .radar-page`).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F4F1EC` | `#1A1815` | Page background |
| `--bg-elev` | `#FFFFFF` | `#242120` | Elevated card / popover |
| `--bg-sunk` | `#EDE9E2` | `#2C2926` | Sunken panel |
| `--ink` | `#1F1C19` | `#EDE6D8` | Primary text / strongest border |
| `--ink-2` | `#4A463F` | `#C9C2B4` | Secondary text |
| `--ink-3` | `#7A7468` | `#8F8A7E` | Tertiary text / hover border / icon |
| `--ink-4` | `#A8A196` | `#625D53` | Quaternary text / disabled |
| `--line` | `#E4DFD6` | `#3A3632` | Default border / hover bg on filled |
| `--line-2` | `#EFEAE1` | `#302D29` | Subtle fill / inactive pill bg |
| `--line-card` | `#EAE4D8` | `#3A3632` | Card border |
| `--topbar-bg` | `rgba(244,241,236,0.78)` | `rgba(26,24,21,0.78)` | Sticky topbar (with `backdrop-filter: saturate(160%) blur(16px)`) |
| `--accent` | `#1F1C19` | `#EDE6D8` | Active state ink |
| `--link` | `#1F1C19` | `#D4C8B2` | Inline links |
| `--up` | `#5C6A1E` | `#8FA058` | Bullish / positive |
| `--down` | `#8B3A2E` | `#C87A6B` | Bearish / negative |
| `--warn` | `#A86C00` | `#C89A52` | Warning / caution |

Sector accents (for theme categories): `--c-geo` `--c-ai` `--c-supp` `--c-pha` `--c-def` `--c-ene` `--c-mat`.

**Don't** use Antd token shortcuts (`token.colorBgContainer`, `token.colorBorder`) for surfaces that should track the design system — prefer CSS vars. Antd tokens are still fine for one-off internal padding/font-size needs.

---

## 2. Typography

- Body font: `var(--font-inter)`, fallback `system-ui`
- Code/numeric: `var(--font-mono)` via `token.fontFamilyCode`, with `font-feature-settings: "tnum","zero"` for tabular alignment
- Base size: 13px, line-height 1.45
- Letter-spacing scale:
  - `-0.02em` — page titles
  - `-0.01em` — section titles, large numbers
  - `0.02em` — subtitles
  - `0.06em` — small uppercase meta (kicker text)
  - `0.16em–0.18em` — uppercase index numbers / filter labels (en)
  - `0.08em` — uppercase Chinese filter labels (zh)
- Title weights: 600 (no lighter)
- **No italics anywhere.** Don't use `fontStyle: 'italic'`, Tailwind `italic`, `<Text italic>`, `<em>`/`<i>`, or `font-style: italic` in CSS. For emphasis use weight (500/600), color (`colorTextSecondary` / `var(--ink-3)`), monospace (`fontFamilyCode`), or uppercase+letter-spacing.

---

## 3. Layout

```
.app
├── .sidebar            (216px fixed, scoped under .radar-page)
└── <Layout>            (Antd, transparent bg)
    ├── <Topbar />      (sticky, height 52, blur backdrop)
    └── <Content>       (padding `0 ${sidePad}px 40px`)
        ├── <PageHeader /> (title + stats + meta)
        └── <Row gutter={[24,24]}>
            ├── main col   (lg=17)
            └── side col   (lg=7, sticky top:80)
```

`sidePad` formula: `isMobile ? 16 : 28` (uses Ant `useBreakpoint`, mobile = `!screens.md`).

---

## 4. Shared components (`components/shared/`)

### `<Topbar sidePad={number} />`
Sticky search + locale toggle + theme toggle. Self-contained — reads i18n / theme mode internally. Used on all 6 pages. Don't duplicate.

### `<PageHeader title icon? stats? live? meta? />`
Page-level header with optional pulse dot, comma-separated stat pills (number + label), optional uppercase meta on the right. Always sits at top of `<Content>`.

### `<SectionHeader index title subtitle? meta? action? size? first? />`
- `size="lg"` (default): title 18 / subtitle 12 / index 11
- `size="sm"`: title 15 / subtitle 11 / index 10
- `first` controls top margin (8 vs 24/32)
- All have a `colorSplit` bottom border. `index` is a 2-digit string like `"01"`.

### `<FilterPill label count? active onClick />`
Single-select pill button — height **30**, padding **0 14**, radius **999**, font 13.
- Inactive: `bg = token.colorFillAlter`, `border-color: transparent`
- Hover (inactive): `bg = var(--line-2)`
- Active: `bg = token.colorText`, `color = token.colorBgContainer`, weight 600, border `token.colorText`
- Focus: `outline 2px var(--ink-3)` offset 2

### `<FilterLabel locale minWidth?>{children}</FilterLabel>`
Uppercase kicker label that precedes a row of pills/dropdowns. Pass `minWidth` only when filter rows have **mixed-length labels** that need column alignment (e.g. events page, mix of 2-/4-char labels: `minWidth={locale === 'zh' ? 52 : 80}`). Uniform-length labels (themes/tickers) omit it.

### `<NavIcons />` (`RadarIcon`, `ClockIcon`, etc.)
Stroke-based custom SVGs, currentColor. Use these — don't pull `@ant-design/icons` for nav.

### `<SectionLabel />`, `<SectionTitle />`, `<HorizonBadge />`, `<FocusLevelBadge />`, `<CuratorStrip />`
Domain-specific. See file for usage.

---

## 5. Filter pattern (events / themes / tickers)

A filter row is always:

```tsx
<Flex gap={8} wrap align="center">
  <FilterLabel locale={locale} [minWidth]={...}>{t('label')}</FilterLabel>
  {options.map(opt => <FilterPill key={opt} ... />)}
</Flex>
```

For dropdown-style filters (only used on events page when option count is large), use `<Select className="filter-select" />` — see §6.

Group all filter rows in a single `<Flex vertical gap={10}>` block with `paddingBottom: 18` and `borderBottom: 1px solid colorSplit`.

Default sort behavior: sort on a primary score (e.g. theme strength, ticker score) — don't make the user re-sort to see the most relevant first.

---

## 6. `<Select>` dropdown — `.filter-select`

Use only when an enum has >5 options or is search-heavy. Otherwise prefer `FilterPill`s. Pattern (events page):

```tsx
<Select
  variant="filled"
  className="filter-select"
  suffixIcon={<ChevronDownIcon />}    // local thin-line SVG, 10×10, stroke 1.4
  style={{ width: 240 }}
  ...
/>
```

CSS (in `app/radar.css`) gives it: pill shape (height 30, radius 999), `var(--line-2)` bg (matches inactive pill), no border, custom thin chevron rotated on open, padding-inline 16, multi-select tags re-styled as small pills.

Don't use `size="small"` — it conflicts with the height override.

---

## 7. Card & hover

- Card border: `1px solid token.colorBorderSecondary`, radius `token.borderRadiusLG`, padding `14px 18px`, bg `token.colorBgContainer`.
- For interactive cards add `className="hover-card"` (defined globally in `app/radar.css`):
  ```css
  .radar-page .hover-card { transition: border-color/box-shadow/transform 0.15s }
  .radar-page .hover-card:hover {
    border-color: var(--ink-3);
    box-shadow: 0 4px 14px -8px rgba(0,0,0,0.18);
  }
  ```
  Don't write `<style jsx>` blocks for card hover — use the class.

---

## 8. Tags / chips

- Tag pills: `Tag` component, font 11, line-height 1.4, lowercase tracking. Use for impact / sector / status badges.
- Stage dots / source badges / ticker chips: see corresponding scoped CSS in `app/radar.css` (`.stage-dots`, `.source-badge`, `.ticker-chip`).

---

## 9. Spacing scale

- Section gap (between filter row + content): `marginTop: 18, marginBottom: 22`
- Filter row internal: `gap={8}` (pills) / `gap={8}` (dropdowns — was 10, unified)
- Card list: `<Flex vertical gap={10}>`
- Two-column layout: `<Row gutter={[24,24]}>`
- Card padding: `14px 18px`
- Title→meta vertical: `marginBottom: 10` (always — don't make it conditional)

---

## 10. Performance conventions

- List item components must be wrapped in `React.memo` (e.g. `EventCard` in `app/events/page.tsx` and `components/ticker-detail/EventsList.tsx`). When adding new list items, follow the same pattern.
- Filtering = `useMemo` in client components. Don't refetch the API for filter changes that can be done in-memory.
- Heavy nav data fetched via SWR with 60s `refreshInterval` (see `app/page.tsx` overview pattern).

---

## 11. i18n

- All user-facing strings via `t()` from `@/lib/i18n-context`.
- Keys live under page namespace: `events_page.*`, `themes_page.*`, `tickers_ranked.*`, `sections.*`, `topbar.*`, `common.*`.
- Both `locales/en.json` and `locales/zh.json` must be updated together.
- Locale-specific spacing (e.g. `letterSpacing` for uppercase labels) varies between en (wider, 0.18em) and zh (tighter, 0.08em).

---

## 12. What NOT to add

- No emoji in UI text.
- No italics. See §2.
- No additional theme/tone colors — use the 7 sector accents or the up/down/warn triplet.
- No new filter UI patterns — use FilterPill or `.filter-select`.
- No card hover variations — use `.hover-card`.
- No new Topbar layouts — use `<Topbar />`.
- No realtime push, no broker integration, no leaderboards (per CLAUDE.md product rules).
