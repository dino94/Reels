# Football Viral Analyzer

Application SaaS d'analyse de vidéos football courtes : extraction d'images par le navigateur, analyse multimodale Gemini, rapport Markdown et génération d'un concept de remake.

## Architecture

```text
Navigateur (Next.js App Router)
  ├─ Supabase Auth SSR + middleware de session
  ├─ Upload direct et privé vers Supabase Storage (bucket videos)
  └─ API Routes authentifiées
       ├─ POST /api/videos     crée le dossier vidéo appartenant à l'utilisateur
       ├─ DELETE /api/videos/id supprime une vidéo et ses fichiers associés
       ├─ navigateur           décode la vidéo, extrait jusqu'à 60 images clés et les dépose dans Storage
       ├─ POST /api/analyze    Storage → Gemini Vision → DB + VIDEO.md
       ├─ POST /api/translate  Storage → FFmpeg → Whisper → DB + TRANSLATION.md
       ├─ POST /api/recreate   Gemini → concept de remake → DB + REMAKE.md
       ├─ /forgot-password     demande un lien de réinitialisation Supabase Auth
       ├─ /auth/callback       échange le code de récupération contre une session
       ├─ POST /api/generate-explainer génération suspendue (410)
       ├─ POST /api/highlights FFmpeg → montage WebM avec audio
       └─ GET  /api/reports/id téléchargement privé d'un rapport

Supabase : Auth, PostgreSQL (profiles/videos/analyses/reports), Storage privé
Traitement vidéo : décodeur natif du navigateur pour l'upload, FFmpeg pour le transcodage et le montage
Analyse et remake : Gemini 3.6 Flash via Generative Language API ; accès et quotas dépendent du projet Google
Traduction audio en anglais : Whisper via l'API OpenAI ; déclenchée à la demande depuis le rapport vidéo
Vidéo IA : génération suspendue ; les vidéos déjà enregistrées restent dans Storage privé
Interface : SpotlightCard de React Bits, bouton Shiny Button de 21st.dev, transitions GSAP et défilement doux Lenis; les animations et le défilement fluide respectent le réglage système de réduction des animations
```

### 21st.dev dans VS Code

Le fichier `.mcp.json` connecte Copilot au serveur MCP de 21st.dev pour rechercher et récupérer des composants. Il référence `API_KEY_21ST` sans stocker la clé dans le dépôt. Définissez cette variable dans l'environnement utilisateur de Windows, puis redémarrez VS Code. La récupération de composants utilise le quota gratuit quotidien de 21st.dev.

### Structure

```text
src/
  app/
    actions/auth.ts
    auth/callback/route.ts
    api/{analyze,highlights,recreate,translate,videos,reports}/
    dashboard/[id]/page.tsx
    dashboard/page.tsx
    forgot-password/page.tsx
    login/page.tsx
    register/page.tsx
    reset-password/page.tsx
  components/{analysis-view,brand,dashboard-shell,upload-card}.tsx
  lib/{analysis-schema,browser-video,gemini,report,types,utils}.ts
  lib/supabase/{client,middleware,server}.ts
supabase/schema.sql
```

## Installation locale

