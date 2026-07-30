"use client";

import { useState, useEffect, useCallback } from "react";

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

function emailToUser(email: string): AppUser {
  return {
    uid: email,
    email,
    displayName: email.split("@")[0],
  };
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(EMAIL_KEY);
    if (saved) {
      setUser(emailToUser(saved));
    }
    setLoading(false);
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      throw new Error("Please enter an email address.");
    }
    window.localStorage.setItem(EMAIL_KEY, trimmed);
    setUser(emailToUser(trimmed));
  }, []);

  async function logout() {
    window.localStorage.removeItem(EMAIL_KEY);
    setUser(null);
  }

  return { user, loading, signInWithEmail, logout };
}
