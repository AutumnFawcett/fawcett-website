import { doc, getDocFromServer } from "firebase/firestore";
import { WRITE_FENCE_PATH, writesOpen, maintenanceError } from "./writeFence.mjs";
export async function assertBrowserWritesOpen(database) {
  const state = await getDocFromServer(doc(database, WRITE_FENCE_PATH));
  if (!writesOpen(state.data())) throw maintenanceError();
  return state.data();
}
