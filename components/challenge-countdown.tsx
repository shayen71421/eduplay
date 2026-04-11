"use client";

import { useEffect, useMemo, useState } from "react";

const CHALLENGE_START_DATE_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;

function getUnlockState(nowMs: number) {
  const elapsedMs = nowMs - CHALLENGE_START_DATE_IST;

  if (elapsedMs < 0) {
    return {
      phase: "prestart" as const,
      title: "Day 1 Unlocks In",
      countdownMs: CHALLENGE_START_DATE_IST - nowMs,
    };
  }

  const dayIndex = Math.floor(elapsedMs / DAY_MS);
  if (dayIndex >= CHALLENGE_TOTAL_DAYS) {
    return {
      phase: "ended" as const,
      title: "Challenge Window Closed",
      countdownMs: 0,
    };
  }

  const currentDay = dayIndex + 1;
  const hasNextDay = currentDay < CHALLENGE_TOTAL_DAYS;
  const nextMilestoneMs = hasNextDay
    ? CHALLENGE_START_DATE_IST + currentDay * DAY_MS
    : CHALLENGE_START_DATE_IST + CHALLENGE_TOTAL_DAYS * DAY_MS;

  return {
    phase: "active" as const,
    title: hasNextDay
      ? `Day ${currentDay} Unlocked. Day ${currentDay + 1} Unlocks In`
      : `Day ${currentDay} Unlocked. Challenge Ends In`,
    countdownMs: Math.max(nextMilestoneMs - nowMs, 0),
  };
}

function CounterUnit({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[44px] px-0.5 py-1 text-center sm:min-w-[52px]">
      <p className="text-[32px] font-semibold leading-none text-white tabular-nums sm:text-[36px]">
        {String(value).padStart(2, "0")}
      </p>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function TimerSeparator() {
  return <span className="px-0.5 text-[24px] font-semibold leading-none text-[#b4bac7] sm:text-[28px]">:</span>;
}

export default function ChallengeCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const left = useMemo(() => (now === null ? null : getUnlockState(now)), [now]);

  const units = useMemo(() => {
    if (!left) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    const diff = Math.max(left.countdownMs, 0);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    return { days, hours, minutes, seconds };
  }, [left]);

  if (left === null) {
    return (
      <div className="countdown-card relative mt-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.003))] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.32)] backdrop-blur-[1px] sm:p-5">
        <div className="relative">
          <p className="mb-2 text-center text-[11px] uppercase tracking-[0.18em] text-[#9EAFC2]">Loading Day Unlock</p>
          <div className="flex w-full items-center justify-center gap-1 sm:gap-1.5">
            <CounterUnit label="Days" value={0} />
            <TimerSeparator />
            <CounterUnit label="Hours" value={0} />
            <TimerSeparator />
            <CounterUnit label="Mins" value={0} />
            <TimerSeparator />
            <CounterUnit label="Secs" value={0} />
          </div>
          <p className="mt-3 text-xs text-[#b4bac7] sm:text-sm">Syncing challenge schedule...</p>
        </div>
      </div>
    );
  }

  if (left.phase === "ended") {
    return (
      <div className="countdown-card relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.003))] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.32)] backdrop-blur-[1px] sm:px-5">
        <p className="text-xs uppercase tracking-[0.16em] text-[#cfd3db]">Challenge Status</p>
        <p className="mt-2 text-2xl font-semibold text-white">Challenge Window Closed</p>
        <p className="mt-2 text-sm leading-relaxed text-[#d4d9e5]">
          Daily windows have ended. See leaderboard for final standings.
        </p>
      </div>
    );
  }

  return (
    <div className="countdown-card relative mt-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.003))] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.32)] backdrop-blur-[1px] sm:p-5">
      <div className="relative">
        <p className="mb-2 text-center text-[11px] uppercase tracking-[0.18em] text-[#9EAFC2]">{left.title}</p>
        <div className="flex w-full items-center justify-center gap-1 sm:gap-1.5">
          <CounterUnit label="Days" value={units.days} />
          <TimerSeparator />
          <CounterUnit label="Hours" value={units.hours} />
          <TimerSeparator />
          <CounterUnit label="Mins" value={units.minutes} />
          <TimerSeparator />
          <CounterUnit label="Secs" value={units.seconds} />
        </div>
        <p className="mt-3 text-xs text-[#b4bac7] sm:text-sm">
          Top 5 players on the leaderboard at the end of the challenge will win exclusive prizes!
        </p>
      </div>
    </div>
  );
}
