"use client";

import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const EMAIL_KEY = "ridesTayoEmail";

export interface AuthState {
  user: User | null;
  loading: boolean;
  sendOtp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* handle email link sign-in on page load */
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    if (typeof window !== "undefined" && isSignInWithEmailLink(auth, window.location.href)) {
      const email = window.localStorage.getItem(EMAIL_KEY);
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem(EMAIL_KEY);
            window.history.replaceState({}, "", window.location.pathname);
          })
          .catch((err) => {
            console.warn("[auth] email link sign-in failed", err.code);
            window.localStorage.removeItem(EMAIL_KEY);
          });
      }
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const sendOtp = useCallback(async (email: string) => {
    const actionCodeSettings = {
      url: typeof window !== "undefined" ? window.location.href : "",
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem(EMAIL_KEY, email);
  }, []);

  async function logout() {
    await signOut(auth);
  }

  return { user, loading, sendOtp, logout };
}
