"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

type OddOneLevel = {
  id: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  prompt: string;
  options: string[];
  answer: string;
};

const QUIZ_TIME_SECONDS = 8 * 60;
const DAY_ONE_START_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const CHALLENGE_START_IST = DAY_ONE_START_IST;
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;

const questions: Question[] = [
  {
    id: 1,
    difficulty: "Easy",
    question: "What is the SI unit of force?",
    options: ["Joule", "Newton", "Pascal", "Watt"],
    answer: "Newton",
  },
  {
    id: 2,
    difficulty: "Easy",
    question: "At 25 C, the pH of pure water is closest to:",
    options: ["5", "7", "9", "12"],
    answer: "7",
  },
  {
    id: 3,
    difficulty: "Easy",
    question: "For a 2x2 matrix [[a,b],[c,d]], its determinant is:",
    options: ["ad + bc", "ab - cd", "ad - bc", "ac - bd"],
    answer: "ad - bc",
  },
  {
    id: 4,
    difficulty: "Medium",
    question: "For an ideal gas, which relation is correct?",
    options: ["Cp + Cv = R", "Cp - Cv = R", "Cv - Cp = R", "Cp x Cv = R"],
    answer: "Cp - Cv = R",
  },
  {
    id: 5,
    difficulty: "Medium",
    question: "The value of lim(x->0) sin(x)/x is:",
    options: ["0", "1", "Infinity", "-1"],
    answer: "1",
  },
  {
    id: 6,
    difficulty: "Medium",
    question: "Hybridization of carbon in methane (CH4) is:",
    options: ["sp", "sp2", "sp3", "dsp2"],
    answer: "sp3",
  },
  {
    id: 7,
    difficulty: "Hard",
    question: "A first-order reaction has half-life that is:",
    options: [
      "Directly proportional to initial concentration",
      "Inversely proportional to initial concentration",
      "Independent of initial concentration",
      "Zero at completion",
    ],
    answer: "Independent of initial concentration",
  },
  {
    id: 8,
    difficulty: "Hard",
    question: "For a square matrix, the sum of eigenvalues equals:",
    options: ["Determinant", "Trace", "Rank", "Norm"],
    answer: "Trace",
  },
  {
    id: 9,
    difficulty: "Hard",
    question: "In simple harmonic motion, acceleration is:",
    options: [
      "Proportional to displacement and opposite in direction",
      "Proportional to velocity",
      "Constant",
      "Always zero at mean position",
    ],
    answer: "Proportional to displacement and opposite in direction",
  },
  {
    id: 10,
    difficulty: "Expert",
    question: "The Divergence Theorem relates surface flux to:",
    options: [
      "Line integral of curl",
      "Surface integral of gradient",
      "Volume integral of divergence",
      "Time derivative of potential",
    ],
    answer: "Volume integral of divergence",
  },
];

const oddOneLevels: OddOneLevel[] = [
  {
    id: 1,
    difficulty: "Easy",
    prompt: "Pick the odd one out.",
    options: ["Velocity", "Force", "Acceleration", "Mass"],
    answer: "Mass",
  },
  {
    id: 2,
    difficulty: "Easy",
    prompt: "Pick the odd one out.",
    options: ["Sodium", "Potassium", "Calcium", "Chlorine"],
    answer: "Chlorine",
  },
  {
    id: 3,
    difficulty: "Medium",
    prompt: "Pick the odd one out.",
    options: ["Ellipse", "Parabola", "Hyperbola", "Pentagon"],
    answer: "Pentagon",
  },
  {
    id: 4,
    difficulty: "Hard",
    prompt: "Pick the odd one out.",
    options: ["Adiabatic", "Isothermal", "Isochoric", "Isotonic"],
    answer: "Isotonic",
  },
  {
    id: 5,
    difficulty: "Expert",
    prompt: "Pick the odd one out.",
    options: ["Planck constant", "Boltzmann constant", "Avogadro constant", "Pythagorean theorem"],
    answer: "Pythagorean theorem",
  },
];

const QUIZ_POINT_PER_CORRECT = 5;
const ODD_ONE_POINT_PER_CORRECT = 10;

