/**
 * Background reminders (Web Push). All three values come from the user's own free
 * Firebase project and VAPID key pair. Empty means the feature is off and the
 * toggle is hidden. None of these is a secret: the web API key only names the
 * project, and Firestore rules decide what a device may write.
 */
export const PUSH_CONFIG = {
  vapidPublicKey: 'BOUZsqSsxAQS5iQ5FqAMVigpBe-vqAlLVcmPbXFfgkMD2B5I90Srz04Doo_YWrfcMP7CGAN-KR3Faf80HC9Nw0Y',
  firebaseProjectId: 'drivelog-push',
  firebaseApiKey: 'AIzaSyDvhy_E-dY4-KasS9cXu6AxJsVaK-9U2uE',
} as const;

export function pushConfigured(): boolean {
  return Boolean(
    PUSH_CONFIG.vapidPublicKey && PUSH_CONFIG.firebaseProjectId && PUSH_CONFIG.firebaseApiKey,
  );
}
