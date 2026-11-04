/**
 * The studio's starting document: the fixed lines the app needs recorded
 * (scenes and games -- copied from `src/content/locales/tr.ts`), the voice
 * defaults of `scripts/gen-voice.mjs`, and the image settings.
 *
 * Words, word sets, games and categories are NOT here any more: they are the
 * server's (`/api/words`, `/api/sets`, ...) and the app's own arrive with its
 * inventory (`npm run inventory` in the app).
 */
import type { Db, FixedLine, VoiceProfile } from "./types";

const lines: FixedLine[] = [
 {
  "clip": "otter/hello_o",
  "speaker": "otter",
  "text": "Merhaba arkadaşım!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/hello_b",
  "speaker": "bunny",
  "text": "Merhaba! Nasılsın?",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/glad_o",
  "speaker": "otter",
  "text": "Seni gördüğümüze çok sevindik!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/hungry_b",
  "speaker": "bunny",
  "text": "Ay... Karnım çok acıktı.",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/go_kitchen",
  "speaker": "otter",
  "text": "Hadi mutfağa gidelim ve bir şeyler yiyelim!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/yay_b",
  "speaker": "bunny",
  "text": "Yaşasın!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/come_too",
  "speaker": "otter",
  "text": "Hadi, sen de gel! Bize yardım et, bir şeyler bulup yiyelim.",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/want_b",
  "speaker": "bunny",
  "text": "Biz bir pikniğe gitmek istiyoruz!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/basket_o",
  "speaker": "otter",
  "text": "Ama önce bu sepeti hazırlamalıyız.",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/help_b",
  "speaker": "bunny",
  "text": "Hadi, sepeti hazırlamamıza yardım et!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/rule_o",
  "speaker": "otter",
  "text": "Elif Öğretmen söyleyecek, sen bulup sepete koy!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/yay_pic_b",
  "speaker": "bunny",
  "text": "Yaşasın, piknikteyiz!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/day_o",
  "speaker": "otter",
  "text": "Ne güzel bir gün!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "bunny/lay_b",
  "speaker": "bunny",
  "text": "Hadi yemekleri dizip keyif yapalım!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "otter/help_pic_o",
  "speaker": "otter",
  "text": "Sen de gel, yemekleri tabağa dizmemize yardım et!",
  "group": "Mutfak · sahneler"
 },
 {
  "clip": "teacher/find_open",
  "speaker": "teacher",
  "text": "Hadi, birlikte Lili ile Kuki'ye yardım edelim! Piknik sepetini hazırlasınlar.",
  "group": "Mutfak · oyun açılışları"
 },
 {
  "clip": "teacher/find_how",
  "speaker": "teacher",
  "text": "Ben bir yiyecek söyleyeceğim. Sen onu bul ve sepete koy.",
  "group": "Mutfak · oyun açılışları"
 },
 {
  "clip": "teacher/picnic_open",
  "speaker": "teacher",
  "text": "Ne güzel bir piknik! Lili ile Kuki'nin tabağını birlikte dolduralım.",
  "group": "Mutfak · oyun açılışları"
 },
 {
  "clip": "teacher/picnic_how",
  "speaker": "teacher",
  "text": "Ben söyleyeceğim, sen bulup tabağa koy.",
  "group": "Mutfak · oyun açılışları"
 },
 {
  "clip": "otter/ride_o",
  "speaker": "otter",
  "text": "Hadi gel! Hayvan arkadaşlarımızı bir bir trene bindirelim.",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "bunny/hide_b",
  "speaker": "bunny",
  "text": "Sonra onlarla ormana gidip saklambaç oynayalım!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "otter/what_o",
  "speaker": "otter",
  "text": "Evet arkadaşım, biz ve hayvan dostlarımız şu an ormana ulaştık. Şimdi burada ne yapalım? Ne oynayalım?",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "otter/seek_o",
  "speaker": "otter",
  "text": "Hadi gelin, birlikte saklambaç oynayalım!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "bunny/find_b",
  "speaker": "bunny",
  "text": "Yaşasın! Hadi, ben de bulacağım!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "bunny/shut_b",
  "speaker": "bunny",
  "text": "Gözlerimizi kapatalım, sayalım!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "otter/count_o",
  "speaker": "otter",
  "text": "Bir, iki, üç!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "otter/trip_day_o",
  "speaker": "otter",
  "text": "Ne güzel bir gün geçirdik! Çok güzel oyunlar oynadık, saklambaç oynadık, çok eğlendik.",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "otter/trip_photo_o",
  "speaker": "otter",
  "text": "Hadi, hatıra olsun diye gelin birlikte burada fotoğraf çektirelim ve hepsini albümde toplayalım!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "bunny/trip_yay_b",
  "speaker": "bunny",
  "text": "Yuhuu, çok güzel! Fotoğraf çektirmeyi de çekmeyi de çok seviyorum!",
  "group": "Hayvanlar · sahneler"
 },
 {
  "clip": "teacher/train_find",
  "speaker": "teacher",
  "text": "Hadi onu bulalım!",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/seek_open",
  "speaker": "teacher",
  "text": "Trenle ormana geldik! Hayvan arkadaşlarımız ağaçların ve çalıların arkasına saklanmış.",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/seek_how",
  "speaker": "teacher",
  "text": "Hadi gel, birlikte bulalım! Ben adını söyleyeceğim, sen saklandığı yere dokun.",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_trip",
  "speaker": "teacher",
  "text": "Hayvan dostlarımızla birlikte bir geziye çıktık. Gezinin sonunda şimdi burada hatıra fotoğrafları çekeceğiz.",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_demo_tap",
  "speaker": "teacher",
  "text": "Fotoğraf çekmek için önce doğru hayvan arkadaşımızın üzerine dokunacağız.",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_demo_shoot",
  "speaker": "teacher",
  "text": "Sonra da bu düğmeye basıp fotoğrafı çekeceğiz.",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_demo_help",
  "speaker": "teacher",
  "text": "Ben de bu fotoğraf çekiminde sana yardım edeceğim.",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_go",
  "speaker": "teacher",
  "text": "Hadi, oyuna başlıyoruz!",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_ask",
  "speaker": "teacher",
  "text": "Hadi onun fotoğrafını çekelim!",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_no",
  "speaker": "teacher",
  "text": "Hmm, o değil. Biz şunu arıyoruz:",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_help",
  "speaker": "teacher",
  "text": "Bak, işte burada!",
  "group": "Hayvanlar · oyunlar"
 },
 {
  "clip": "teacher/photo_done",
  "speaker": "teacher",
  "text": "Albüm doldu! Ne güzel bir gezi oldu.",
  "group": "Hayvanlar · oyunlar"
 }
] as FixedLine[];

/** the app's own generation settings (`scripts/gen-voice.mjs`): eleven_v3,
 *  similarity 0.8, style 0.28 for the teacher and 0.55 for the peers, speed 0.92 */
const voices: VoiceProfile[] = [
  { speaker: "teacher", voiceId: "", model: "eleven_v3", similarity: 0.8, style: 0.28, speed: 0.92 },
  { speaker: "otter", voiceId: "", model: "eleven_v3", similarity: 0.8, style: 0.55, speed: 0.92 },
  { speaker: "bunny", voiceId: "", model: "eleven_v3", similarity: 0.8, style: 0.55, speed: 0.95 },
];

export function seed(): Db {
  return { version: 1, assets: [], voices, lines, takes: [], directions: {}, seed: 4242, gens: [],
           imageSettings: { provider: "openai", openaiModel: "gpt-image-1", geminiModel: "gemini-2.5-flash-image" },
           languages: [], i18n: {}, localeApproved: {}, pron: {}, workshop: [] };
}
