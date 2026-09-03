import "server-only";
import { verifyFirebaseBearerToken } from "../payments/firebaseBearerAuth.js";

export async function verifyFirebaseBearer(request, verifyIdToken) {
  return verifyFirebaseBearerToken(request, verifyIdToken);
}
