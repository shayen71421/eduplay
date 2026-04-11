"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DotGrid from "@/components/DotGrid";
import ShapeGrid from "@/components/ShapeGrid";

type Question = {
  id: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  question: string;
  options: string[];
  answer: string;
};

type TimelineItem = {
  label: string;
  year: number;
};

type TimelineRound = {
  id: number;
  title: string;
  prompt: string;
  startOrder: TimelineItem[];
};

const QUIZ_TIME_SECONDS = 8 * 60;
const CHALLENGE_START_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const DAY_FOUR_START_IST = new Date("2026-04-14T00:00:00+05:30").getTime();
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_FORCE_UNLOCK = false;

const questions: Question[] = [
  {
    id: 1,
    difficulty: "Easy",
    question: "SI unit of pressure is:",
    options: ["Pascal", "Joule", "Watt", "Tesla"],
    answer: "Pascal",
  },
  {
    id: 2,
    difficulty: "Easy",
    question: "Chemical formula of common salt is:",
    options: ["KCl", "NaCl", "Na2CO3", "CaCO3"],
    answer: "NaCl",
  },
  {
    id: 3,
    difficulty: "Easy",
    question: "Value of sqrt(144) is:",
    options: ["10", "11", "12", "13"],
    answer: "12",
  },
  {
    id: 4,
    difficulty: "Medium",
    question: "Kirchhoff's Current Law is based on conservation of:",
    options: ["Energy", "Charge", "Momentum", "Mass"],
    answer: "Charge",
  },
  {
    id: 5,
    difficulty: "Medium",
    question: "A solution with pH < 7 is:",
    options: ["Neutral", "Basic", "Acidic", "Buffer only"],
    answer: "Acidic",
  },
  {
    id: 6,
    difficulty: "Medium",
    question: "d/dx (sin x) equals:",
    options: ["-sin x", "cos x", "-cos x", "tan x"],
    answer: "cos x",
  },
  {
    id: 7,
    difficulty: "Hard",
    question: "In projectile motion (no air resistance), horizontal acceleration is:",
    options: ["g", "2g", "0", "depends on angle"],
    answer: "0",
  },
  {
    id: 8,
    difficulty: "Hard",
    question: "A matrix with non-zero determinant is:",
    options: ["Singular", "Invertible", "Skew only", "Idempotent only"],
    answer: "Invertible",
  },
  {
    id: 9,
    difficulty: "Hard",
    question: "Enthalpy change at constant pressure equals heat:",
    options: ["always zero", "absorbed/released", "only at 0 C", "only for gases"],
    answer: "absorbed/released",
  },
  {
    id: 10,
    difficulty: "Expert",
    question: "If y = x^x (x>0), then ln y equals:",
    options: ["x + ln x", "x ln x", "ln x / x", "x^2"],
    answer: "x ln x",
  },
];

const timelineRounds: TimelineRound[] = [
  {
    id: 1,
    title: "Sort It Out: Tech Timeline",
    prompt: "Sort by year of invention (earliest first)",
    startOrder: [
      { label: "Transistor", year: 1947 },
      { label: "Telephone", year: 1876 },
      { label: "World Wide Web", year: 1989 },
      { label: "Smartphone", year: 1994 },
    ],
  },
  {
    id: 2,
    title: "Sort It Out: Physics Milestones",
    prompt: "Sort by year (earliest first)",
    startOrder: [
      { label: "General Relativity", year: 1915 },
      { label: "Newton's Principia", year: 1687 },
      { label: "Quantum Mechanics (modern form)", year: 1925 },
      { label: "Maxwell Equations", year: 1865 },
    ],
  },
  {
    id: 3,
    title: "Sort It Out: Chemistry Timeline",
    prompt: "Sort by year (earliest first)",
    startOrder: [
      { label: "Periodic Table (Mendeleev)", year: 1869 },
      { label: "Avogadro's Hypothesis", year: 1811 },
      { label: "Discovery of Electron", year: 1897 },
      { label: "Bohr Model", year: 1913 },
    ],
  },
  {
    id: 4,
    title: "Sort It Out: Math & Computing",
    prompt: "Sort by year (earliest first)",
    startOrder: [
      { label: "Calculus (Newton/Leibniz era)", year: 1665 },
      { label: "Analytical Engine concept", year: 1837 },
      { label: "Turing Machine concept", year: 1936 },
      { label: "Shannon Information Theory", year: 1948 },
    ],
  },
];

const QUIZ_POINT_PER_CORRECT = 5;
const MINI_GAME_POINT_UNITS = 5;
const MINI_GAME_POINT_PER_UNIT = 10;

