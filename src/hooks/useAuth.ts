"use client";

import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const EMAIL_KEY = "ridesTayoEmail";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface AuthState {
  user: AppUser | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

function getSavedEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_KEY);
}

function buildUser(firebaseUser: User): AppUser | null {
  const email = getSavedEmail();
  return email
    ? { uid: firebaseUser.uid, email, displayName: email.split("@")[0] }
    : null;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(buildUser(firebaseUser));
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      throw new Error("Please enter an email address.");
    }

    window.localStorage.setItem(EMAIL_KEY, trimmed);

    /* onAuthStateChanged will pick up the existing session and build the user */
    const fbUser = auth.currentUser;
    if (fbUser) {
      setUser(buildUser(fbUser));
    } else {
      await signInAnonymously(auth);
    }
  }, []);

  async function logout() {
    window.localStorage.removeItem(EMAIL_KEY);
    await signOut(auth);
    setUser(null);
  }

  return { user, loading, signInWithEmail, logout };
}
