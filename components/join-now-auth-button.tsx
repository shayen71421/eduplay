"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth";

type JoinNowAuthButtonProps = {
  className: string;
};

export default function JoinNowAuthButton({
  className,
}: JoinNowAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSignIn() {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      router.push("/dashboard");
    } catch (error) {
      console.error("Google sign-in failed", error);
      alert("Sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className={className}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.3),transparent_56%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100"
      />
      <span className="relative">{isLoading ? "SIGNING IN..." : "JOIN NOW"}</span>
    </button>
  );
}
