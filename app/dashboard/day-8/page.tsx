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

type LogicQuestion = {
  id: number;
  sequence: string;
  prompt: string;
  options: number[];
  answerIndex: number;
  weight: number;
};

const QUIZ_TIME_SECONDS = 8 * 60;
const LOGIC_TIME_SECONDS = 45;
const CHALLENGE_START_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const DAY_EIGHT_START_IST = new Date("2026-04-18T00:00:00+05:30").getTime();
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_FORCE_UNLOCK = false;

const quizQuestions: QuizQuestion[] = [
  {
    id: 1,
    difficulty: "Easy",
    question: "SI unit of work is:",
    options: ["Watt", "Joule", "Newton", "Pascal"],
    answer: "Joule",
  },
  {
    id: 2,
    difficulty: "Easy",
    question: "Atomic number of oxygen is:",
    options: ["6", "7", "8", "9"],
    answer: "8",
  },
  {
    id: 3,
    difficulty: "Easy",
    question: "If 2x = 18, then x equals:",
    options: ["7", "8", "9", "10"],
    answer: "9",
  },
  {
    id: 4,
    difficulty: "Medium",
    question: "The slope of y = 4x + 1 is:",
    options: ["1", "2", "3", "4"],
    answer: "4",
  },
  {
    id: 5,
    difficulty: "Medium",
    question: "In an exothermic reaction, heat is:",
    options: ["absorbed", "released", "constant", "zero"],
    answer: "released",
  },
  {
    id: 6,
    difficulty: "Medium",
    question: "For a body in uniform motion, acceleration is:",
    options: ["1", "-1", "0", "infinite"],
    answer: "0",
  },
  {
    id: 7,
    difficulty: "Hard",
    question: "If A is a 3x2 matrix and B is 2x4, AB has size:",
    options: ["2x3", "3x4", "4x3", "2x4"],
    answer: "3x4",
  },
  {
    id: 8,
    difficulty: "Hard",
    question: "At resonance, inductive reactance and capacitive reactance are:",
    options: ["both zero", "equal", "opposite sign and unequal", "infinite"],
    answer: "equal",
  },
  {
    id: 9,
    difficulty: "Hard",
    question: "For first-order reaction, concentration decays:",
    options: ["linearly", "quadratically", "exponentially", "randomly"],
    answer: "exponentially",
  },
  {
    id: 10,
    difficulty: "Expert",
    question: "If f(x)=ln x, then f'(x) is:",
    options: ["x", "1/x", "ln x", "e^x"],
    answer: "1/x",
  },
];

const logicQuestions: LogicQuestion[] = [
  {
    id: 1,
    sequence: "2, 4, 6, 8, ?",
    prompt: "What number comes next?",
    options: [9, 10, 11, 12],
    answerIndex: 1,
    weight: 1,
  },
  {
    id: 2,
    sequence: "3, 6, 12, 24, ?",
    prompt: "What number comes next?",
    options: [36, 42, 48, 50],
    answerIndex: 2,
    weight: 2,
  },
  {
    id: 3,
    sequence: "5, 8, 11, 14, ?",
    prompt: "What number comes next?",
    options: [16, 17, 18, 19],
    answerIndex: 1,
    weight: 3,
  },
  {
    id: 4,
    sequence: "1, 1, 2, 3, 5, ?",
    prompt: "What number comes next?",
    options: [6, 7, 8, 9],
    answerIndex: 2,
    weight: 4,
  },
  {
    id: 5,
    sequence: "10, 20, 17, 34, 31, ?",
    prompt: "What number comes next?",
    options: [62, 64, 68, 70],
    answerIndex: 0,
    weight: 5,
  },
  {
    id: 6,
    sequence: "2, 3, 5, 9, 17, ?",
    prompt: "What number comes next?",
    options: [25, 31, 33, 35],
    answerIndex: 2,
    weight: 6,
  },
  {
    id: 7,
    sequence: "81, 27, 9, 3, ?",
    prompt: "What number comes next?",
    options: [0, 1, 2, 4],
    answerIndex: 1,
    weight: 7,
  },
  {
    id: 8,
    sequence: "4, 7, 13, 25, 49, ?",
    prompt: "What number comes next?",
    options: [91, 95, 97, 99],
    answerIndex: 2,
    weight: 8,
  },
];

