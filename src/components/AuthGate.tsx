"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import HomeView from "@/views/HomeView";
import AuthView from "@/views/AuthView";
import { AuthService } from "@/services/AuthService";

export default function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return AuthService.subscribe(setUser);
  }, []);

  if (user === undefined) {
    return (
      <main className="flex h-screen items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/75">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          Checking authentication...
        </div>
      </main>
    );
  }

  return user ? <HomeView /> : <AuthView />;
}
