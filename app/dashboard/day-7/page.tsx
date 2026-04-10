"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DotGrid from "@/components/DotGrid";
import ShapeGrid from "@/components/ShapeGrid";

type QuizQuestion = {
  id: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  question: string;
  options: string[];
  answer: string;
};

type TargetPosition = {
  x: number;
  y: number;
};

const QUIZ_TIME_SECONDS = 8 * 60;
const SPRINT_TIME_SECONDS = 25;
const CHALLENGE_START_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const DAY_SEVEN_START_IST = new Date("2026-04-17T00:00:00+05:30").getTime();
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_FORCE_UNLOCK = false;

const quizQuestions: QuizQuestion[] = [
  {
    id: 1,
    difficulty: "Easy",
    question: "SI unit of frequency is:",
    options: ["Joule", "Pascal", "Hertz", "Tesla"],
    answer: "Hertz",
  },
  {
    id: 2,
    difficulty: "Easy",
    question: "Atomic number of carbon is:",
    options: ["4", "5", "6", "8"],
    answer: "6",
  },
  {
    id: 3,
    difficulty: "Easy",
    question: "If 3x = 21, then x is:",
    options: ["5", "6", "7", "8"],
    answer: "7",
  },
  {
    id: 4,
    difficulty: "Medium",
    question: "The derivative of x^2 is:",
    options: ["x", "2x", "x^2", "2"],
    answer: "2x",
  },
  {
    id: 5,
    difficulty: "Medium",
    question: "At constant volume, heat added raises:",
    options: ["Pressure", "Mass", "Moles", "Density only"],
    answer: "Pressure",
  },
  {
    id: 6,
    difficulty: "Medium",
    question: "Valency of oxygen in most compounds is:",
    options: ["1", "2", "3", "4"],
    answer: "2",
  },
  {
    id: 7,
    difficulty: "Hard",
    question: "In a right triangle, c^2 = a^2 + b^2 is:",
    options: ["Binomial theorem", "Pythagoras theorem", "Gauss law", "Ohm law"],
    answer: "Pythagoras theorem",
  },
  {
    id: 8,
    difficulty: "Hard",
    question: "For matrix multiplication AB, columns of A must equal:",
    options: ["Rows of A", "Columns of B", "Rows of B", "Determinant of B"],
    answer: "Rows of B",
  },
  {
    id: 9,
    difficulty: "Hard",
    question: "In first-order decay, half-life depends on:",
    options: ["Initial concentration", "Rate constant", "Temperature only", "Volume only"],
    answer: "Rate constant",
  },
  {
    id: 10,
    difficulty: "Expert",
    question: "Integral of 2x dx is:",
    options: ["x^2 + C", "2x + C", "x + C", "2x^2 + C"],
    answer: "x^2 + C",
  },
];

const QUIZ_POINT_PER_CORRECT = 5;
const SPRINT_MAX_UNITS = 30;
const SPRINT_POINT_PER_UNIT = 2;

function randomTargetPosition(): TargetPosition {
  return {
    x: 10 + Math.random() * 80,
    y: 15 + Math.random() * 70,
  };
}