const QUIZ_POINT_PER_CORRECT = 5;
const LOGIC_MAX_UNITS = logicQuestions.reduce((sum, item) => sum + item.weight, 0);

export default function DayEightPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"quiz" | "logic">("quiz");
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<string[]>(Array(quizQuestions.length).fill(""));

  const [logicStarted, setLogicStarted] = useState(false);
  const [logicCompleted, setLogicCompleted] = useState(false);
  const [logicTimeLeft, setLogicTimeLeft] = useState(LOGIC_TIME_SECONDS);
  const [logicIndex, setLogicIndex] = useState(0);
  const [logicAnswers, setLogicAnswers] = useState<Array<number | null>>(
    Array(logicQuestions.length).fill(null)
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
    if (!logicStarted || logicCompleted) return;
    if (logicTimeLeft <= 0) {
      setLogicCompleted(true);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLogicTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [logicCompleted, logicStarted, logicTimeLeft]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const logicCorrectCount = useMemo(
    () => logicQuestions.reduce((sum, item, index) => sum + (logicAnswers[index] === item.answerIndex ? 1 : 0), 0),
    [logicAnswers]
  );

  const logicUnits = useMemo(
    () =>
      logicQuestions.reduce((sum, item, index) => {
        return sum + (logicAnswers[index] === item.answerIndex ? item.weight : 0);
      }, 0),
    [logicAnswers]
  );

  const handleSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (!user || submitted || submitting) return;

      const hasAnyMissingQuizAnswer = quizAnswers.some(answer => answer === "");
      if (!autoSubmitted && hasAnyMissingQuizAnswer) {
        alert("Please answer all 10 quiz questions.");
        return;
      }

      if (!autoSubmitted && !logicCompleted) {
        alert("Please complete Final Logic Challenge.");
        return;
      }

      setSubmitting(true);

      try {
        const dayRef = doc(db, "users", user.uid, "days", "day8");
        const existingDaySubmission = await getDoc(dayRef);
        if (existingDaySubmission.exists()) {
          alert("You have already submitted Day 8. Only one submission is allowed.");
          setSubmitted(true);
          router.replace("/leaderboard");
          return;
        }

        const quizCorrect = quizQuestions.reduce((correctCount, item, index) => {
          return correctCount + (quizAnswers[index] === item.answer ? 1 : 0);
        }, 0);

        const quizPoints = quizCorrect * QUIZ_POINT_PER_CORRECT;
        const logicPoints = logicUnits;
        const basePoints = quizPoints + logicPoints;

        const totalCorrectCount = quizCorrect + logicUnits;
        const totalQuestionCount = quizQuestions.length + LOGIC_MAX_UNITS;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(QUIZ_TIME_SECONDS - elapsedSeconds, 0);
        const timeBonusPerCorrect = Math.floor(remainingSeconds / totalQuestionCount);
        const timeBonusPoints = totalCorrectCount * timeBonusPerCorrect;
        const rawTotalPoints = basePoints + timeBonusPoints;

        const nowForPenalty = Date.now();
        const elapsedDaysFromStart = Math.floor((nowForPenalty - CHALLENGE_START_IST) / DAY_MS);
        const currentChallengeDay = Math.min(Math.max(elapsedDaysFromStart + 1, 1), CHALLENGE_TOTAL_DAYS);
        const daysLate = Math.max(currentChallengeDay - 8, 0);
        const latePenaltyMultiplier = Math.max(1 - daysLate * 0.1, 0.1);
        const totalPoints = Math.round(rawTotalPoints * latePenaltyMultiplier);

        const leaderboardRef = doc(db, "leaderboard", user.uid);
        const leaderboardSnap = await getDoc(leaderboardRef);
        const existingDayPoints = leaderboardSnap.exists()
          ? ((leaderboardSnap.data().dayPoints ?? {}) as Record<string, number>)
          : {};

        const nextDayPoints: Record<string, number> = {
          ...existingDayPoints,
          day8: totalPoints,
        };

        const nextTotalPoints = Object.values(nextDayPoints).reduce(
          (sum, points) => sum + Number(points || 0),
          0
        );

        const batch = writeBatch(db);

        batch.set(
          dayRef,
          {
            day: 8,
            quizAnswers,
            quizCorrect,
            quizPoints,
            logicAnswers,
            logicCorrectCount,
            logicUnits,
            logicPoints,
            logicTimeLimitSeconds: LOGIC_TIME_SECONDS,
            logicTimeRemainingSeconds: logicTimeLeft,
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
        console.error("Failed to submit Day 8 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [logicAnswers, logicCompleted, logicCorrectCount, logicTimeLeft, logicUnits, quizAnswers, router, submitted, submitting, user]
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
        <p className="text-sm text-white/70">Loading Day 8 challenge...</p>
      </div>
    );
  }

  if (!TEST_FORCE_UNLOCK && nowMs < DAY_EIGHT_START_IST) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <section className="w-full max-w-2xl rounded-2xl border border-[#f47a20]/35 bg-[#0b0b0b] p-6 text-center">
          <h1 className="text-2xl font-semibold text-[#f47a20]">Day 8 Locked</h1>
          <p className="mt-3 text-sm text-white/70">Day 8 unlocks in</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCountdown(DAY_EIGHT_START_IST - nowMs)}</p>
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
  const activeLogicQuestion = logicQuestions[logicIndex];
  const allQuizAnswered = quizAnswers.every(answer => answer !== "");
  const showSubmitButton = stage === "logic" && logicCompleted && allQuizAnswered;
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
          <h1 className="text-3xl font-semibold text-[#f47a20]">Day 8 Challenge</h1>
          <p className="mt-1 text-sm text-white/70">Quiz first, then Final Logic Challenge</p>
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
              stage === "logic"
                ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]"
                : "border-white/20 text-white/70"
            }`}
          >
            Stage 2: Final Logic Challenge
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
                  setStage("logic");
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
          {!logicStarted ? (
            <div className="rounded-2xl border border-white/15 bg-[#111111] p-6 text-center">
              <h2 className="text-3xl font-semibold text-[#f2f2f2]">Final Logic Challenge</h2>
              <p className="mt-3 text-lg text-[#87b6ad]">What number comes next?</p>
              <button
                type="button"
                onClick={() => {
                  setLogicStarted(true);
                  setLogicCompleted(false);
                  setLogicTimeLeft(LOGIC_TIME_SECONDS);
                  setLogicIndex(0);
                  setLogicAnswers(Array(logicQuestions.length).fill(null));
                }}
                className="mt-6 rounded-xl border border-emerald-600 bg-emerald-700 px-8 py-3 text-lg font-medium text-white hover:bg-emerald-600"
              >
                Start Game
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/15 bg-[#111111] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Final Logic Challenge</h2>
                <div className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-1.5 text-sm font-semibold text-emerald-300">
                  {logicCompleted ? "Completed" : `00:${String(logicTimeLeft).padStart(2, "0")}`}
                </div>
              </div>
              <p className="mt-2 text-sm text-white/70">
                Q{Math.min(logicIndex + 1, logicQuestions.length)}/{logicQuestions.length} | Correct: {logicCorrectCount} | Logic Units: {logicUnits}/{LOGIC_MAX_UNITS}
              </p>

              {!logicCompleted ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4">
                  <p className="text-xl font-semibold tracking-wide">{activeLogicQuestion.sequence}</p>
                  <p className="mt-1 text-sm text-white/70">{activeLogicQuestion.prompt}</p>
                  <p className="mt-1 text-xs text-white/55">Difficulty Weight: {activeLogicQuestion.weight}</p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {activeLogicQuestion.options.map((option, optionIndex) => (
                      <button
                        key={`${activeLogicQuestion.id}-${option}`}
                        type="button"
                        onClick={() => {
                          setLogicAnswers(prev => {
                            const next = [...prev];
                            next[logicIndex] = optionIndex;
                            return next;
                          });

                          if (logicIndex >= logicQuestions.length - 1) {
                            setLogicCompleted(true);
                            return;
                          }

                          setLogicIndex(prev => prev + 1);
                        }}
                        className="rounded-lg border border-white/15 bg-[#202020] px-3 py-2 text-left text-sm hover:border-[#f47a20]/50"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#151515] p-4 text-sm text-white/80">
                  <p>Final Logic Challenge complete.</p>
                  <p className="mt-1">Correct Answers: {logicCorrectCount}/{logicQuestions.length}</p>
                  <p className="mt-1">Logic Units: {logicUnits}/{LOGIC_MAX_UNITS}</p>
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
                "Confirm final submission for Day 8? You can submit only once."
              );
              if (!confirmed) return;
              void handleSubmit(false);
            }}
            className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 8"}
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
