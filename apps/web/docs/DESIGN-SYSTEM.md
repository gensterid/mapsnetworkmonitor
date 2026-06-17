# Antigrafity Design System — Dark Luxury

**Version**: 1.0 (June 2026)
**Direction**: Dark Luxury — premium, disciplined, professional
**Stack**: Tailwind v4 (`@theme` block in `index.css`) + CSS variables + class-based theme variants

---

## Philosophy

Project ini melayani 2 audience yang sangat berbeda:
- **Operator ISP** — pakai daily, butuh density tinggi + scanning cepat
- **Customer hotspot** — akses 1-2 kali (beli voucher), butuh impressed first impression

Dark Luxury bekerja untuk keduanya karena:
1. **Restraint**: 1-2 accent color saja, sisanya disciplined neutral
2. **Hierarchy by type, bukan color**: gunakan ukuran + weight + spacing
3. **Subtle motion**: 200ms ease-out, no bounce
4. **Premium via spacing**: ruang nafas yang generous di key moments

---

## Core Principles

### 1. Color Discipline
- **1 primary accent** (biru #3B82F6) — semua call-to-action
- **3 status colors** — emerald (success), amber (warning), red (danger)
- **5 neutrals only** — surface base / raised / overlay, fg-strong / default / muted / subtle
- Never use random color luar palette ini

### 2. Typography Hierarchy
- Beda **size + weight**, BUKAN color. Color tetap fg-strong di hampir semua text.
- Heading menggunakan tight tracking (`tracking-tight`)
- Body menggunakan natural tracking
- Caption + meta menggunakan `text-fg-muted`

### 3. Whitespace as Premium Signal
- Card padding: 24px (p-6) untuk kontainer utama, 16px (p-4) untuk nested
- Section gap: 24px (gap-6) untuk dashboard, 32px (gap-8) untuk landing
- Inline cluster: 8px (gap-2) untuk badge+text, 12px (gap-3) untuk action group

### 4. Motion: Refined, Not Playful
- All transition: `duration-200 ease-out`
- Hover state: border color change atau subtle glow, JANGAN scale aggressive
- Click feedback: `active:scale-[0.98]`
- Loading: pulse 3 seconds (slow, not anxious)

### 5. Border Over Shadow
- Dark Luxury pakai **border** untuk depth separation, BUKAN drop shadow
- Shadow tetap dipakai cuma untuk floating elements (modal, dropdown)
- Shadow color = primary color dengan opacity rendah → glow halus

---

## Color Tokens (Dark Luxury)

Pakai CSS variable di `:root`. Existing variabel project sudah 80% match Dark Luxury — yang berubah cuma tweak minor untuk lebih disiplin.

### Surfaces (Background Layers)
| Token | Value | Use |
|---|---|---|
| `--background-dark` | `#020617` (slate-950) | Page base, deepest dark |
| `--surface-dark` | `#0F172A` (slate-900) | Card primary, sticky headers |
| `--surface-darker` | `#020617` (slate-950) | Header bar / sidebar over base |
| `--slate-surface` | `#1E293B` (slate-800) | Nested card, modal body |
| `--slate-border` | `#1F2937` (slate-800/50) | Default border (subtle) |

### Foreground (Text + Icons)
| Token | Value | Use |
|---|---|---|
| `--text-base` | `#F1F5F9` (slate-100) | Headings, primary content |
| `--text-muted` | `#94A3B8` (slate-400) | Labels, captions, meta |
| (utility) `text-fg-subtle` | `#475569` (slate-600) | Disabled, placeholder |

### Accent
| Token | Value | Use |
|---|---|---|
| `--primary` | `#3B82F6` (blue-500) | All CTAs, links, focus rings |
| `--primary-dark` | `#2563EB` (blue-600) | Hover state primary |
| `--on-primary` | `#FFFFFF` | Text/icon on primary bg |

### Status
| Token | Value | Use |
|---|---|---|
| `--success` | `#10B981` (emerald-500) | Paid, success, active |
| `--warning` | `#F59E0B` (amber-500) | Pending, attention |
| `--danger` | `#EF4444` (red-500) | Error, isolir, destructive |

---

## Typography Scale

Tailwind utility:

| Tier | Class | Use |
|---|---|---|
| Display | `text-4xl sm:text-5xl font-black tracking-tight` | Hero pages (landing) |
| Title | `text-2xl font-bold tracking-tight` | Page header, section title |
| Heading | `text-lg font-semibold` | Card title, modal title |
| Subheading | `text-base font-semibold` | Sub-section |
| Body | `text-sm` | Default content |
| Caption | `text-xs text-fg-muted` | Metadata, helper text |
| Label | `text-[10px] uppercase tracking-wider font-bold text-fg-muted` | Table header, badge label |
| Code | `font-mono text-xs` | UUID, codes, technical |

---

## Spacing System

Konsisten dengan Tailwind default (4px base):

| Token | Value | Use |
|---|---|---|
| Tight | `gap-1` (4px) | Icon + text very close |
| Cluster | `gap-2` (8px) | Badge group, button + icon |
| Comfortable | `gap-3` (12px) | Card inline metas |
| Section | `gap-6` (24px) | Card-to-card |
| Hero | `gap-8` (32px) | Landing sections |

Padding paling sering:
- Card body: `p-4` (16px) tight or `p-6` (24px) comfortable
- Modal: `px-5 py-4`
- Button: `px-4 py-2` (sm), `px-5 py-2.5` (md), `px-6 py-3` (lg)

---

## Component Patterns

### Card (Primary Container)

```jsx
<div className="rounded-xl bg-surface-dark/40 border border-slate-border backdrop-blur-sm">
  {/* Header */}
  <div className="border-b border-slate-border/60 px-5 py-3.5 flex items-center justify-between gap-3">
    <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
      <Icon className="w-5 h-5 text-primary" />
      Title
    </h2>
    {actions}
  </div>
  {/* Body */}
  <div className="px-5 py-4">
    {children}
  </div>
</div>
```

### Card Interactive (Hover-able)

Border color change + subtle glow:

```jsx
className="rounded-xl bg-surface-dark/40 border border-slate-border
           hover:border-primary/40 hover:shadow-[0_0_0_1px_var(--primary)/15,0_8px_30px_-12px_var(--primary)/15]
           transition-all duration-200 cursor-pointer"
```

### Button Variants

Pakai existing `<Button>` component dari `@/components/ui/Button`:

```jsx
<Button variant="primary">Aksi Utama</Button>          // bg-primary
<Button variant="secondary">Aksi Alt</Button>           // bg-white/5
<Button variant="ghost">Subtle</Button>                 // no bg
<Button variant="outline">Outline</Button>              // border only
<Button variant="destructive">Hapus</Button>            // bg-danger/10
```

Size: `default` | `sm` | `lg` | `icon`.

### Status Badge

Tinted bg + saturated text + ring halus untuk Dark Luxury:

```jsx
// Success
<span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md
                 bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30
                 font-semibold uppercase tracking-wider">
  ACTIVE
</span>

// Warning
className="bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"

// Danger
className="bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
```

### Input / Select

```jsx
<input className="w-full px-3 py-2 rounded-lg
                  bg-surface-darker/60 border border-slate-border
                  text-fg placeholder-fg-muted
                  focus:border-primary focus:ring-2 focus:ring-primary/30
                  focus:outline-none transition-colors duration-200" />
```

### Table Row Pattern (Operator Pages)

```jsx
<tr className="hover:bg-slate-surface/30 transition-colors duration-150 cursor-pointer
               border-b border-slate-border/40">
  <td className="px-3 py-2.5 text-fg">
    {content}
  </td>
</tr>
```

### Modal Backdrop

```jsx
<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md
                flex items-center justify-center p-4 animate-in fade-in duration-200">
  <div className="bg-surface-dark border border-slate-border rounded-2xl
                  shadow-2xl shadow-primary/10 max-w-md w-full
                  animate-in zoom-in-95 duration-200">
    {children}
  </div>
</div>
```

---

## Page-Level Patterns

### Operator Page Layout (Dashboard, Tabs)

```
┌─ Page Header (border-b border-slate-border) ─────────┐
│ Title + breadcrumb         Action buttons (right)    │
├─ Tabs (horizontal scroll) ────────────────────────────┤
│ [Tab 1] [Tab 2] [Tab 3] [Tab 4]                       │
├─ Content (p-6) ───────────────────────────────────────┤
│ ┌─ Card ──────────────────────────────────────────┐  │
│ │ Card header                                       │  │
│ │ Card body                                         │  │
│ └──────────────────────────────────────────────────┘  │
│ ┌─ Card ──────────────────────────────────────────┐  │
│ └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Customer Page Layout (Public Landing)

```
┌─ Hero (gradient background, py-12) ──────────────────┐
│           Big icon (w-12)                             │
│           Title 4xl font-black                        │
│           Tagline base text-fg-muted                  │
├─ Content (max-w-2xl mx-auto, p-6) ────────────────────┤
│ ┌─ Section label (uppercase muted) ─────────────────┐ │
│ │ Pilih Paket                                       │ │
│ └───────────────────────────────────────────────────┘ │
│ ┌─ Card 1 (interactive hover) ──────────────────────┐ │
│ │ Title 18px bold                                    │ │
│ │ Meta inline (fg-muted)                             │ │
│ │                              Price (big, primary)  │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## Animation Tokens

| Pattern | Class | Duration |
|---|---|---|
| Default hover | `transition-colors duration-200 ease-out` | 200ms |
| Layout transition | `transition-all duration-300 ease-out` | 300ms |
| Click feedback | `active:scale-[0.98] transition-transform duration-150` | 150ms |
| Slow pulse (loading) | `animate-[pulse_3s_ease-in-out_infinite]` | 3s |
| Fade in (modal) | `animate-in fade-in duration-200` | 200ms |
| Zoom in (modal) | `animate-in zoom-in-95 duration-200` | 200ms |

JANGAN dipakai (anti-Dark-Luxury):
- ❌ `animate-bounce` (terlalu playful)
- ❌ Scale > 1.05 (terlalu kentara)
- ❌ Transition > 500ms (terasa lemot)
- ❌ Rotate animation (distraksi)

---

## Accessibility (WCAG 2.2 AA)

- **Focus visible**: semua interactive element pakai `focus-visible:ring-2 focus-visible:ring-primary/50`
- **Touch target**: minimum 44px (default `py-2.5` = 40px + border)
- **Contrast ratio**: minimum 4.5:1 — Slate-100 di atas Slate-900 = 14:1 ✓
- **Reduced motion**: respect `prefers-reduced-motion` (Tailwind auto-handle dengan `motion-safe:`)
- **Keyboard nav**: Tab + Enter + Esc semua interactive element
- **ARIA**: labels untuk icon-only button, role untuk landmarks

---

## Existing Code Mapping

Component sudah follow Dark Luxury (80% match) — minor refinement:

| Component | File | Status |
|---|---|---|
| Card | [`apps/web/src/components/ui/Card.jsx`](apps/web/src/components/ui/Card.jsx) | ✓ Match |
| Button | [`apps/web/src/components/ui/Button.jsx`](apps/web/src/components/ui/Button.jsx) | ✓ Match (5 variants) |
| Badge | [`apps/web/src/components/ui/Badge.jsx`](apps/web/src/components/ui/Badge.jsx) | ⚠ Tweak: pakai tinted bg + ring untuk Dark Luxury (saat ini solid bg) |
| Modal | [`apps/web/src/components/ui/Modal.jsx`](apps/web/src/components/ui/Modal.jsx) | ⚠ Tweak: add subtle primary shadow glow |
| Input | [`apps/web/src/components/ui/Input.jsx`](apps/web/src/components/ui/Input.jsx) | ✓ Match |

Page perlu polish (low → high effort):
1. [`apps/web/src/pages/BeliVoucher.jsx`](apps/web/src/pages/BeliVoucher.jsx) — landing publik, **highest priority**
2. [`apps/web/src/pages/BeliVoucherSukses.jsx`](apps/web/src/pages/BeliVoucherSukses.jsx) — success page
3. [`apps/web/src/pages/billing/PelangganTab.jsx`](apps/web/src/pages/billing/PelangganTab.jsx) — operator daily
4. [`apps/web/src/pages/billing/TransaksiTab.jsx`](apps/web/src/pages/billing/TransaksiTab.jsx) — operator
5. [`apps/web/src/pages/Billing.jsx`](apps/web/src/pages/Billing.jsx) — main tab container

---

## When in Doubt

Tanya: "Apakah ini terasa **premium ISP** atau **trendy startup**?"
- Premium ISP ✓ → apply
- Trendy startup ✗ → reject

Atau: "Apakah ini akan terlihat dated dalam 2 tahun?"
- Tidak ✓ → apply
- Iya ✗ → reject
