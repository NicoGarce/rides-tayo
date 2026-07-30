"use client";

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

export interface AuthState {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    getRedirectResult(auth).catch((err) => {
      if (err.code !== "auth/credential-already-in-use") {
        console.warn("[auth] getRedirectResult", err.code);
      }
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signInWithGoogle() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "auth/popup-blocked" || err.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, googleProvider);
      } else {
        throw e;
      }
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, loading, signInWithGoogle, logout };
}
