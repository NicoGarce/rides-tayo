"use client";

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, GOOGLE_CLIENT_ID } from "@/lib/firebase";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.google?.accounts) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load GIS"));
    document.head.appendChild(s);
  });
}

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

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signInWithGoogle() {
    if (!GOOGLE_CLIENT_ID) {
      console.error("[auth] Missing NEXT_PUBLIC_FIREBASE_WEB_CLIENT_ID");
      return;
    }

    await loadGis();

    const accessToken = await new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID!,
        scope: "profile email",
        callback: (resp) => {
          if (resp.error) reject(new Error(resp.error));
          else resolve(resp.access_token!);
        },
      });
      client.requestAccessToken();
    });

    const credential = GoogleAuthProvider.credential(null, accessToken);
    await signInWithCredential(auth, credential);
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, loading, signInWithGoogle, logout };
}
