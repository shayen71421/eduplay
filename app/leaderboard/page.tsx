"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DotGrid from "@/components/DotGrid";
import ShapeGrid from "@/components/ShapeGrid";

type LeaderboardEntry = {
  uid: string;
  name: string;
  photoURL?: string;
  totalPoints: number;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function loadTop10() {
      try {
        const topQuery = query(
          collection(db, "leaderboard"),
          orderBy("totalPoints", "desc"),
          limit(10)
        );
        const snap = await getDocs(topQuery);
        setEntries(
          snap.docs.map(item => ({
            uid: item.id,
            name: String(item.data().name ?? "Anonymous"),
            photoURL: String(item.data().photoURL ?? ""),
            totalPoints: Number(item.data().totalPoints ?? 0),
          }))
        );
      } finally {
        setLoading(false);
      }
    }

    void loadTop10();
  }, []);

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] selection:bg-white selection:text-black">
      <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 h-full w-full sm:hidden">
          <ShapeGrid
            direction="diagonal"
            speed={0.25}
            borderColor="#2b2b2b"
            squareSize={34}
            hoverFillColor="#141414"
            shape="square"
            hoverTrailAmount={0}
            className="h-full w-full"
          />
        </div>
        <div className="pointer-events-auto absolute inset-0 -z-10 hidden h-full w-full sm:block">
          <DotGrid
            dotSize={3}
            gap={30}
            baseColor="#2a2a2a"
            activeColor="#f47a20"
            className="h-full w-full"
            style={{}}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-36 left-1/2 h-[520px] w-[780px] -translate-x-1/2 rounded-full border border-[#f47a20]/30 blur-3xl -z-5 bg-[#f47a20]/5"
        />

        <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 pb-20 pt-8 sm:px-10 lg:px-14">
          <header className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center">
            <div className="flex justify-start">
              <Link href="/" aria-label="Home">
                <div className="relative h-[60px] w-[224px] sm:h-[72px] sm:w-[286px] lg:h-[96px] lg:w-[350px]">
                  <Image
                    src="/edsockc.png"
                    alt="IEEE Education Society Kerala Chapter"
                    fill
                    sizes="(max-width: 640px) 224px, (max-width: 1024px) 286px, 350px"
                    priority
                    className="translate-y-[2px] object-contain object-left sm:translate-y-[3px] lg:translate-y-[4px]"
                  />
                </div>
              </Link>
            </div>
            <div className="flex justify-center">
              <Link href="/" aria-label="Home">
                <div className="relative h-8 w-[118px] sm:h-9 sm:w-[160px] lg:h-10 lg:w-[188px]">
                  <Image
                    src="/logo.png"
                    alt="IEEE Education Week"
                    fill
                    sizes="(max-width: 640px) 118px, (max-width: 1024px) 160px, 188px"
                    priority
                    className="object-contain object-center"
                  />
                </div>
              </Link>
            </div>
            <div className="flex justify-end">
              <Link href="/" aria-label="Home">
                <div className="relative h-8 w-[78px] sm:h-9 sm:w-[100px] lg:h-10 lg:w-[118px]">
                  <Image
                    src="/ieee.png"
                    alt="IEEE"
                    fill
                    sizes="(max-width: 640px) 78px, (max-width: 1024px) 100px, 118px"
                    priority
                    className="object-contain object-right"
                  />
                </div>
              </Link>
            </div>
          </header>

          <section className="relative mt-8 flex w-full max-w-6xl flex-1 flex-col">
            <div className="mb-6 flex items-center justify-center">
              <h1 className="text-center text-3xl font-semibold tracking-tight text-[#f47a20] sm:text-4xl">
                Leaderboard
              </h1>
              {currentUser ? (
                <Link
                  href="/dashboard"
                  className="absolute right-0 rounded-full border border-white/25 px-4 py-2 text-sm text-white transition-colors hover:border-white/50"
                >
                  Dashboard
                </Link>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] shadow-[0_0_40px_rgba(244,122,32,0.12)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-white/60">
                        Loading...
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-white/60">
                        No entries yet.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry, index) => (
                      <tr key={entry.uid} className="border-t border-white/10">
                        <td className="px-4 py-3">#{index + 1}</td>
                        <td className="px-4 py-3">{entry.name}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#f47a20]">
                          {entry.totalPoints}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <footer className="relative bg-transparent py-5">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-6 sm:px-10 lg:px-14">
            <p className="text-xs uppercase tracking-[0.08em] text-[#6f6f83] sm:text-sm">
              © 2026 EDSOC Kerala Chapter
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
