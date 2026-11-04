import { Route, Routes } from "react-router-dom";
import { UsersPage } from "./pages/UsersPage";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Categories } from "./pages/Categories";
import { CategoryFlow, CategoryNew } from "./pages/CategoryFlow";
import { WordSets } from "./pages/WordSets";
import { WordSetEdit } from "./pages/WordSetEdit";
import { Games } from "./pages/Games";
import { GameEdit } from "./pages/GameEdit";
import { GameNew } from "./pages/GameNew";
import { MediaLibrary } from "./pages/MediaLibrary";
import { VoiceStudio } from "./pages/VoiceStudio";
import { ImageStudio } from "./pages/ImageStudio";
import { Words } from "./pages/Words";
import { Publish } from "./pages/Publish";
import { AppInventory } from "./pages/AppInventory";
import { Jobs } from "./pages/Jobs";
import { RoadSlideEdit, RoadmapPage } from "./pages/RoadmapPage";
import { PackEdit, PacksPage } from "./pages/PacksPage";
import { MascotEdit, MascotsPage } from "./pages/MascotsPage";
import { MusicPage, SongEdit } from "./pages/MusicPage";
import { FontsPage } from "./pages/FontsPage";
import { PalettesPage } from "./pages/PalettesPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="kategoriler" element={<Categories />} />
        <Route path="kategoriler/yeni" element={<CategoryNew />} />
        <Route path="kategoriler/:id" element={<CategoryFlow />} />
        <Route path="yol-haritasi" element={<RoadmapPage />} />
        <Route path="yol-haritasi/:id" element={<RoadSlideEdit />} />
        <Route path="paketler" element={<PacksPage />} />
        <Route path="paketler/:id" element={<PackEdit />} />
        <Route path="maskotlar" element={<MascotsPage />} />
        <Route path="maskotlar/:id" element={<MascotEdit />} />
        <Route path="muzik" element={<MusicPage />} />
        <Route path="muzik/:id" element={<SongEdit />} />
        <Route path="yazi-tipi" element={<FontsPage />} />
        <Route path="renk-paleti" element={<PalettesPage />} />
        <Route path="kelime-setleri" element={<WordSets />} />
        <Route path="kelime-setleri/:id" element={<WordSetEdit />} />
        <Route path="kelimeler" element={<Words />} />
        <Route path="yayinla" element={<Publish />} />
        <Route path="uygulama" element={<AppInventory />} />
        <Route path="uretim-isleri" element={<Jobs />} />
        <Route path="oyunlar" element={<Games />} />
        <Route path="oyunlar/yeni" element={<GameNew />} />
        <Route path="oyunlar/:id" element={<GameEdit />} />
        <Route path="medya" element={<MediaLibrary />} />
        <Route path="ses-studyosu" element={<VoiceStudio />} />
        <Route path="gorsel-studyosu" element={<ImageStudio />} />
        <Route path="kullanicilar" element={<UsersPage />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
