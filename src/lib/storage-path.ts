/**
 * Validation de chemin de stockage : le chemin doit appartenir au dossier de
 * l'utilisateur et ne contenir aucun segment vide ou relatif (".", "..").
 */
export function isStoragePathAllowed(storagePath: string, userId: string) {
  const parts = storagePath.split("/");
  return (
    parts.length >= 2
    && parts[0] === userId
    && parts.every((part) => part !== "" && part !== "." && part !== "..")
  );
}
