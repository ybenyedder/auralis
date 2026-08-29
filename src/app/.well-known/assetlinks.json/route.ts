// Déclaration Digital Asset Links pour le package Android publié sur le
// Google Play Store (voir PLAYSTORE.md). Google lit
// https://<domaine>/.well-known/assetlinks.json pour vérifier que l'application
// TWA qui encapsule ce site est bien signée par le même opérateur.
//
// La route n'est active que si l'opérateur a défini les deux variables
// d'environnement AURALIS_PLAYSTORE_PACKAGE et AURALIS_PLAYSTORE_FINGERPRINT.
// Sans elles, on répond 404 : mieux vaut aucune déclaration qu'une déclaration
// mensongère (un nom de package ou une empreinte incorrects feraient échouer
// la vérification avec un message trompeur).
//
// Alternative sans variable d'environnement : déposer un fichier statique dans
// public/.well-known/assetlinks.json (dans ce cas, ne PAS définir les variables
// pour éviter deux sources de vérité).

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Indispensable : sans cela, la route serait évaluée à la compilation (au moment
// du `next build` Docker, où les variables ne sont pas définies) et la réponse
// 404 serait mise en cache pour toujours.
export const dynamic = "force-dynamic";

/** Empreinte SHA-256 attendue : 64 caractères hexadécimaux. */
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;

export async function GET() {
  const packageName = process.env.AURALIS_PLAYSTORE_PACKAGE?.trim() ?? "";
  const rawFingerprint = process.env.AURALIS_PLAYSTORE_FINGERPRINT?.trim() ?? "";

  if (!packageName || !rawFingerprint) {
    return NextResponse.json(
      {
        error:
          "Aucune déclaration assetlinks.json configurée. Définissez AURALIS_PLAYSTORE_PACKAGE et AURALIS_PLAYSTORE_FINGERPRINT, ou déposez un fichier public/.well-known/assetlinks.json.",
      },
      { status: 404 },
    );
  }

  // keytool affiche l'empreinte SHA-256 en hexadécimal majuscule séparé par des
  // deux-points (AA:BB:...) ; la déclaration attend de l'hexadécimal minuscule
  // sans séparateur. On accepte les deux formes.
  const fingerprint = rawFingerprint.replace(/:/g, "").toLowerCase();
  if (!FINGERPRINT_RE.test(fingerprint)) {
    return NextResponse.json(
      {
        error:
          "AURALIS_PLAYSTORE_FINGERPRINT invalide : empreinte SHA-256 attendue en hexadécimal (64 caractères, avec ou sans deux-points).",
      },
      { status: 500 },
    );
  }

  const statement = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ];

  const res = NextResponse.json(statement);
  // Le vérificateur de Google met ce fichier en cache ; une heure suffit pour
  // rendre visible un changement de clé de signature sans re-soumission.
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
