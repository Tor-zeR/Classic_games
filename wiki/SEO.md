# SEO

## Game Naming Strategy

All 8 games use **trademark-safe display names** while keeping original folder/URL paths unchanged (to preserve search discovery):

| Folder / URL | Display Name |
|--------------|-------------|
| `/tetris/` | Tetrix |
| `/pac-man/` | Chomp |
| `/xonix/` | Territory |
| `/space-invaders/` | Alien Wave |
| `/snake/` | Neon Serpent |
| `/berzerk/` | Robo Maze |
| `/paratrooper/` | Airborne |
| `/lode-runner/` | Gold Rush |

The `keywords` meta tag retains original game names (e.g. `"pac-man online"`) for search discovery. All other visible fields (title, descriptions, JSON-LD) use the display name.

---

## Meta Tags

Every page includes:

```html
<title>Display Name — Play Free Online | Classic Arcade</title>
<meta name="description" content="...">
<meta name="keywords" content="original game name online, ...">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://classicarcade.win/folder/">
```

## Open Graph

```html
<meta property="og:type" content="website">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:url" content="https://classicarcade.win/folder/">
<meta property="og:site_name" content="Classic Arcade">
<meta property="og:image" content="https://classicarcade.win/folder/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
```

## Twitter Card

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="https://classicarcade.win/folder/og-image.jpg">
```

## OG Images

Each page has a `og-image.jpg` (1200×630 JPEG) generated with Pillow. Images use the game's accent color on a dark background with the game title and `classicarcade.win` branding.

## Structured Data (JSON-LD)

**Landing page** — `WebSite` schema:
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Classic Arcade",
  "url": "https://classicarcade.win/",
  "description": "..."
}
```

**Game pages** — `VideoGame` + `BreadcrumbList` schemas. The `name` field uses the **display name**:
```json
{
  "@type": "VideoGame",
  "name": "Neon Serpent",
  "url": "https://classicarcade.win/snake/",
  "genre": "Arcade",
  "playMode": "SinglePlayer",
  "applicationCategory": "Game",
  "operatingSystem": "Web Browser"
}
```

## Sitemap

`sitemap.xml` at the root lists all 9 URLs with `lastmod`, `changefreq`, and `priority` (1.0 for landing, 0.8 for games).

## Robots

`robots.txt` allows all crawlers and points to the sitemap:
```
User-agent: *
Allow: /
Sitemap: https://classicarcade.win/sitemap.xml
```

## Cache Headers

Configured in `staticwebapp.config.json`:

| Route | Cache |
|-------|-------|
| `/*.jpg` | 7 days (immutable) |
| `/css/*.css` | 1 day |
| `/js/*.js` | 1 day |
| Everything else | 1 hour |
