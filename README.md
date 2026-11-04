# Tavşanın Mutfağı · Yönetim paneli

Uygulamanın (`../loplop`) içerik yönetimi. Bütün veri ve dosyalar sunucuda
(`../loplop-server`); API anahtarları da orada. Panel bir **taslak** düzenler;
telefonlar yalnızca **Yayınla** sayfasından çıkan yayınları görür.
Mimari ve "ne uygulama güncellemesi ister": 
[`../loplop/docs/ICERIK-MIMARISI.md`](../loplop/docs/ICERIK-MIMARISI.md).

```bash
cd ../loplop-server && npm run dev   # önce sunucu
npm run dev                          # http://localhost:5173  (/api → 127.0.0.1:8787)
API_TARGET=http://127.0.0.1:8788 npm run dev   # başka bir sunucuya (ör. test)
npm run build
```

**Giriş (`AuthGate`).**

- Sunucuda hesaplar açıksa (Supabase, 2026-10-22) panel e-posta koduyla, Google ya da Apple ile açılır. Yalnız yöneticiler listesindeki e-posta girer; başka bir hesap "yetki yok" ekranını görür.
- Hesaplar kapalıysa, sunucu `ADMIN_TOKEN` ile açıldıysa panel bir kez anahtar sorar ve bu tarayıcıda saklar.
- Resim, ses ve video adreslerinde anahtar değil, saatlik salt okunur bir medya belirteci olur; dosya baytları başlıkla alınır.
- **Kullanıcılar** sayfası: hesaplar (arama, yedek özeti, engelle, yedeği sil, sil), yöneticiler (ekle/çıkar), işlem kaydı.
- Ayrıntı: `../loplop/docs/HESAPLAR.md`.

```bash
npm run test:e2e   # başsız Chrome + geçici sunucu: kayıt kuyruğu, iki sekme,
                   # yavaş/çevrimdışı kayıt, yayın anlık görüntüsü, ücretli işler;
                   # sonra tests/accounts.mjs: sahte Supabase'le giriş ve Kullanıcılar
```

## Sayfalar

- **Genel bakış** — sayılar, yayınlanmamış değişiklik, yapılacaklar (hatalı
  oyun/kategori, resmi ya da kaydı eksik setler).
- **Kategoriler** — uygulamanın altı kategorisi salt gösterilir. Yeni kategori
  dört adımlı bir sihirbazla kurulur (`/kategoriler/yeni`, sonra
  `/kategoriler/<id>?adim=kelimeler|akis|yayin`): **Kart** (başlık, resim),
  **Kelimeler** (yeni set ya da var olan; kelimeler aynı ekranda eklenir),
  **Akış** (açılış ve geçiş videoları, üç oyun — Lili'ye ver → Bul bakalım →
  kartsız tekrar hazır gelir), **Kontrol ve yayın** (sorunlar adım adım,
  indirme boyutu, durum). Video yüklenirken ilerleme gösterilir; önizleme
  telefon (19,5:9) ve tablet (4:3) çerçevesinde kırpmayı gösterir;
  "Tamamını göster" (`fit: contain`) telefona kadar gider. Her değişiklik bir
  an sonra kaydedilir; sorunları sunucu söyler, her biri adımını (`area`) taşır.
- **Oyunlar** — uygulamanın 52 motoru ve panelde yapılan oyunlar. **Yeni oyun**:
  açık bir motor (Lili'ye ver, Bul bakalım) + ad + kart resmi + set.
- **Kelime setleri** — sıralı kelime listesi; kütüphaneden ekle ya da yeni
  kelime; hazırlık ölçerleri; seti oynatanlar.
- **Kelime kütüphanesi** — her kelime bir kez: İngilizce, Türkçe, açıklama
  (kural 10), tür, renk, resim ve kayıt yuvaları (öğretmen: kelime, Türkçesi,
  açıklama ve cümle cümle açıklama; Kuki: tekrar; kendi sesi). Uygulamanın
  kendi kelimelerine yalnızca kayıt verilir.
- **Ses stüdyosu** — kaydedilmesi gereken her satır: her kelimenin satırları
  ve sahne/oyun cümleleri, uygulamanın klip adlarıyla (`teacher/en_dog`).
  ElevenLabs (maliyet onayıyla) ya da yükleme; seçilen deneme kelimeye yazılır
  ve bir sonraki yayınla telefonda paketteki kaydın yerine çalar.
- **Görsel stüdyosu** — ikon ve arka plan üretimi (OpenAI / Gemini), kelimeye atama.
- **Medya kütüphanesi** — dosyalar, nerede kullanıldıkları, artık temizliği.
- **Yayınla** — ne gidecek, yayını ne durduruyor, test/üretim kanalına göre
  fark; teste yayınla, üretime al, geri al.
- **Uygulama** — envanter: açık/kapalı motorlar, canlı sahneler, bilinen
  sürümler; ne güncelleme ister, ne istemez.

## Kayıt güvenilirliği

- **Kategoriler** sayfanın ömründen bağımsız bir kuyrukla kaydedilir
  (`categories.tsx`): hemen başka sayfaya geçmek düzenlemeyi kaybettirmez;
  çevrimdışında geri çekilerek yeniden denenir; başka sekmenin değişikliği
  ezilmez (çakışma: sunucudakini al / benimkini yaz); kapanan sekmenin
  taslağı bu tarayıcıda geri yüklenebilir.
- **Stüdyo belgesi** tek bir yeniden deneme politikasıyla kaydedilir;
  sunucuya ulaşmamış değişiklik bir sonraki açılışta önerilir, kendiliğinden
  yazılmaz.
- **Yayınla**, önce bütün bekleyen kayıtları gönderip bekler; gösterdiği
  taslağı yayınlar (parmak izi), arada değiştiyse yeniden gösterir.
- **Silme** sunucunun kullanım bilgisine dayanır; reddedilen silme listeden
  düşmez, nedeni yazılır.

## Kod

Sunucuyla konuşan her şey `src/api.ts`. Durum: `games.tsx`, `categories.tsx`,
`vocab.tsx` (kelimeler, setler, envanter) sunucudan okur ve yalnız sunucu
üzerinden değişir; `store.tsx` stüdyo belgesini (sesler, sabit cümleler,
denemeler, görsel üretimleri) revizyonlu kaydeder ve dosya listesini tutar.

**Arayüz: [shadcn/ui](https://ui.shadcn.com/)** (Radix, Tailwind v4; 2026-10-16).
Bileşenler `src/components/ui/` içinde, shadcn CLI'nin çıktısıdır — yeni bir
tane `npx shadcn@latest add <ad>` ile eklenir, elle yazılmaz. Panelin kendi
parçaları (sayfa başlığı, etiketli alan, durum hapı, diyalog, uyarı, boş
durum) `src/components/common.tsx`'te ve hepsi shadcn'den kurulu. Tema
`src/index.css`'teki değişkenler (mor `--primary`, `--success`, `--warning`);
açık/koyu/sistem seçimi üst çubukta. Seçim kutuları bilerek tarayıcının kendi
`select`'i (shadcn `NativeSelect`): hızlı, erişilebilir ve uçtan uca test
onları doğrudan sürüyor.
