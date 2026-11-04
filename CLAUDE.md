# Tavşanın Mutfağı · Panel — çalışma notları

Projenin bütün kararları ve kuralları uygulamanın klasöründe:
**`../loplop/CLAUDE.md`** — bu klasörde çalışırken de önce onu oku.

## Her değişiklik dört katmanda (kural 28, kullanıcı, 2026-10-18)

Burada yapılan her değişiklik ve her yeni özellik için **uygulama**
(`../loplop`), **panel** (bu klasör), **sunucu** (`../loplop-server`) ve
**veritabanı** (`../loplop-server/src/storage/sql.ts`) birlikte kontrol
edilir; gereken değişiklik aynı işte yapılır. Ayrıntılı kontrol listesi
`../loplop/CLAUDE.md` → kural 28.

- Panelin tipleri (`src/types.ts`, `src/api.ts`) sunucunun cevabıyla aynı kalır.
- Bitirmeden: burada `npm run build` ve `npm run test:e2e`; sunucuda
  `npm run typecheck` ve `npm test`; uygulamada `npm run typecheck`,
  `npm run loadcheck`, `npm run screentest`.