export default function DaySevenPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"quiz" | "sprint">("quiz");
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<string[]>(Array(quizQuestions.length).fill(""));

  const [sprintStarted, setSprintStarted] = useState(false);
  const [sprintCompleted, setSprintCompleted] = useState(false);
  const [sprintTimeLeft, setSprintTimeLeft] = useState(SPRINT_TIME_SECONDS);
  const [targetPosition, setTargetPosition] = useState<TargetPosition>(() => randomTargetPosition());
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_SECONDS);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      if (!currentUser) {
        router.replace("/");
        return;
      }

      setUser(currentUser);
      startRef.current = Date.now();
      setReady(true);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!ready || submitted) return;
    if (timeLeft <= 0) return;

    const intervalId = window.setInterval(() => {
      setTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [ready, submitted, timeLeft]);

  useEffect(() => {
    if (!sprintStarted || sprintCompleted) return;
    if (sprintTimeLeft <= 0) {
      setSprintCompleted(true);
      return;
    }

    const intervalId = window.setInterval(() => {
      setSprintTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [sprintCompleted, sprintStarted, sprintTimeLeft]);

  useEffect(() => {
    if (!sprintStarted || sprintCompleted) return;
    const moveId = window.setInterval(() => {
      setTargetPosition(randomTargetPosition());
    }, 850);

    return () => window.clearInterval(moveId);
  }, [sprintCompleted, sprintStarted]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const totalTaps = hits + misses;
  const accuracy = totalTaps > 0 ? hits / totalTaps : 0;
  const accuracyBonus = accuracy >= 0.8 ? 5 : accuracy >= 0.65 ? 3 : 0;
  const streakBonus = Math.floor(bestStreak / 3);
  const sprintUnits = Math.min(hits + accuracyBonus + streakBonus, SPRINT_MAX_UNITS);

  const handleSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (!user || submitted || submitting) return;

      const hasAnyMissingQuizAnswer = quizAnswers.some(answer => answer === "");
      if (!autoSubmitted && hasAnyMissingQuizAnswer) {
        alert("Please answer all 10 quiz questions.");
        return;
      }

      if (!autoSubmitted && !sprintCompleted) {
        alert("Please complete Debug Sprint.");
        return;
      }

      setSubmitting(true);

      try {
        const dayRef = doc(db, "users", user.uid, "days", "day7");
        const existingDaySubmission = await getDoc(dayRef);
        if (existingDaySubmission.exists()) {
          alert("You have already submitted Day 7. Only one submission is allowed.");
          setSubmitted(true);
          router.replace("/leaderboard");
          return;
        }

        const quizCorrect = quizQuestions.reduce((correctCount, item, index) => {
          return correctCount + (quizAnswers[index] === item.answer ? 1 : 0);
        }, 0);

        const quizPoints = quizCorrect * QUIZ_POINT_PER_CORRECT;
        const sprintPoints = sprintUnits * SPRINT_POINT_PER_UNIT;
        const basePoints = quizPoints + sprintPoints;

        const totalCorrectCount = quizCorrect + sprintUnits;
        const totalQuestionCount = quizQuestions.length + SPRINT_MAX_UNITS;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(QUIZ_TIME_SECONDS - elapsedSeconds, 0);
        const timeBonusPerCorrect = Math.floor(remainingSeconds / totalQuestionCount);
        const timeBonusPoints = totalCorrectCount * timeBonusPerCorrect;
        const rawTotalPoints = basePoints + timeBonusPoints;

        const nowForPenalty = Date.now();
        const elapsedDaysFromStart = Math.floor((nowForPenalty - CHALLENGE_START_IST) / DAY_MS);
        const currentChallengeDay = Math.min(Math.max(elapsedDaysFromStart + 1, 1), CHALLENGE_TOTAL_DAYS);
        const daysLate = Math.max(currentChallengeDay - 7, 0);
        const latePenaltyMultiplier = Math.max(1 - daysLate * 0.1, 0.1);
        const totalPoints = Math.round(rawTotalPoints * latePenaltyMultiplier);

        const leaderboardRef = doc(db, "leaderboard", user.uid);
        const leaderboardSnap = await getDoc(leaderboardRef);
        const existingDayPoints = leaderboardSnap.exists()
          ? ((leaderboardSnap.data().dayPoints ?? {}) as Record<string, number>)
          : {};

        const nextDayPoints: Record<string, number> = {
          ...existingDayPoints,
          day7: totalPoints,
        };

        const nextTotalPoints = Object.values(nextDayPoints).reduce(
          (sum, points) => sum + Number(points || 0),
          0
        );

        const batch = writeBatch(db);

        batch.set(
          dayRef,
          {
            day: 7,
            quizAnswers,
            quizCorrect,
            quizPoints,
            sprintHits: hits,
            sprintMisses: misses,
            sprintTotalTaps: totalTaps,
            sprintAccuracy: Number(accuracy.toFixed(3)),
            sprintBestStreak: bestStreak,
            sprintStreakBonus: streakBonus,
            sprintAccuracyBonus: accuracyBonus,
            sprintUnits,
            sprintPoints,
            sprintTimeLimitSeconds: SPRINT_TIME_SECONDS,
            sprintTimeRemainingSeconds: sprintTimeLeft,
            basePoints,
            totalCorrectCount,
            totalQuestionCount,
            timeBonusPerCorrect,
            timeBonusPoints,
            rawTotalPoints,
            daysLate,
            latePenaltyMultiplier,
            totalPoints,
            elapsedSeconds,
            quizTimeLimitSeconds: QUIZ_TIME_SECONDS,
            submittedAt: serverTimestamp(),
            submittedDate: new Date().toISOString(),
            autoSubmitted,
          },
          { merge: true }
        );

        batch.set(
          doc(db, "users", user.uid),
          {
            uid: user.uid,
            name: user.displayName ?? "",
            email: user.email ?? "",
            photoURL: user.photoURL ?? "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(
          leaderboardRef,
          {
            uid: user.uid,
            totalPoints: nextTotalPoints,
            dayPoints: nextDayPoints,
            lastUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await batch.commit();

        setSubmitted(true);
        router.replace("/leaderboard");
      } catch (error) {
        console.error("Failed to submit Day 7 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      accuracy,
      accuracyBonus,
      bestStreak,
      hits,
      misses,
      quizAnswers,
      router,
      sprintCompleted,
      sprintTimeLeft,
      sprintUnits,
      streakBonus,
      submitted,
      submitting,
      totalTaps,
      user,
    ]
  );

  useEffect(() => {
    if (!ready || submitted || timeLeft > 0) return;
    void handleSubmit(true);
  }, [handleSubmit, ready, submitted, timeLeft]);

  const renderPage = (content: ReactNode) => (
    <div className="min-h-screen bg-black text-white">
      <div className="relative isolate min-h-screen overflow-hidden">
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
        <main className="relative z-10 min-h-screen px-5 py-8 sm:px-8 lg:px-12">{content}</main>
      </div>
    </div>
  );

  if (!ready) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <p className="text-sm text-white/70">Loading Day 7 challenge...</p>
      </div>
    );
  }

  if (!TEST_FORCE_UNLOCK && nowMs < DAY_SEVEN_START_IST) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <section className="w-full max-w-2xl rounded-2xl border border-[#f47a20]/35 bg-[#0b0b0b] p-6 text-center">
          <h1 className="text-2xl font-semibold text-[#f47a20]">Day 7 Locked</h1>
          <p className="mt-3 text-sm text-white/70">Day 7 unlocks in</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCountdown(DAY_SEVEN_START_IST - nowMs)}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-5 rounded-full border border-white/20 px-5 py-2 text-sm"
          >
            Back to Dashboard
          </button>
        </section>
      </div>
    );
  }

  const activeQuizQuestion = quizQuestions[quizIndex];
  const allQuizAnswered = quizAnswers.every(answer => answer !== "");
  const showSubmitButton = stage === "sprint" && sprintCompleted && allQuizAnswered;
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  const difficultyClassName =
    activeQuizQuestion.difficulty === "Easy"
      ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
      : activeQuizQuestion.difficulty === "Medium"
        ? "text-sky-300 border-sky-400/40 bg-sky-400/10"
        : activeQuizQuestion.difficulty === "Hard"
          ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
          : "text-rose-300 border-rose-400/40 bg-rose-400/10";

  return renderPage(
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#f47a20]">Day 7 Challenge</h1>
          <p className="mt-1 text-sm text-white/70">Quiz first, then Debug Sprint mini-game</p>
        </div>
        <div className="rounded-full border border-[#f47a20]/60 bg-[#f47a20]/10 px-4 py-2 text-sm font-semibold text-[#f47a20]">
          Timer: {minutes}:{seconds}
        </div>
      </div>

      <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span
            className={`rounded-full border px-3 py-1 font-medium ${
              stage === "quiz"
                ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]"
                : "border-white/20 text-white/70"
            }`}
          >
            Stage 1: Quiz
          </span>
          <span
            className={`rounded-full border px-3 py-1 font-medium ${
              stage === "sprint"
                ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]"
                : "border-white/20 text-white/70"
            }`}
          >
            Stage 2: Debug Sprint
          </span>
        </div>
      </section>

      {stage === "quiz" ? (
        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Quiz (10 Questions)</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficultyClassName}`}>
              {activeQuizQuestion.difficulty}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/65">
            Question {quizIndex + 1} of {quizQuestions.length}
          </p>

          <div className="mt-4 rounded-xl border border-white/10 bg-[#111111] p-4">
            <p className="text-base font-medium">{activeQuizQuestion.question}</p>
            <div className="mt-3 space-y-2">
              {activeQuizQuestion.options.map(option => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 py-2 hover:border-[#f47a20]/50"
                >
                  <input
                    type="radio"
                    name={`question-${activeQuizQuestion.id}`}
                    value={option}
                    checked={quizAnswers[quizIndex] === option}
                    disabled={submitted}
                    onChange={() => {
                      setQuizAnswers(prev => {
                        const next = [...prev];
                        next[quizIndex] = option;
                        return next;
                      });
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={quizIndex === 0}
              onClick={() => setQuizIndex(prev => Math.max(prev - 1, 0))}
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {quizIndex < quizQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => setQuizIndex(prev => Math.min(prev + 1, quizQuestions.length - 1))}
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (quizAnswers.some(answer => answer === "")) {
                    alert("Please answer all 10 quiz questions before continuing.");
                    return;
                  }
                  setStage("sprint");
                }}
                className="rounded-full border border-[#f47a20] bg-[#f47a20] px-4 py-2 text-sm font-semibold text-black"
              >
                Next Challenge
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          {!sprintStarted ? (
            <div className="rounded-2xl border border-white/15 bg-[#111111] p-6 text-center">
              <h2 className="text-3xl font-semibold text-[#f2f2f2]">Debug Sprint</h2>
              <p className="mt-3 text-lg text-[#87b6ad]">Tap the targets as fast as you can!</p>
              <button
                type="button"
                onClick={() => {
                  setSprintStarted(true);
                  setSprintCompleted(false);
                  setSprintTimeLeft(SPRINT_TIME_SECONDS);
                  setTargetPosition(randomTargetPosition());
                  setHits(0);
                  setMisses(0);
                  setStreak(0);
                  setBestStreak(0);
                }}
                className="mt-6 rounded-xl border border-emerald-600 bg-emerald-700 px-8 py-3 text-lg font-medium text-white hover:bg-emerald-600"
              >
                Start Game
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/15 bg-[#111111] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Debug Sprint</h2>
                <div className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-300">
                  {sprintCompleted ? "Completed" : `00:${String(sprintTimeLeft).padStart(2, "0")}`}
                </div>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Hits: {hits} | Misses: {misses} | Accuracy: {(accuracy * 100).toFixed(0)}% | Sprint Units: {sprintUnits}
              </p>

              <div
                className="relative mt-4 h-72 rounded-xl border border-white/10 bg-[#151515]"
                onClick={() => {
                  if (!sprintCompleted) {
                    setMisses(prev => prev + 1);
                    setStreak(0);
                  }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={() => undefined}
              >
                {!sprintCompleted ? (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      setHits(prev => prev + 1);
                      setStreak(prev => {
                        const next = prev + 1;
                        setBestStreak(current => Math.max(current, next));
                        return next;
                      });
                      setTargetPosition(randomTargetPosition());
                    }}
                    className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f47a20] bg-[#f47a20]/20"
                    style={{ left: `${targetPosition.x}%`, top: `${targetPosition.y}%` }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-white/80">
                    <div>
                      <p className="text-lg font-semibold">Sprint complete</p>
                      <p className="mt-2 text-sm">Best streak: {bestStreak}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="rounded-full border border-white/20 px-5 py-2 text-sm"
        >
          Back to Dashboard
        </button>
        {showSubmitButton ? (
          <button
            type="button"
            disabled={submitted || submitting}
            onClick={() => {
              const confirmed = window.confirm(
                "Confirm final submission for Day 7? You can submit only once."
              );
              if (!confirmed) return;
              void handleSubmit(false);
            }}
            className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 7"}
          </button>
        ) : null}
      </div>
    </section>
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