1. Installer Node.js 20+ et un navigateur moderne compatible avec le format de la vidéo (Chrome, Edge ou Firefox).
2. Créer un projet Supabase. Dans SQL Editor, exécuter [`supabase/schema.sql`](./supabase/schema.sql). Le script crée les tables, les politiques RLS et les buckets privés. Pour un projet existant, exécuter également les migrations de [`supabase/migrations/`](./supabase/migrations). Dans **Authentication → URL Configuration**, définir `http://localhost:3000` comme Site URL et ajouter `http://localhost:3000/auth/callback` aux Redirect URLs (ajouter aussi l'URL de production si nécessaire).
3. Créer une clé Gemini AI Studio et configurer les variables :

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Renseignez `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` et `GEMINI_API_KEY`. Pour activer le bouton de traduction, renseignez aussi `OPENAI_API_KEY`. `NEXT_PUBLIC_SITE_URL` doit correspondre au domaine utilisé dans la configuration URL de Supabase Auth. `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB` permet d'ajuster la limite côté interface ; la limite du bucket Storage doit être cohérente.
4. Après avoir modifié `.env.local`, redémarrer le serveur de développement. Installer et lancer :

   ```powershell
   npm install
   npm run dev
   ```

5. Ouvrir http://localhost:3000 et créer un compte. Pour faciliter les essais, désactivez la confirmation d'email dans Supabase Auth ; sinon confirmez l'adresse avant connexion.

## Installation sur PC et mobile

L'application peut être installée depuis Chrome ou Edge sur PC et Android, et ajoutée à l'écran d'accueil depuis Safari sur iPhone/iPad. En production, le site doit être servi en HTTPS. Ouvrez le site dans le navigateur, puis choisissez **Installer l'application** (PC/Android) ou **Partager → Sur l'écran d'accueil** (iPhone/iPad). L'application installée nécessite une connexion Internet pour l'authentification, les vidéos et les analyses.

## Déploiement

Le navigateur extrait les images localement ; le serveur n'a pas besoin d'installer FFmpeg ni de télécharger le fichier vidéo complet. Les routes serveur doivent toutefois pouvoir appeler Gemini et lire les miniatures depuis Supabase Storage. Configurez les limites de requêtes et CORS de Storage selon votre domaine.

L'upload navigateur va directement dans Storage (pas au travers d'une fonction Next.js). La taille maximale est 500 Mo côté UI et bucket ; les politiques RLS imposent un préfixe de chemin correspondant à l'utilisateur. En production, préférez l'upload résumable TUS pour les connexions instables et les gros fichiers.

## Notes produit / limites

- Les vidéos importées doivent être détenues ou autorisées par l'utilisateur. Le téléchargement de liens Instagram/TikTok n'est pas inclus.
- Le navigateur extrait jusqu'à 60 images JPEG réduites à 1024 px, réparties sur toute la durée de la vidéo. La fréquence d'images (fps) n'est pas fournie par l'API vidéo du navigateur et apparaît donc comme inconnue. Les codecs pris en charge dépendent du navigateur. L'identification de musique et de texte peut être incertaine ; le résultat est indicatif, pas une prédiction de vues.
- `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB` règle la limite côté interface ; elle doit correspondre à la limite du bucket Storage.
- Les fichiers vidéo restent dans le bucket privé ; `VIDEO.md` et `REMAKE.md` sont téléchargeables après vérification de session.
- Le dashboard et la page « Mes analyses » permettent de renommer chaque vidéo et de la supprimer après confirmation ; ses miniatures, rapports, analyses et fichiers associés sont également supprimés.
- La génération vidéo par API est temporairement suspendue : `/api/generate-explainer` renvoie `410 Gone` sans contacter Google. Les vidéos précédemment créées restent accessibles depuis les rapports.
- Le montage des temps forts inclut par défaut toutes les scènes valides de l’analyse (les scènes qui se chevauchent sont fusionnées). FFmpeg découpe directement la vidéo stockée et assemble les pistes vidéo/audio, avec un fondu de 0,5 s entre les passages. Le résultat est vertical 9:16 : l’image source entière reste visible au premier plan et un fond flouté remplit l’espace, sans couper l’action. Aucun service vidéo ni API IA n’est appelé. FFmpeg doit être installé pour créer le montage.
- Si le navigateur ne peut pas décoder un fichier vidéo, l'application le convertit automatiquement en MP4 H.264 avant l'analyse. FFmpeg doit être installé sur le serveur local et accessible dans le `PATH`, ou configuré avec `FFMPEG_PATH`.
- Le bouton **Traduire en anglais** extrait l'audio avec FFmpeg et utilise Whisper (`whisper-1`, API OpenAI). L'audio est découpé en segments, puis la traduction anglaise est affichée et enregistrée comme `TRANSLATION.md`. Cette traduction intégrée cible uniquement l'anglais ; une autre langue nécessite une étape de traduction distincte. L'accès à l'API OpenAI et ses frais dépendent de la clé configurée.