export default function DayOnePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"quiz" | "odd">("quiz");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(""));
  const [currentOddIndex, setCurrentOddIndex] = useState(0);
  const [oddSelections, setOddSelections] = useState<string[]>(
    Array(oddOneLevels.length).fill("")
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
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const handleSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (!user || submitted || submitting) return;

      const hasAnyMissingQuizAnswer = answers.some(answer => answer === "");
      if (!autoSubmitted && hasAnyMissingQuizAnswer) {
        alert("Please answer all 10 quiz questions.");
        return;
      }

      const hasAnyMissingOddSelection = oddSelections.some(selection => selection === "");
      if (!autoSubmitted && hasAnyMissingOddSelection) {
        alert("Please complete all 5 odd one out levels.");
        return;
      }

      setSubmitting(true);

      try {
        const dayRef = doc(db, "users", user.uid, "days", "day1");
        const existingDaySubmission = await getDoc(dayRef);
        if (existingDaySubmission.exists()) {
          alert("You have already submitted Day 1. Only one submission is allowed.");
          setSubmitted(true);
          router.replace("/leaderboard");
          return;
        }

        const quizCorrect = questions.reduce((correctCount, item, index) => {
          return correctCount + (answers[index] === item.answer ? 1 : 0);
        }, 0);

        const oddCorrectCount = oddOneLevels.reduce((correctCount, level, index) => {
          return correctCount + (oddSelections[index] === level.answer ? 1 : 0);
        }, 0);

        const quizPoints = quizCorrect * QUIZ_POINT_PER_CORRECT;
        const oddPoints = oddCorrectCount * ODD_ONE_POINT_PER_CORRECT;
        const basePoints = quizPoints + oddPoints;
        const totalCorrectCount = quizCorrect + oddCorrectCount;
        const totalQuestionCount = questions.length + oddOneLevels.length;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(QUIZ_TIME_SECONDS - elapsedSeconds, 0);
        const timeBonusPerCorrect = Math.floor(remainingSeconds / totalQuestionCount);
        const timeBonusPoints = totalCorrectCount * timeBonusPerCorrect;
        const rawTotalPoints = basePoints + timeBonusPoints;

        const nowForPenalty = Date.now();
        const elapsedDaysFromStart = Math.floor((nowForPenalty - CHALLENGE_START_IST) / DAY_MS);
        const currentChallengeDay = Math.min(Math.max(elapsedDaysFromStart + 1, 1), CHALLENGE_TOTAL_DAYS);
        const daysLate = Math.max(currentChallengeDay - 1, 0);
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
          day1: totalPoints,
        };

        const nextTotalPoints = Object.values(nextDayPoints).reduce(
          (sum, points) => sum + Number(points || 0),
          0
        );

        const batch = writeBatch(db);

        batch.set(
          dayRef,
          {
            day: 1,
            quizAnswers: answers,
            quizCorrect,
            quizPoints,
            oddOneSelections: oddSelections,
            oddOneCorrectCount: oddCorrectCount,
            oddOnePoints: oddPoints,
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
        console.error("Failed to submit Day 1 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, oddSelections, router, submitted, submitting, user]
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
        <p className="text-sm text-white/70">Loading Day 1 challenge...</p>
      </div>
    );
  }

  if (nowMs < DAY_ONE_START_IST) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <section className="w-full max-w-2xl rounded-2xl border border-[#f47a20]/35 bg-[#0b0b0b] p-6 text-center">
          <h1 className="text-2xl font-semibold text-[#f47a20]">Day 1 Locked</h1>
          <p className="mt-3 text-sm text-white/70">Day 1 unlocks in</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCountdown(DAY_ONE_START_IST - nowMs)}</p>
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
  const activeOddLevel = oddOneLevels[currentOddIndex];
  const allQuizAnswered = answers.every(answer => answer !== "");
  const allOddAnswered = oddSelections.every(selection => selection !== "");
  const showSubmitButton =
    stage === "odd" && currentOddIndex === oddOneLevels.length - 1 && allQuizAnswered && allOddAnswered;
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

  const oddDifficultyClassName =
    activeOddLevel.difficulty === "Easy"
      ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
      : activeOddLevel.difficulty === "Medium"
        ? "text-sky-300 border-sky-400/40 bg-sky-400/10"
        : activeOddLevel.difficulty === "Hard"
          ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
          : "text-rose-300 border-rose-400/40 bg-rose-400/10";

  return renderPage(
    <section className="mx-auto w-full max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-[#f47a20]">Day 1 Challenge</h1>
            <p className="mt-1 text-sm text-white/70">Quiz first, then 5-level Odd One Out</p>
          </div>
          <div className="rounded-full border border-[#f47a20]/60 bg-[#f47a20]/10 px-4 py-2 text-sm font-semibold text-[#f47a20]">
            Timer: {minutes}:{seconds}
          </div>
        </div>

        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span
              className={`rounded-full border px-3 py-1 font-medium ${
                stage === "quiz" ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]" : "border-white/20 text-white/70"
              }`}
            >
              Stage 1: Quiz
            </span>
            <span
              className={`rounded-full border px-3 py-1 font-medium ${
                stage === "odd" ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]" : "border-white/20 text-white/70"
              }`}
            >
              Stage 2: Odd One Out
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
                    setStage("odd");
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Odd One Out (5 Levels)</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${oddDifficultyClassName}`}>
                {activeOddLevel.difficulty}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/65">
              Level {currentOddIndex + 1} of {oddOneLevels.length}
            </p>
            <p className="mt-3 text-sm text-white/75">{activeOddLevel.prompt}</p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {activeOddLevel.options.map(option => {
                const isSelected = oddSelections[currentOddIndex] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={submitted}
                    onClick={() => {
                      setOddSelections(prev => {
                        const next = [...prev];
                        next[currentOddIndex] = option;
                        return next;
                      });
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      isSelected
                        ? "border-[#f47a20] bg-[#f47a20]/15 text-[#f47a20]"
                        : "border-white/15 bg-[#101010]"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (currentOddIndex === 0) {
                    setStage("quiz");
                    return;
                  }
                  setCurrentOddIndex(prev => Math.max(prev - 1, 0));
                }}
                className="rounded-full border border-white/20 px-4 py-2 text-sm"
              >
                {currentOddIndex === 0 ? "Back to Quiz" : "Previous"}
              </button>

              {currentOddIndex < oddOneLevels.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!oddSelections[currentOddIndex]) {
                      alert("Please select an option to continue.");
                      return;
                    }
                    setCurrentOddIndex(prev => Math.min(prev + 1, oddOneLevels.length - 1));
                  }}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm"
                >
                  Next
                </button>
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
                  "Confirm final submission for Day 1? You can submit only once."
                );
                if (!confirmed) return;
                void handleSubmit(false);
              }}
              className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 1"}
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
