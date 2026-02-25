# Boukd — Development Guide

## Project Overview
Multi-tenant booking platform for beauty/wellness professionals. Monorepo: `backend/` (Express, CommonJS) + `frontend/` (React + Vite + MUI).

## Style Guide

### Brand Colours
| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#8B2635` | Buttons, headers, links, brand elements |
| Primary hover | `#6d1f2b` | Hover state for primary buttons |
| Gold accent | `#D4A853` | CTAs, secondary highlights, pricing badges |
| Gold hover | `#c49a3f` | Hover state for gold buttons |
| Success | `#2e7d32` | Confirmed, checkmarks, positive status |
| Warning | `#ed6c02` | Pending, caution states |
| Error | `#d32f2f` | Cancelled, destructive actions |
| Info | `#1976d2` | Informational alerts |

### Backgrounds
| Context | Colour |
|---------|--------|
| Landing page | `#F5F0EE` alternating with `white` |
| Admin pages | `#f5f5f5` (light mode via theme) |
| Public booking | `#fafafa` |
| Dark mode | `#121212` (default), `#1e1e1e` (paper) |
| Footer | `#1a1a1a` |
| Hero gradient | `radial-gradient(ellipse at 20% 50%, #8B2635 0%, #5a1420 60%, #3d0e16 100%)` |

### Typography
| Element | Font | Weight | Size |
|---------|------|--------|------|
| Landing headings (h2-h3) | Poppins | 800 | `{ xs: '1.8rem', md: '2.5rem' }` |
| Admin headings (h5-h6) | Inter (theme default) | 600-700 | MUI defaults |
| Body text | Inter | 400 | MUI defaults |
| Labels/subtitles | Inter | 500-600 | MUI defaults |
| Captions | Inter | 400 | MUI `caption` variant |

- **Line heights**: `1.2` for headings, `1.6` for body, `1.7` for feature descriptions
- **British English** spelling throughout (colour, customise, organised, etc.)

### Component Patterns

**Cards:**
- Border radius: `12px` (set in theme)
- Default padding: `p: 3` (24px)
- Subtle shadow: `0 2px 12px rgba(0,0,0,0.04)`
- Hover shadow: `0 12px 40px rgba(0,0,0,0.1)` with `transform: translateY(-4px)`
- Transition: `all 0.3s ease`

**Buttons:**
- Border radius: `8px` (set in theme)
- `textTransform: 'none'` (set in theme — no uppercase)
- Primary: `bgcolor: '#8B2635'`, hover `'#6d1f2b'`
- CTA/gold: `bgcolor: '#D4A853'`, `color: '#1a1a1a'`
- Destructive: `color: 'error'`, outlined variant
- Mobile touch targets: `minHeight: 44`

**Chips/Badges:**
- Section labels: `bgcolor: '${PRIMARY}15'`, `color: PRIMARY`, `fontWeight: 700`
- Gold section labels: `bgcolor: '${GOLD}25'`, `color: '#8a7020'`

**Accordions:**
- `boxShadow: 'none'`, `border: '1px solid'`, `borderColor: 'divider'`
- `borderRadius: '12px !important'`, `mb: 1.5`

**Confirmation Dialogs:**
- **Never use `window.confirm()` or `window.alert()`** — always use the `ConfirmDialog` component (`src/components/ConfirmDialog.jsx`)
- Props: `title`, `message`, `confirmLabel`, `confirmColor`, `warning` (optional alert banner)
- Destructive actions: `confirmColor="error"`, `confirmLabel="Delete"` or `"Yes, Cancel"`
- Non-destructive: `confirmColor="primary"`, `confirmLabel="Confirm"` or `"Deactivate"`
- Pattern: `const [confirmOpen, setConfirmOpen] = useState(false);` → button sets `true` → dialog calls handler on confirm

### Spacing
| Context | Value |
|---------|-------|
| Section padding | `py: { xs: 6, md: 10 }` |
| Card content | `p: 3` (standard) or `p: 2` (compact) |
| Heading margin bottom | `mb: 3` (major) or `mb: 2` (minor) |
| List item spacing | `mb: 1.5` |
| Grid spacing | `spacing: 3` (standard) or `spacing: { xs: 2, md: 3 }` |
| Flex gaps | `gap: 2` (buttons), `gap: 1` (icon + text) |

### Logo Usage
- Navbar: `<img src="/boukd-logo.png">` at `height: { xs: 32, md: 38 }`
- Footer: Same image at `height: 30` with `filter: 'brightness(1.3)'` for dark background
- Do NOT use text-based logo — always use the image asset

### MUI Theme (src/theme.js)
- Primary: `#8B2635`, Secondary: `#D4A853`
- Font family: `"Inter", "Roboto", "Helvetica", "Arial", sans-serif`
- Supports light/dark mode toggle (stored in localStorage `theme_mode`)
- Tenant public pages create dynamic theme from tenant's `primary_color`

### Admin Layout
- Sidebar drawer width: `240px`
- Fixed AppBar with z-index above drawer
- Content area: full width minus sidebar

## Code Conventions
- `asyncHandler` wraps all Express route handlers
- Multi-tenancy: every table has `tenant_id`, every query filters by it
- Dual-router pattern: `module.exports = { adminRouter, publicRouter }`
- British English in all user-facing copy
- No emojis in code or UI unless specifically requested
