## Ændringer i src/index.css

Tre kirurgiske edits, ingen andre filer røres.

### 1. Mørkere kort-kontrast
I `.dark`-blokken (linje ~62):
- `--background: 170 30% 5%;` → `--background: 170 30% 8%;`

### 2. Stærkere `.glass-card`
Erstat nuværende utility (linje ~125-127):
```css
.glass-card {
  @apply bg-card/95 backdrop-blur-xl border border-border shadow-lg;
  box-shadow: inset 0 1px 0 0 hsl(0 0% 100% / 0.04), 0 10px 15px -3px hsl(0 0% 0% / 0.3), 0 4px 6px -4px hsl(0 0% 0% / 0.3);
}
```

### 3. Fjern ubrugte glass-tokens
Slet fire linjer i alt:
- `:root`-blok: `--glass: 0 0% 100% / 0.7;` og `--glass-border: 40 5% 87% / 0.5;`
- `.dark`-blok: `--glass: 170 22% 10% / 0.7;` og `--glass-border: 170 18% 18% / 0.5;`

Ingen øvrige tokens eller filer ændres. `:root` forbliver ellers urørt.
