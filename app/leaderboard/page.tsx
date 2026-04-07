"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, getDocs, getDoc, doc, limit, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import FlipText from "@/components/ui/flip-text";
import DotGrid from "@/components/DotGrid";
import ShapeGrid from "@/components/ShapeGrid";

type LeaderboardEntry = {
  uid: string;
  name: string;
  photoURL?: string;
  collegeName?: string;
  totalPoints: number;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        
        // Fetch user data for each leaderboard entry
        const enrichedEntries = await Promise.all(
          snap.docs.map(async item => {
            const uid = item.id;
            const totalPoints = Number(item.data().totalPoints ?? 0);
            
            // Fetch user profile data
            const userSnap = await getDoc(doc(db, "users", uid));
            const userData = userSnap.exists() ? userSnap.data() : {};
            
            return {
              uid,
              name: String(userData.name ?? userData.displayName ?? "Anonymous"),
              photoURL: String(userData.photoURL ?? ""),
              collegeName: String(userData.collegeName ?? ""),
              totalPoints,
            };
          })
        );
        
        setEntries(enrichedEntries);
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

        <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 pb-16 sm:px-6 sm:pb-20 sm:pt-8 lg:px-14">
          <header className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center gap-2 sm:gap-0">
            <div className="flex justify-start">
              <Link href="/" aria-label="Home">
                <div className="relative h-12 w-32 sm:h-[60px] sm:w-[224px] md:h-[72px] md:w-[286px] lg:h-[96px] lg:w-[350px]">
                  <Image
                    src="/edsockc.png"
                    alt="IEEE Education Society Kerala Chapter"
                    fill
                    sizes="(max-width: 640px) 128px, (max-width: 768px) 224px, (max-width: 1024px) 286px, 350px"
                    priority
                    className="translate-y-[1px] object-contain object-left sm:translate-y-[2px] lg:translate-y-[4px]"
                  />
                </div>
              </Link>
            </div>
            <div className="flex justify-center">
              <Link href="/" aria-label="Home">
                <div className="relative h-6 w-20 sm:h-8 sm:w-[118px] md:h-9 md:w-[160px] lg:h-10 lg:w-[188px]">
                  <Image
                    src="/logo.png"
                    alt="IEEE Education Week"
                    fill
                    sizes="(max-width: 640px) 80px, (max-width: 768px) 118px, (max-width: 1024px) 160px, 188px"
                    priority
                    className="object-contain object-center"
                  />
                </div>
              </Link>
            </div>
            <div className="flex justify-end">
              <Link href="/" aria-label="Home">
                <div className="relative h-6 w-14 sm:h-8 sm:w-[78px] md:h-9 md:w-[100px] lg:h-10 lg:w-[118px]">
                  <Image
                    src="/ieee.png"
                    alt="IEEE"
                    fill
                    sizes="(max-width: 640px) 56px, (max-width: 768px) 78px, (max-width: 1024px) 100px, 118px"
                    priority
                    className="object-contain object-right"
                  />
                </div>
              </Link>
            </div>
          </header>

          <section className="relative mt-8 flex w-full max-w-6xl flex-1 flex-col">
            <div className="mb-6 flex items-center justify-between sm:justify-center">
              <div className="flex-1 sm:flex-none">
                {/* Mobile: Plain text, Desktop: FlipText (only render on client after hydration) */}
                <h1 className="sm:hidden text-2xl font-semibold tracking-tight text-[#f47a20]">
                  Leaderboard
                </h1>
                {mounted && (
                  <div className="hidden sm:block">
                    <FlipText
                      className="text-center text-3xl font-semibold tracking-tight text-[#f47a20] lg:text-4xl"
                      duration={3.5}
                    >
                      Leaderboard
                    </FlipText>
                  </div>
                )}
                {!mounted && (
                  <h1 className="hidden sm:block text-center text-3xl font-semibold tracking-tight text-[#f47a20] lg:text-4xl">
                    Leaderboard
                  </h1>
                )}
              </div>
              {currentUser ? (
                <Link
                  href="/dashboard"
                  className="sm:absolute sm:right-0 rounded-full border border-white/25 px-3 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm text-white transition-colors hover:border-white/50"
                >
                  Dashboard
                </Link>
              ) : null}
            </div>

            {/* Mobile card view */}
            <div className="sm:hidden space-y-3">
              {loading ? (
                <div className="text-center py-8 text-white/60">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="text-center py-8 text-white/60">No entries yet.</div>
              ) : (
                entries.map((entry, index) => (
                  <div
                    key={entry.uid}
                    className="rounded-xl border border-[#f47a20]/30 bg-[#0b0b0b] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-lg font-bold text-[#f47a20] min-w-fit">#{index + 1}</div>
                        {entry.photoURL ? (
                          <Image
                            src={entry.photoURL}
                            alt={entry.name}
                            width={36}
                            height={36}
                            className="h-9 w-9 rounded-full object-cover border border-[#f47a20]/40"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#f47a20]/30 to-[#f47a20]/10 flex items-center justify-center text-xs font-bold text-[#f47a20] border border-[#f47a20]/40">
                            {entry.name.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold truncate">{entry.name}</span>
                          {entry.collegeName && (
                            <span className="text-xs text-white/60 truncate">{entry.collegeName}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#f47a20]">{entry.totalPoints}</div>
                        <div className="text-xs text-white/50">pts</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block overflow-hidden rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] shadow-[0_0_40px_rgba(244,122,32,0.12)]">
              <table className="w-full text-left">
                <thead className="bg-white/8 text-white/80 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-widest text-[#f47a20]">Rank</th>
                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-widest">Player</th>
                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-widest">College</th>
                    <th className="px-4 py-4 text-xs font-bold uppercase tracking-widest text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-white/60">
                        Loading...
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-white/60">
                        No entries yet.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry, index) => (
                      <tr key={entry.uid} className="border-t border-white/10 hover:bg-white/5 transition">
                        <td className="px-4 py-4 text-sm font-semibold text-[#f47a20]">#{index + 1}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {entry.photoURL ? (
                              <Image
                                src={entry.photoURL}
                                alt={entry.name}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-full object-cover border border-[#f47a20]/40 ring-1 ring-[#f47a20]/20"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#f47a20]/30 to-[#f47a20]/10 flex items-center justify-center text-sm font-bold text-[#f47a20] border border-[#f47a20]/40">
                                {entry.name.charAt(0)?.toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{entry.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-white/70">{entry.collegeName || "—"}</td>
                        <td className="px-4 py-4 text-right font-bold text-[#f47a20]">
                          {entry.totalPoints} pts
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <footer className="relative bg-transparent py-4 sm:py-5">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-4 sm:px-6 lg:px-14">
            <p className="text-xs uppercase tracking-[0.08em] text-[#6f6f83]">
              © 2026 EDSOC Kerala Chapter
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
