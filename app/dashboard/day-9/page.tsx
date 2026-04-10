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

type CompareQuestion = {
  id: number;
  leftExpr: string;
  rightExpr: string;
  answer: "A > B" | "A < B" | "A = B";
  weight: number;
};

const QUIZ_TIME_SECONDS = 15 * 60;
const COMPARE_TIME_SECONDS = 45;
const CHALLENGE_START_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const DAY_NINE_START_IST = new Date("2026-04-19T00:00:00+05:30").getTime();
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_FORCE_UNLOCK = false;

const quizQuestions: QuizQuestion[] = [
  {
    id: 1,
    difficulty: "Easy",
    question: "SI unit of power is:",
    options: ["Joule", "Watt", "Newton", "Volt"],
    answer: "Watt",
  },
  {
    id: 2,
    difficulty: "Easy",
    question: "Atomic number of nitrogen is:",
    options: ["6", "7", "8", "9"],
    answer: "7",
  },
  {
    id: 3,
    difficulty: "Easy",
    question: "If 5x = 40, then x is:",
    options: ["6", "7", "8", "9"],
    answer: "8",
  },
  {
    id: 4,
    difficulty: "Easy",
    question: "Value of pi approximately is:",
    options: ["2.14", "2.71", "3.14", "3.41"],
    answer: "3.14",
  },
  {
    id: 5,
    difficulty: "Easy",
    question: "An acute angle is:",
    options: ["< 90 degrees", "= 90 degrees", "> 90 degrees", "= 180 degrees"],
    answer: "< 90 degrees",
  },
  {
    id: 6,
    difficulty: "Medium",
    question: "Derivative of x^3 is:",
    options: ["x^2", "2x", "3x^2", "3x"],
    answer: "3x^2",
  },
  {
    id: 7,
    difficulty: "Medium",
    question: "In ideal gas equation PV = nRT, R is:",
    options: ["resistance", "gas constant", "radius", "reactance"],
    answer: "gas constant",
  },
  {
    id: 8,
    difficulty: "Medium",
    question: "pH greater than 7 indicates:",
    options: ["acidic", "basic", "neutral", "salt only"],
    answer: "basic",
  },
  {
    id: 9,
    difficulty: "Medium",
    question: "Integral of 1 dx is:",
    options: ["1", "x + C", "ln x", "x^2/2"],
    answer: "x + C",
  },
  {
    id: 10,
    difficulty: "Medium",
    question: "For series circuit, current is:",
    options: ["different in each element", "same in each element", "zero", "infinite"],
    answer: "same in each element",
  },
  {
    id: 11,
    difficulty: "Hard",
    question: "A 2x2 matrix is invertible if determinant is:",
    options: ["0", "1", "non-zero", "negative only"],
    answer: "non-zero",
  },
  {
    id: 12,
    difficulty: "Hard",
    question: "In SHM, acceleration is proportional to displacement and:",
    options: ["same direction", "opposite direction", "always zero", "always positive"],
    answer: "opposite direction",
  },
  {
    id: 13,
    difficulty: "Hard",
    question: "Unit of electric field is:",
    options: ["N/C", "C/N", "J/C", "W/C"],
    answer: "N/C",
  },
  {
    id: 14,
    difficulty: "Hard",
    question: "For first-order linear differential equation, solution uses:",
    options: ["Laplace only", "integration factor", "binomial expansion", "Taylor series only"],
    answer: "integration factor",
  },
  {
    id: 15,
    difficulty: "Hard",
    question: "In probability, P(A union B) equals:",
    options: ["P(A)+P(B)", "P(A)P(B)", "P(A)+P(B)-P(A intersection B)", "1-P(A)"],
    answer: "P(A)+P(B)-P(A intersection B)",
  },
  {
    id: 16,
    difficulty: "Expert",
    question: "d/dx (ln x) is:",
    options: ["x", "1/x", "ln x", "e^x"],
    answer: "1/x",
  },
  {
    id: 17,
    difficulty: "Expert",
    question: "If eigenvalues are 2 and 5, trace is:",
    options: ["3", "7", "10", "2.5"],
    answer: "7",
  },
  {
    id: 18,
    difficulty: "Expert",
    question: "For exponential growth y = ae^(kt), if k>0 then y:",
    options: ["decreases", "stays constant", "increases", "oscillates"],
    answer: "increases",
  },
  {
    id: 19,
    difficulty: "Expert",
    question: "Laplace transform of 1 is:",
    options: ["1", "s", "1/s", "s^2"],
    answer: "1/s",
  },
  {
    id: 20,
    difficulty: "Expert",
    question: "If A and B are independent events, P(A and B) =",
    options: ["P(A)+P(B)", "P(A)P(B)", "P(A)-P(B)", "1"],
    answer: "P(A)P(B)",
  },
];

