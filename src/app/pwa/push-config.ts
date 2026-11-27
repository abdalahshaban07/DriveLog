/**
 * Background reminders (Web Push). All three values come from the user's own free
 * Firebase project and VAPID key pair. Empty means the feature is off and the
 * toggle is hidden. None of these is a secret: the web API key only names the
 * project, and Firestore rules decide what a device may write.
 */
export const PUSH_CONFIG = {
  vapidPublicKey: '',
  firebaseProjectId: '',
  firebaseApiKey: '',
} as const;

export function pushConfigured(): boolean {
  return Boolean(
    PUSH_CONFIG.vapidPublicKey && PUSH_CONFIG.firebaseProjectId && PUSH_CONFIG.firebaseApiKey,
  );
}