function moveItem<T>(array: T[], from: number, to: number) {
  const next = [...array];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function isRoundCorrect(items: TimelineItem[]) {
  for (let i = 1; i < items.length; i += 1) {
    if (items[i - 1].year > items[i].year) return false;
  }
  return true;
}

export default function DayFourPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"quiz" | "timeline">("quiz");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(""));

  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [roundItems, setRoundItems] = useState<TimelineItem[]>(timelineRounds[0].startOrder);
  const [roundLocked, setRoundLocked] = useState(false);
  const [roundResults, setRoundResults] = useState<Array<boolean | null>>(
    Array(timelineRounds.length).fill(null)
  );
  const [timelineResolved, setTimelineResolved] = useState(false);

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
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const timelineScore = useMemo(
    () => roundResults.reduce((sum, item) => sum + (item ? 1 : 0), 0),
    [roundResults]
  );

  const handleSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (!user || submitted || submitting) return;

      const hasAnyMissingQuizAnswer = answers.some(answer => answer === "");
      if (!autoSubmitted && hasAnyMissingQuizAnswer) {
        alert("Please answer all 10 quiz questions.");
        return;
      }

      if (!autoSubmitted && !timelineResolved) {
        alert("Please complete all timeline rounds.");
        return;
      }

      setSubmitting(true);

      try {
        const dayRef = doc(db, "users", user.uid, "days", "day4");
        const existingDaySubmission = await getDoc(dayRef);
        if (existingDaySubmission.exists()) {
          alert("You have already submitted Day 4. Only one submission is allowed.");
          setSubmitted(true);
          router.replace("/leaderboard");
          return;
        }

        const quizCorrect = questions.reduce((correctCount, item, index) => {
          return correctCount + (answers[index] === item.answer ? 1 : 0);
        }, 0);

        const allRoundsPerfect = roundResults.every(item => item === true);
        const timelineUnits = timelineScore + (allRoundsPerfect ? 1 : 0);
        const timelinePoints = timelineUnits * MINI_GAME_POINT_PER_UNIT;

        const quizPoints = quizCorrect * QUIZ_POINT_PER_CORRECT;
        const basePoints = quizPoints + timelinePoints;
        const totalCorrectCount = quizCorrect + timelineUnits;
        const totalQuestionCount = questions.length + MINI_GAME_POINT_UNITS;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(QUIZ_TIME_SECONDS - elapsedSeconds, 0);
        const timeBonusPerCorrect = Math.floor(remainingSeconds / totalQuestionCount);
        const timeBonusPoints = totalCorrectCount * timeBonusPerCorrect;
        const rawTotalPoints = basePoints + timeBonusPoints;

        const nowForPenalty = Date.now();
        const elapsedDaysFromStart = Math.floor((nowForPenalty - CHALLENGE_START_IST) / DAY_MS);
        const currentChallengeDay = Math.min(Math.max(elapsedDaysFromStart + 1, 1), CHALLENGE_TOTAL_DAYS);
        const daysLate = Math.max(currentChallengeDay - 4, 0);
        const latePenaltyMultiplier = Math.max(1 - daysLate * 0.1, 0.1);
        const totalPoints = Math.round(rawTotalPoints * latePenaltyMultiplier);

        const userRef = doc(db, "users", user.uid);
        const leaderboardRef = doc(db, "leaderboard", user.uid);

        const leaderboardSnap = await getDoc(leaderboardRef);
        const existingDayPoints = leaderboardSnap.exists()
          ? ((leaderboardSnap.data().dayPoints ?? {}) as Record<string, number>)
          : {};

        const nextDayPoints: Record<string, number> = {
          ...existingDayPoints,
          day4: totalPoints,
        };

        const nextTotalPoints = Object.values(nextDayPoints).reduce(
          (sum, points) => sum + Number(points || 0),
          0
        );

        const batch = writeBatch(db);

        batch.set(
          dayRef,
          {
            day: 4,
            quizAnswers: answers,
            quizCorrect,
            quizPoints,
            timelineRoundResults: roundResults,
            timelineScore,
            timelineUnits,
            timelinePoints,
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
          userRef,
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
        console.error("Failed to submit Day 4 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, roundResults, router, submitted, submitting, timelineResolved, timelineScore, user]
  );

  useEffect(() => {
    if (!ready || submitted || timeLeft > 0) return;
    void handleSubmit(true);
  }, [handleSubmit, ready, submitted, timeLeft]);

  function submitRoundOrder() {
    if (roundLocked) return;

    const correct = isRoundCorrect(roundItems);
    setRoundResults(prev => {
      const next = [...prev];
      next[currentRoundIndex] = correct;
      return next;
    });
    setRoundLocked(true);
  }

  function goToNextRound() {
    if (currentRoundIndex >= timelineRounds.length - 1) {
      setTimelineResolved(true);
      return;
    }

    const nextRound = currentRoundIndex + 1;
    setCurrentRoundIndex(nextRound);
    setRoundItems(timelineRounds[nextRound].startOrder);
    setRoundLocked(false);
  }

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
        <p className="text-sm text-white/70">Loading Day 4 challenge...</p>
      </div>
    );
  }

  if (!TEST_FORCE_UNLOCK && nowMs < DAY_FOUR_START_IST) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <section className="w-full max-w-2xl rounded-2xl border border-[#f47a20]/35 bg-[#0b0b0b] p-6 text-center">
          <h1 className="text-2xl font-semibold text-[#f47a20]">Day 4 Locked</h1>
          <p className="mt-3 text-sm text-white/70">Day 4 unlocks in</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCountdown(DAY_FOUR_START_IST - nowMs)}</p>
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

  const activeQuestion = questions[currentQuestion];
  const activeRound = timelineRounds[currentRoundIndex];
  const allQuizAnswered = answers.every(answer => answer !== "");
  const showSubmitButton = stage === "timeline" && timelineResolved && allQuizAnswered;
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  const difficultyClassName =
    activeQuestion.difficulty === "Easy"
      ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
      : activeQuestion.difficulty === "Medium"
        ? "text-sky-300 border-sky-400/40 bg-sky-400/10"
        : activeQuestion.difficulty === "Hard"
          ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
          : "text-rose-300 border-rose-400/40 bg-rose-400/10";

  return renderPage(
    <section className="mx-auto w-full max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#f47a20]">Day 4 Challenge</h1>
          <p className="mt-1 text-sm text-white/70">Quiz first, then Sort It Out timeline mini-game</p>
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
              stage === "timeline"
                ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]"
                : "border-white/20 text-white/70"
            }`}
          >
            Stage 2: Sort It Out
          </span>
        </div>
      </section>

      {stage === "quiz" ? (
        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Quiz (10 Questions)</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${difficultyClassName}`}>
              {activeQuestion.difficulty}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/65">
            Question {currentQuestion + 1} of {questions.length}
          </p>

          <div className="mt-4 rounded-xl border border-white/10 bg-[#111111] p-4">
            <p className="text-base font-medium">{activeQuestion.question}</p>
            <div className="mt-3 space-y-2">
              {activeQuestion.options.map(option => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 py-2 hover:border-[#f47a20]/50"
                >
                  <input
                    type="radio"
                    name={`question-${activeQuestion.id}`}
                    value={option}
                    checked={answers[currentQuestion] === option}
                    disabled={submitted}
                    onChange={() => {
                      setAnswers(prev => {
                        const next = [...prev];
                        next[currentQuestion] = option;
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
              disabled={currentQuestion === 0}
              onClick={() => setCurrentQuestion(prev => Math.max(prev - 1, 0))}
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {currentQuestion < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentQuestion(prev => Math.min(prev + 1, questions.length - 1))}
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (answers.some(answer => answer === "")) {
                    alert("Please answer all 10 quiz questions before continuing.");
                    return;
                  }
                  setStage("timeline");
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
          <div className="rounded-xl border border-white/10 bg-[#111111] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">{activeRound.title}</h2>
              <p className="text-sm text-white/60">{currentRoundIndex + 1}/{timelineRounds.length}</p>
            </div>
            <p className="mt-2 text-center text-sm text-white/70">{activeRound.prompt}</p>

            <div className="mt-4 space-y-2">
              {roundItems.map((item, index) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-white/15 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-white/40">⋮</span>
                    <span>{item.label}</span>
                  </div>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => setRoundItems(prev => moveItem(prev, index, Math.max(0, index - 1)))}
                      disabled={roundLocked || index === 0}
                      className="text-white/80 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoundItems(prev => moveItem(prev, index, Math.min(prev.length - 1, index + 1)))}
                      disabled={roundLocked || index === roundItems.length - 1}
                      className="text-white/80 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <p className="text-sm">Score: {timelineScore}</p>
              {!roundLocked ? (
                <button
                  type="button"
                  onClick={submitRoundOrder}
                  className="rounded-full border border-[#f47a20] bg-[#f47a20] px-5 py-2 text-sm font-semibold text-black"
                >
                  Submit Order
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goToNextRound}
                  className="rounded-full border border-[#f47a20] bg-[#f47a20] px-5 py-2 text-sm font-semibold text-black"
                >
                  {currentRoundIndex < timelineRounds.length - 1 ? "Next Round" : "Finish Mini Game"}
                </button>
              )}
            </div>

            {roundLocked ? (
              <p className={`mt-3 text-sm font-semibold ${roundResults[currentRoundIndex] ? "text-emerald-300" : "text-rose-300"}`}>
                {roundResults[currentRoundIndex]
                  ? "Correct order!"
                  : "Order not correct for this round."}
              </p>
            ) : null}
          </div>
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
                "Confirm final submission for Day 4? You can submit only once."
              );
              if (!confirmed) return;
              void handleSubmit(false);
            }}
            className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 4"}
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
