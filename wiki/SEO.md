# SEO Architecture & Strategy

## Game Naming Strategy

All 9 games use **trademark-safe display names** while keeping original folder/URL paths unchanged (to preserve search discovery):

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
| `/highway/` | Highway Delivery |

The `keywords` meta tag retains original game names (e.g. `"pac-man online"`) for search discovery. All visible fields (title, descriptions, JSON-LD, breadcrumbs) use the display name.

---

## Meta & Branding Tags

Every page includes:

```html
<title>Display Name — Play Free Online | Classic Arcade</title>
<meta name="description" content="...">
<meta name="keywords" content="original game name online, ...">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://classicarcade.win/folder/">
<meta name="theme-color" content="#04040c">
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
<link rel="apple-touch-icon" href="/icons/icon.svg">
<link rel="manifest" href="/manifest.json">
```

---

## Open Graph & Social Sharing

All pages configure standard Open Graph (`og:type="website"`) and Twitter Card (`summary_large_image`) tags:

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

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="https://classicarcade.win/folder/og-image.jpg">
```

---

## Structured Data (JSON-LD)

**Landing page** — `WebSite` + `Organization` + `ItemList` schemas:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://classicarcade.win/#website",
      "name": "Classic Arcade",
      "url": "https://classicarcade.win/",
      "description": "Play 9 classic arcade games free in your browser. No download, no login required.",
      "publisher": {
        "@type": "Organization",
        "name": "Classic Arcade",
        "url": "https://classicarcade.win/"
      }
    },
    {
      "@type": "Organization",
      "@id": "https://classicarcade.win/#organization",
      "name": "Classic Arcade",
      "url": "https://classicarcade.win/",
      "logo": "https://classicarcade.win/icons/icon.svg"
    }
  ]
}
```

**Game pages** — `VideoGame` + `BreadcrumbList` schemas with `aggregateRating` for SERP star ratings:
```json
{
  "@type": "VideoGame",
  "name": "Neon Serpent",
  "url": "https://classicarcade.win/snake/",
  "image": "https://classicarcade.win/snake/og-image.jpg",
  "screenshot": "https://classicarcade.win/snake/og-image.jpg",
  "inLanguage": "en",
  "genre": ["Arcade"],
  "playMode": "SinglePlayer",
  "applicationCategory": "Game",
  "operatingSystem": "Web Browser",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "198",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

---

## Navigation & Clean URLs

- All internal links point directly to **clean trailing slash directory URLs** (e.g. `/snake/` or `../snake/` rather than `snake/index.html`).
- Game pages feature a semantic visual HTML `<nav class="breadcrumb-nav" aria-label="Breadcrumb">` matching the JSON-LD `BreadcrumbList`.

---

## Sitemap & Robots

- `sitemap.xml` lists all site URLs with `lastmod`, `changefreq`, and `priority`.
- `robots.txt` allows all crawlers and references `sitemap.xml`.

---

## Error Handling & Server Configuration

- **Soft 404 Prevention**: `staticwebapp.config.json` uses `"rewrite": "/404.html", "statusCode": 404` for missing routes.
- **Nginx Config**: `nginx.conf` handles 404 routes via `error_page 404 /404.html;` to preserve strict 404 HTTP status codes.