const compareQuestions: CompareQuestion[] = [
  { id: 1, leftExpr: "12 + 8", rightExpr: "5 x 4", answer: "A = B", weight: 1 },
  { id: 2, leftExpr: "7^2", rightExpr: "50", answer: "A < B", weight: 2 },
  { id: 3, leftExpr: "sqrt(196)", rightExpr: "13", answer: "A > B", weight: 3 },
  { id: 4, leftExpr: "3^4", rightExpr: "2^6", answer: "A > B", weight: 4 },
  { id: 5, leftExpr: "15% of 300", rightExpr: "44", answer: "A > B", weight: 5 },
  { id: 6, leftExpr: "(18/3) + 7", rightExpr: "2 x 6", answer: "A > B", weight: 6 },
  { id: 7, leftExpr: "5!", rightExpr: "2^7", answer: "A < B", weight: 7 },
  { id: 8, leftExpr: "(9 x 9) - 12", rightExpr: "70", answer: "A < B", weight: 8 },
  { id: 9, leftExpr: "1/2 + 1/3", rightExpr: "5/6", answer: "A = B", weight: 9 },
  { id: 10, leftExpr: "log10(1000)", rightExpr: "3", answer: "A = B", weight: 10 },
];

const QUIZ_POINT_PER_CORRECT = 4;
const COMPARE_POINT_PER_UNIT = 2;
const COMPARE_MAX_UNITS = compareQuestions.reduce((sum, item) => sum + item.weight, 0);
const COMPARE_OPTIONS: Array<"A > B" | "A < B" | "A = B"> = ["A > B", "A < B", "A = B"];

