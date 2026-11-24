/**
 * Messages d'authentification : les pages ne reçoivent qu'un CODE dans l'URL
 * (?error=…&message=…) et affichent le texte correspondant de cette table.
 * Le paramètre d'URL n'est jamais affiché tel quel.
 */
export const authErrorMessages: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  invalid_email: "Adresse email invalide.",
  weak_password: "Le mot de passe doit contenir au moins 8 caractères.",
  password_mismatch: "Les mots de passe ne correspondent pas.",
  register_failed: "Impossible de créer le compte. Réessayez.",
  redirect_url_missing: "URL de retour non configurée. Contactez l'administrateur.",
  reset_send_failed: "Impossible d'envoyer le lien. Réessayez plus tard.",
  link_expired: "Le lien a expiré. Demandez-en un nouveau.",
  update_failed: "La mise à jour a échoué. Réessayez.",
  invalid_display_name: "Le pseudo doit contenir entre 2 et 32 caractères.",
  profile_update_failed: "Impossible de modifier le pseudo. Réessayez.",
  password_update_failed: "Impossible de modifier le mot de passe. Réessayez.",
};

export const authInfoMessages: Record<string, string> = {
  verify_email: "Vérifiez votre email pour confirmer votre compte.",
  reset_sent: "Si un compte correspond à cette adresse, un lien de réinitialisation a été envoyé.",
  profile_updated: "Votre pseudo a été mis à jour.",
  password_updated: "Votre mot de passe a été mis à jour.",
};

export function authErrorMessage(code: string | undefined) {
  return code ? authErrorMessages[code] : undefined;
}

export function authInfoMessage(code: string | undefined) {
  return code ? authInfoMessages[code] : undefined;
}
