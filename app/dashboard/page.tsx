"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { signOutUser } from "@/lib/auth";
import DotGrid from "@/components/DotGrid";
import ShapeGrid from "@/components/ShapeGrid";

type Day1Data = {
  totalPoints?: number;
  quizCorrect?: number;
};

type UserProfile = {
  name?: string;
  email?: string;
  photoURL?: string;
  collegeName?: string;
};

const challengeDays = [
  { day: 1, date: "Apr 11" },
  { day: 2, date: "Apr 12" },
  { day: 3, date: "Apr 13" },
  { day: 4, date: "Apr 14" },
  { day: 5, date: "Apr 15" },
  { day: 6, date: "Apr 16" },
  { day: 7, date: "Apr 17" },
  { day: 8, date: "Apr 18" },
  { day: 9, date: "Apr 19" },
];

const CHALLENGE_START_DATE_IST = new Date("2026-04-10T21:00:00+05:30");
const CHALLENGE_TOTAL_DAYS = challengeDays.length;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [day1Data, setDay1Data] = useState<Day1Data | null>(null);
  const [profile, setProfile] = useState<UserProfile>({});
  const [profileDraft, setProfileDraft] = useState({ name: "", collegeName: "" });
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [rank, setRank] = useState<string | number>("-");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      if (!currentUser) {
        router.replace("/");
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const dayRef = doc(db, "users", currentUser.uid, "days", "day1");
      const daySnap = await getDoc(dayRef);
      if (daySnap.exists()) {
        setDay1Data(daySnap.data() as Day1Data);
      }

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? (userSnap.data() as UserProfile) : {};
      setProfile(userData);
      setProfileDraft({
        name: userData.name || currentUser.displayName || "",
        collegeName: userData.collegeName || "",
      });

      const leaderboardRef = doc(db, "leaderboard", currentUser.uid);
      const leaderboardSnap = await getDoc(leaderboardRef);
      if (leaderboardSnap.exists()) {
        const userPoints = Number(leaderboardSnap.data().totalPoints ?? 0);
        const higherScoresQuery = query(
          collection(db, "leaderboard"),
          where("totalPoints", ">", userPoints)
        );
        const higherScoresCount = await getCountFromServer(higherScoresQuery);
        setRank(higherScoresCount.data().count + 1);
      } else {
        setRank("-");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const stats = useMemo(() => {
    const totalPoints = day1Data?.totalPoints ?? 0;
    const quizCorrect = day1Data?.quizCorrect ?? 0;
    const accuracy = Math.round((quizCorrect / 10) * 100);

    return {
      totalPoints,
      rank,
      accuracy: Number.isFinite(accuracy) ? accuracy : 0,
      dayStreak: day1Data ? 1 : 0,
    };
  }, [day1Data, rank]);

  const challengeState = useMemo(() => {
    const startMs = CHALLENGE_START_DATE_IST.getTime();
    const elapsedMs = nowMs - startMs;

    if (elapsedMs < 0) {
      return {
        phase: "prestart" as const,
        currentDay: 1,
        countdownMs: Math.max(startMs - nowMs, 0),
        statusText: "Day 1 unlocks in",
      };
    }

    const dayIndex = Math.floor(elapsedMs / DAY_MS);
    if (dayIndex >= CHALLENGE_TOTAL_DAYS) {
      return {
        phase: "ended" as const,
        currentDay: CHALLENGE_TOTAL_DAYS,
        countdownMs: 0,
        statusText: "Challenge window closed",
      };
    }

    const currentDay = dayIndex + 1;
    const hasNextDay = currentDay < CHALLENGE_TOTAL_DAYS;
    const nextMilestoneMs = hasNextDay
      ? startMs + currentDay * DAY_MS
      : startMs + CHALLENGE_TOTAL_DAYS * DAY_MS;

    return {
      phase: "active" as const,
      currentDay,
      countdownMs: Math.max(nextMilestoneMs - nowMs, 0),
      statusText: hasNextDay
        ? `Day ${currentDay} unlocked. Day ${currentDay + 1} unlocks in`
        : `Day ${currentDay} unlocked. Challenge ends in`,
    };
  }, [nowMs]);

  const countdownText = useMemo(() => formatCountdown(challengeState.countdownMs), [challengeState.countdownMs]);

  const displayName = profile.name || user?.displayName || "User";
  const displayEmail = profile.email || user?.email || "";
  const displayPhoto = profile.photoURL || user?.photoURL || "";
  const displayCollege = profile.collegeName || "";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(item => item[0]?.toUpperCase() ?? "")
    .join("") || "U";

  async function handleSaveProfile() {
    if (!user) return;

    const nextName = profileDraft.name.trim();
    const nextCollege = profileDraft.collegeName.trim();

    if (!nextName) {
      alert("Name is required.");
      return;
    }

    setSavingProfile(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          name: nextName,
          email: user.email ?? "",
          photoURL: user.photoURL ?? "",
          collegeName: nextCollege,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "leaderboard", user.uid),
        {
          uid: user.uid,
          name: nextName,
          photoURL: user.photoURL ?? "",
          lastUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfile(prev => ({
        ...prev,
        name: nextName,
        collegeName: nextCollege,
      }));
      setEditingProfile(false);
    } catch (error) {
      console.error("Failed to save profile", error);
      alert("Could not save profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSignOut() {
    await signOutUser();
    router.replace("/");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-white/75">Loading dashboard...</p>
      </main>
    );
  }

  if (!user) return null;

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

        <main className="relative mx-auto flex w-full max-w-7xl flex-col px-6 pb-8 pt-8 sm:px-10 lg:flex-1 lg:px-14 lg:pb-20">
          <header className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center">
            <div className="flex justify-start">
              <Link href="/" aria-label="Home">
                <div className="relative h-[44px] w-[150px] sm:h-[72px] sm:w-[286px] lg:h-[96px] lg:w-[350px]">
                  <Image
                    src="/edsockc.png"
                    alt="IEEE Education Society Kerala Chapter"
                    fill
                    sizes="(max-width: 640px) 150px, (max-width: 1024px) 286px, 350px"
                    priority
                    className="translate-y-[2px] object-contain object-left sm:translate-y-[3px] lg:translate-y-[4px]"
                  />
                </div>
              </Link>
            </div>
            <div className="flex justify-center">
              <Link href="/" aria-label="Home">
                <div className="relative h-7 w-[92px] sm:h-9 sm:w-[160px] lg:h-10 lg:w-[188px]">
                  <Image
                    src="/logo.png"
                    alt="IEEE Education Week"
                    fill
                    sizes="(max-width: 640px) 92px, (max-width: 1024px) 160px, 188px"
                    priority
                    className="object-contain object-center"
                  />
                </div>
              </Link>
            </div>
            <div className="flex justify-end">
              <Link href="/" aria-label="Home">
                <div className="relative h-7 w-[58px] sm:h-9 sm:w-[100px] lg:h-10 lg:w-[118px]">
                  <Image
                    src="/ieee.png"
                    alt="IEEE"
                    fill
                    sizes="(max-width: 640px) 58px, (max-width: 1024px) 100px, 118px"
                    priority
                    className="object-contain object-right"
                  />
                </div>
              </Link>
            </div>
          </header>

          <section className="mx-auto mt-3 w-full max-w-6xl rounded-2xl border border-[#f47a20]/25 bg-[#0b0b0b]/50 p-3 backdrop-blur-[1px] lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-white/60">Dashboard</p>
                <p className="text-sm font-semibold text-[#f47a20]">{displayName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[#f47a20]/40 bg-[#131313]/75 text-xs font-semibold text-white"
                title="Click to edit profile"
              >
                {displayPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayPhoto} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                className="rounded-full border border-white/20 px-3 py-1 text-[11px]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full border border-[#f47a20] bg-[#f47a20] px-3 py-1 text-[11px] font-medium text-black"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={() => router.push("/leaderboard")}
                className="rounded-full border border-[#f47a20] px-3 py-1 text-[11px] text-[#f47a20] hover:bg-[#f47a20]/10"
              >
                Leaderboard
              </button>
            </div>

            {editingProfile ? (
              <div className="mt-3 space-y-2">
                <input
                  value={profileDraft.name}
                  onChange={event => setProfileDraft(prev => ({ ...prev, name: event.target.value }))}
                  placeholder="Name"
                  className="w-full rounded-lg border border-white/20 bg-[#101010]/75 px-3 py-2 text-xs outline-none focus:border-[#f47a20]"
                />
                <input
                  value={profileDraft.collegeName}
                  onChange={event =>
                    setProfileDraft(prev => ({ ...prev, collegeName: event.target.value }))
                  }
                  placeholder="College Name"
                  className="w-full rounded-lg border border-white/20 bg-[#101010]/75 px-3 py-2 text-xs outline-none focus:border-[#f47a20]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="rounded-full border border-[#f47a20] bg-[#f47a20] px-4 py-2 text-xs font-semibold text-black disabled:opacity-70"
                  >
                    {savingProfile ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDraft({ name: displayName, collegeName: displayCollege });
                      setEditingProfile(false);
                    }}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-1 text-xs text-white/70">
                <p className="font-medium text-white">{displayName}</p>
                <p>{displayEmail}</p>
                <p>College: {displayCollege || "Not added. Click avatar to edit."}</p>
              </div>
            )}
          </section>

          <section className="mx-auto mt-6 grid w-full max-w-6xl gap-6 lg:mt-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <section className="space-y-3 lg:hidden">
                <div className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b]/55 p-4 text-center backdrop-blur-[1px]">
                  <h2 className="text-lg font-semibold">Challenge Calendar</h2>
                  <p className="mt-2 text-xs text-white/65">
                    {challengeState.phase === "ended"
                      ? "Challenge window closed"
                      : `${challengeState.statusText} ${countdownText}`}
                  </p>
                  <button
                    type="button"
                    disabled={challengeState.phase !== "active"}
                    onClick={() =>
                      challengeState.phase === "active" &&
                      router.push(`/dashboard/day-${challengeState.currentDay}`)
                    }
                    className={`mt-3 w-full rounded-xl border p-3 text-center transition ${
                      challengeState.phase === "active"
                        ? "border-[#f47a20] bg-[#121212] hover:bg-[#171717]"
                        : "cursor-not-allowed border-white/15 bg-[#101010] opacity-70"
                    }`}
                  >
                    <p className="text-sm text-white/75">Day {challengeState.currentDay}</p>
                    <p className="mt-0.5 text-xs text-white/45">{challengeDays[challengeState.currentDay - 1]?.date}</p>
                    <p className="mt-2 text-sm font-semibold text-[#f47a20]">
                      {challengeState.phase === "active"
                        ? `Play Day ${challengeState.currentDay}`
                        : challengeState.phase === "prestart"
                          ? "Unlocks at 9:00 PM IST"
                          : "Challenge Closed"}
                    </p>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Total Points" value={String(stats.totalPoints)} />
                  <StatCard label="Rank" value={String(stats.rank)} />
                  <StatCard label="Accuracy" value={`${stats.accuracy}%`} />
                  <StatCard label="Day Streak" value={String(stats.dayStreak)} />
                </div>

                <div className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b]/55 p-3 backdrop-blur-[1px]">
                  <h2 className="text-center text-base font-semibold">Achievement Badges</h2>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <BadgeCard label="Hot Start" hint="3-day streak" unlocked={stats.dayStreak >= 3} />
                    <BadgeCard label="On Fire" hint="5-day streak" unlocked={stats.dayStreak >= 5} />
                    <BadgeCard label="Unstoppable" hint="7-day streak" unlocked={stats.dayStreak >= 7} />
                    <BadgeCard label="Champion" hint="9-day streak" unlocked={stats.dayStreak >= 9} />
                  </div>
                </div>
              </section>

              <div className="hidden rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b]/60 p-4 sm:p-6 backdrop-blur-[1px] lg:block">
                <h1 className="text-3xl font-semibold text-[#f47a20]">Dashboard</h1>
                <p className="mt-1 text-sm text-white/70">Welcome back, {displayName}</p>
              </div>

              <section className="hidden rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b]/60 p-4 sm:p-6 backdrop-blur-[1px] lg:block">
                <h2 className="text-xl font-semibold">Challenge Calendar</h2>
                <p className="mt-2 text-sm text-white/65">
                  {challengeState.phase === "ended"
                    ? "Challenge window closed"
                    : `${challengeState.statusText} ${countdownText}`}
                </p>

                <div className="mt-4 sm:hidden">
                  <button
                    type="button"
                    disabled={challengeState.phase !== "active"}
                    onClick={() =>
                      challengeState.phase === "active" &&
                      router.push(`/dashboard/day-${challengeState.currentDay}`)
                    }
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      challengeState.phase === "active"
                        ? "border-[#f47a20] bg-[#121212] hover:bg-[#171717]"
                        : "cursor-not-allowed border-white/15 bg-[#101010] opacity-70"
                    }`}
                  >
                    <p className="text-sm text-white/70">Day {challengeState.currentDay}</p>
                    <p className="mt-1 text-xs text-white/45">{challengeDays[challengeState.currentDay - 1]?.date}</p>
                    <p className="mt-3 text-sm font-semibold text-[#f47a20]">
                      {challengeState.phase === "active"
                        ? `Play Day ${challengeState.currentDay}`
                        : challengeState.phase === "prestart"
                          ? "Unlocks at 9:00 PM IST"
                          : "Challenge Closed"}
                    </p>
                  </button>
                </div>

                <div className="mt-4 hidden grid-cols-2 gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                  {challengeDays.map(item => (
                    <button
                      key={item.day}
                      type="button"
                      disabled={challengeState.phase !== "active" || item.day !== challengeState.currentDay}
                      onClick={() =>
                        challengeState.phase === "active" &&
                        item.day === challengeState.currentDay &&
                        router.push(`/dashboard/day-${item.day}`)
                      }
                      className={`rounded-xl border p-4 text-left transition ${
                        challengeState.phase === "active" && item.day === challengeState.currentDay
                          ? "border-[#f47a20] bg-[#1a140f] hover:bg-[#231911]"
                          : "cursor-not-allowed border-white/15 bg-[#101010] opacity-55"
                      }`}
                    >
                      <p className="text-sm text-white/70">Day {item.day}</p>
                      <p className="mt-1 text-xs text-white/45">{item.date}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="hidden grid-cols-1 gap-3 sm:grid-cols-2 xl:grid lg:grid-cols-4">
                <StatCard label="Total Points" value={String(stats.totalPoints)} />
                <StatCard label="Rank" value={String(stats.rank)} />
                <StatCard label="Accuracy" value={`${stats.accuracy}%`} />
                <StatCard label="Day Streak" value={String(stats.dayStreak)} />
              </section>

              <section className="hidden rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b]/60 p-4 sm:p-6 backdrop-blur-[1px] lg:block">
                <h2 className="text-xl font-semibold">Achievement Badges</h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <BadgeCard label="Hot Start" hint="3-day streak" unlocked={stats.dayStreak >= 3} />
                  <BadgeCard label="On Fire" hint="5-day streak" unlocked={stats.dayStreak >= 5} />
                  <BadgeCard
                    label="Unstoppable"
                    hint="7-day streak"
                    unlocked={stats.dayStreak >= 7}
                  />
                  <BadgeCard label="Champion" hint="9-day streak" unlocked={stats.dayStreak >= 9} />
                </div>
              </section>

            </div>

            <aside className="hidden h-fit rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b]/60 p-4 sm:p-5 backdrop-blur-[1px] lg:block">
              <h2 className="text-lg font-semibold">Profile</h2>

              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                  className="mt-4 inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[#f47a20]/40 bg-[#131313]/75 text-lg font-semibold text-white"
                title="Click to edit profile"
              >
                {displayPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayPhoto} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </button>

              {editingProfile ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-white/65">Name</label>
                    <input
                      value={profileDraft.name}
                      onChange={event =>
                        setProfileDraft(prev => ({ ...prev, name: event.target.value }))
                      }
                      className="w-full rounded-lg border border-white/20 bg-[#101010]/75 px-3 py-2 text-sm outline-none focus:border-[#f47a20]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/65">College Name</label>
                    <input
                      value={profileDraft.collegeName}
                      onChange={event =>
                        setProfileDraft(prev => ({ ...prev, collegeName: event.target.value }))
                      }
                      placeholder="Add your college"
                      className="w-full rounded-lg border border-white/20 bg-[#101010]/75 px-3 py-2 text-sm outline-none focus:border-[#f47a20]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="rounded-full border border-[#f47a20] bg-[#f47a20] px-4 py-2 text-xs font-semibold text-black disabled:opacity-70"
                    >
                      {savingProfile ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileDraft({
                          name: displayName,
                          collegeName: displayCollege,
                        });
                        setEditingProfile(false);
                      }}
                      className="rounded-full border border-white/20 px-4 py-2 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2 text-sm">
                  <p className="font-medium">{displayName}</p>
                  <p className="text-white/70">{displayEmail}</p>
                  <p className="text-white/70">
                    College: {displayCollege || "Not added. Click avatar to edit."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(true)}
                    className="mt-1 rounded-full border border-white/20 px-4 py-2 text-xs"
                  >
                    Edit Profile
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-5 rounded-full border border-[#f47a20] bg-[#f47a20] px-4 py-2 text-sm font-medium text-black hover:bg-[#ff8533]"
              >
                Sign Out
              </button>

              <div className="mt-4 rounded-xl border border-[#f47a20]/25 bg-[#101010]/70 p-3">
                <p className="text-sm font-semibold">Leaderboard</p>
                <button
                  type="button"
                  onClick={() => router.push("/leaderboard")}
                  className="mt-2 w-full rounded-full border border-[#f47a20] px-4 py-2 text-sm text-[#f47a20] hover:bg-[#f47a20]/10"
                >
                  Open Leaderboard
                </button>
              </div>
            </aside>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-white/15 bg-[#111111]/60 p-3 text-center backdrop-blur-[1px] sm:rounded-2xl sm:p-4">
      <p className="text-2xl font-semibold text-[#f47a20] sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-white/65 sm:text-sm">{label}</p>
    </article>
  );
}

function BadgeCard({
  label,
  hint,
  unlocked,
}: {
  label: string;
  hint: string;
  unlocked: boolean;
}) {
  return (
    <article
      className={`rounded-xl border p-4 text-center ${
        unlocked
          ? "border-[#f47a20]/50 bg-[#17110a]/70"
          : "border-white/10 bg-[#101010]/60 opacity-70"
      }`}
    >
      <p className="text-sm font-semibold sm:text-base">{label}</p>
      <p className="mt-1 text-[11px] text-white/60 sm:text-xs">{hint}</p>
    </article>
  );
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}