export default function DayNinePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"quiz" | "compare">("quiz");
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<string[]>(Array(quizQuestions.length).fill(""));

  const [compareStarted, setCompareStarted] = useState(false);
  const [compareCompleted, setCompareCompleted] = useState(false);
  const [compareTimeLeft, setCompareTimeLeft] = useState(COMPARE_TIME_SECONDS);
  const [compareIndex, setCompareIndex] = useState(0);
  const [compareAnswers, setCompareAnswers] = useState<Array<"A > B" | "A < B" | "A = B" | null>>(
    Array(compareQuestions.length).fill(null)
  );

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
    if (!compareStarted || compareCompleted) return;
    if (compareTimeLeft <= 0) {
      setCompareCompleted(true);
      return;
    }

    const intervalId = window.setInterval(() => {
      setCompareTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [compareCompleted, compareStarted, compareTimeLeft]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const compareCorrectCount = useMemo(
    () => compareQuestions.reduce((sum, item, index) => sum + (compareAnswers[index] === item.answer ? 1 : 0), 0),
    [compareAnswers]
  );

  const compareUnits = useMemo(
    () =>
      compareQuestions.reduce((sum, item, index) => {
        return sum + (compareAnswers[index] === item.answer ? item.weight : 0);
      }, 0),
    [compareAnswers]
  );

  const handleSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (!user || submitted || submitting) return;

      const hasAnyMissingQuizAnswer = quizAnswers.some(answer => answer === "");
      if (!autoSubmitted && hasAnyMissingQuizAnswer) {
        alert("Please answer all 20 quiz questions.");
        return;
      }

      if (!autoSubmitted && !compareCompleted) {
        alert("Please complete Rapid Compare.");
        return;
      }

      setSubmitting(true);

      try {
        const dayRef = doc(db, "users", user.uid, "days", "day9");
        const existingDaySubmission = await getDoc(dayRef);
        if (existingDaySubmission.exists()) {
          alert("You have already submitted Day 9. Only one submission is allowed.");
          setSubmitted(true);
          router.replace("/leaderboard");
          return;
        }

        const quizCorrect = quizQuestions.reduce((correctCount, item, index) => {
          return correctCount + (quizAnswers[index] === item.answer ? 1 : 0);
        }, 0);

        const quizPoints = quizCorrect * QUIZ_POINT_PER_CORRECT;
        const comparePoints = compareUnits * COMPARE_POINT_PER_UNIT;
        const basePoints = quizPoints + comparePoints;

        const totalCorrectCount = quizCorrect + compareUnits;
        const totalQuestionCount = quizQuestions.length + COMPARE_MAX_UNITS;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(QUIZ_TIME_SECONDS - elapsedSeconds, 0);
        const timeBonusPerCorrect = Math.floor(remainingSeconds / totalQuestionCount);
        const timeBonusPoints = totalCorrectCount * timeBonusPerCorrect;
        const rawTotalPoints = basePoints + timeBonusPoints;

        const nowForPenalty = Date.now();
        const elapsedDaysFromStart = Math.floor((nowForPenalty - CHALLENGE_START_IST) / DAY_MS);
        const currentChallengeDay = Math.min(Math.max(elapsedDaysFromStart + 1, 1), CHALLENGE_TOTAL_DAYS);
        const daysLate = Math.max(currentChallengeDay - 9, 0);
        const latePenaltyMultiplier = Math.max(1 - daysLate * 0.1, 0.1);
        const totalPoints = Math.round(rawTotalPoints * latePenaltyMultiplier);

        const leaderboardRef = doc(db, "leaderboard", user.uid);
        const leaderboardSnap = await getDoc(leaderboardRef);
        const existingDayPoints = leaderboardSnap.exists()
          ? ((leaderboardSnap.data().dayPoints ?? {}) as Record<string, number>)
          : {};

        const nextDayPoints: Record<string, number> = {
          ...existingDayPoints,
          day9: totalPoints,
        };

        const nextTotalPoints = Object.values(nextDayPoints).reduce(
          (sum, points) => sum + Number(points || 0),
          0
        );

        const batch = writeBatch(db);

        batch.set(
          dayRef,
          {
            day: 9,
            quizAnswers,
            quizCorrect,
            quizPoints,
            compareAnswers,
            compareCorrectCount,
            compareUnits,
            comparePoints,
            compareTimeLimitSeconds: COMPARE_TIME_SECONDS,
            compareTimeRemainingSeconds: compareTimeLeft,
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
        console.error("Failed to submit Day 9 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      compareAnswers,
      compareCompleted,
      compareCorrectCount,
      compareTimeLeft,
      compareUnits,
      quizAnswers,
      router,
      submitted,
      submitting,
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
        <p className="text-sm text-white/70">Loading Day 9 challenge...</p>
      </div>
    );
  }

  if (!TEST_FORCE_UNLOCK && nowMs < DAY_NINE_START_IST) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <section className="w-full max-w-2xl rounded-2xl border border-[#f47a20]/35 bg-[#0b0b0b] p-6 text-center">
          <h1 className="text-2xl font-semibold text-[#f47a20]">Day 9 Locked</h1>
          <p className="mt-3 text-sm text-white/70">Day 9 unlocks in</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCountdown(DAY_NINE_START_IST - nowMs)}</p>
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
  const activeCompareQuestion = compareQuestions[compareIndex];
  const allQuizAnswered = quizAnswers.every(answer => answer !== "");
  const showSubmitButton = stage === "compare" && compareCompleted && allQuizAnswered;
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
          <h1 className="text-3xl font-semibold text-[#f47a20]">Day 9 Challenge</h1>
          <p className="mt-1 text-sm text-white/70">20-question quiz + Rapid Compare mini-game</p>
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
              stage === "compare"
                ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]"
                : "border-white/20 text-white/70"
            }`}
          >
            Stage 2: Rapid Compare
          </span>
        </div>
      </section>

      {stage === "quiz" ? (
        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Quiz (20 Questions)</h2>
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
                    alert("Please answer all 20 quiz questions before continuing.");
                    return;
                  }
                  setStage("compare");
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
          {!compareStarted ? (
            <div className="rounded-2xl border border-white/15 bg-[#111111] p-6 text-center">
              <h2 className="text-3xl font-semibold text-[#f2f2f2]">Rapid Compare</h2>
              <p className="mt-3 text-lg text-[#87b6ad]">Pick whether A is greater, less, or equal to B.</p>
              <button
                type="button"
                onClick={() => {
                  setCompareStarted(true);
                  setCompareCompleted(false);
                  setCompareTimeLeft(COMPARE_TIME_SECONDS);
                  setCompareIndex(0);
                  setCompareAnswers(Array(compareQuestions.length).fill(null));
                }}
                className="mt-6 rounded-xl border border-emerald-600 bg-emerald-700 px-8 py-3 text-lg font-medium text-white hover:bg-emerald-600"
              >
                Start Game
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/15 bg-[#111111] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Rapid Compare</h2>
                <div className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-300">
                  {compareCompleted ? "Completed" : `00:${String(compareTimeLeft).padStart(2, "0")}`}
                </div>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Q{Math.min(compareIndex + 1, compareQuestions.length)}/{compareQuestions.length} | Correct: {compareCorrectCount} | Compare Units: {compareUnits}/{COMPARE_MAX_UNITS}
              </p>

              {!compareCompleted ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-center">
                      <p className="text-xs text-white/55">A</p>
                      <p className="mt-1 text-xl font-semibold">{activeCompareQuestion.leftExpr}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-center">
                      <p className="text-xs text-white/55">B</p>
                      <p className="mt-1 text-xl font-semibold">{activeCompareQuestion.rightExpr}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-white/55">Difficulty Weight: {activeCompareQuestion.weight}</p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {COMPARE_OPTIONS.map(option => (
                      <button
                        key={`${activeCompareQuestion.id}-${option}`}
                        type="button"
                        onClick={() => {
                          setCompareAnswers(prev => {
                            const next = [...prev];
                            next[compareIndex] = option;
                            return next;
                          });

                          if (compareIndex >= compareQuestions.length - 1) {
                            setCompareCompleted(true);
                            return;
                          }

                          setCompareIndex(prev => prev + 1);
                        }}
                        className="rounded-lg border border-white/15 bg-[#202020] px-3 py-2 text-sm hover:border-[#f47a20]/50"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4 text-sm text-white/80">
                  <p>Rapid Compare complete.</p>
                  <p className="mt-1">Correct Answers: {compareCorrectCount}/{compareQuestions.length}</p>
                  <p className="mt-1">Compare Units: {compareUnits}/{COMPARE_MAX_UNITS}</p>
                </div>
              )}
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
                "Confirm final submission for Day 9? You can submit only once."
              );
              if (!confirmed) return;
              void handleSubmit(false);
            }}
            className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 9"}
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
