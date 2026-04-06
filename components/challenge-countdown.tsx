"use client";

import { useEffect, useMemo, useState } from "react";

const TARGET_DATE = new Date("2026-04-11T19:00:00").getTime();

function getTimeLeft(now: number) {
  const diff = Math.max(TARGET_DATE - now, 0);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { diff, days, hours, minutes, seconds };
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

  const left = useMemo(() => (now === null ? null : getTimeLeft(now)), [now]);

  if (left === null) {
    return (
      <div className="countdown-card relative mt-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.003))] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.32)] backdrop-blur-[1px] sm:p-5">
        <div className="relative">
          <p className="mb-2 text-center text-[11px] uppercase tracking-[0.18em] text-[#9EAFC2]">Challenge Starts In</p>
          <div className="flex w-full items-center justify-center gap-1 sm:gap-1.5">
            <CounterUnit label="Days" value={0} />
            <TimerSeparator />
            <CounterUnit label="Hours" value={0} />
            <TimerSeparator />
            <CounterUnit label="Mins" value={0} />
            <TimerSeparator />
            <CounterUnit label="Secs" value={0} />
          </div>
          <p className="mt-3 text-xs text-[#b4bac7] sm:text-sm">
            Top 5 winners will receive exclusive IEEE EdSoc goodies.
          </p>
        </div>
      </div>
    );
  }

  if (left.diff <= 0) {
    return (
      <div className="countdown-card relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.003))] px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.32)] backdrop-blur-[1px] sm:px-5">
        <p className="text-xs uppercase tracking-[0.16em] text-[#cfd3db]">Challenge Status</p>
        <p className="mt-2 text-2xl font-semibold text-white">Challenge Is Live</p>
        <p className="mt-2 text-sm leading-relaxed text-[#d4d9e5]">
          The top 5 winners will receive exclusive IEEE EdSoc goodies.
        </p>
      </div>
    );
  }

  return (
    <div className="countdown-card relative mt-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.003))] p-4 shadow-[0_14px_28px_rgba(0,0,0,0.32)] backdrop-blur-[1px] sm:p-5">
      <div className="relative">
        <p className="mb-2 text-center text-[11px] uppercase tracking-[0.18em] text-[#9EAFC2]">Challenge Starts In</p>
        <div className="flex w-full items-center justify-center gap-1 sm:gap-1.5">
          <CounterUnit label="Days" value={left.days} />
          <TimerSeparator />
          <CounterUnit label="Hours" value={left.hours} />
          <TimerSeparator />
          <CounterUnit label="Mins" value={left.minutes} />
          <TimerSeparator />
          <CounterUnit label="Secs" value={left.seconds} />
        </div>
        <p className="mt-3 text-xs text-[#b4bac7] sm:text-sm">
          Top 5 in the Leaderboard will receive exclusive IEEE EdSoc goodies.
        </p>
      </div>
    </div>
  );
}
