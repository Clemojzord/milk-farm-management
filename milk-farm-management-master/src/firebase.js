import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const FIRESTORE_DOC = ['app', 'state']
let db = null

export async function initFirebase() {
  try {
    if (import.meta.env.VITE_FIREBASE_ENABLED !== 'true') return null
    const cfg = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }

    initializeApp(cfg)
    db = getFirestore()

    // return remote data if available so caller can merge it into localStorage
    try {
      const dref = doc(db, FIRESTORE_DOC[0], FIRESTORE_DOC[1])
      const snap = await getDoc(dref)
      if (snap.exists()) return snap.data().data || null
    } catch (e) {
      console.error('initFirebase: failed to load remote data', e)
    }

  } catch (e) {
    console.error('initFirebase error', e)
  }

  return null
}

export async function saveRemote(data) {
  if (!db) return
  try {
    const dref = doc(db, FIRESTORE_DOC[0], FIRESTORE_DOC[1])
    await setDoc(dref, { data, updatedAt: Date.now() })
  } catch (e) {
    console.error('saveRemote error', e)
  }
}

export async function loadRemote() {
  if (!db) return null
  try {
    const dref = doc(db, FIRESTORE_DOC[0], FIRESTORE_DOC[1])
    const snap = await getDoc(dref)
    return snap.exists() ? snap.data().data : null
  } catch (e) {
    console.error('loadRemote error', e)
    return null
  }
}

export default { initFirebase, saveRemote, loadRemote }
