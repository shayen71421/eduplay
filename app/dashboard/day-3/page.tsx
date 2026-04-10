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

type CodeColor = "RED" | "BLUE" | "GREEN" | "YELLOW" | "PURPLE" | "ORANGE";

type GuessResult = {
  guess: CodeColor[];
  exact: number;
  colorOnly: number;
};

const QUIZ_TIME_SECONDS = 8 * 60;
const CHALLENGE_START_IST = new Date("2026-04-11T00:00:00+05:30").getTime();
const DAY_THREE_START_IST = new Date("2026-04-13T00:00:00+05:30").getTime();
const CHALLENGE_TOTAL_DAYS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_FORCE_UNLOCK = false;

const CODE_COLORS: CodeColor[] = ["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE"];
const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 8;

const questions: Question[] = [
  {
    id: 1,
    difficulty: "Easy",
    question: "Which unit is used to measure electric current?",
    options: ["Volt", "Ampere", "Ohm", "Watt"],
    answer: "Ampere",
  },
  {
    id: 2,
    difficulty: "Easy",
    question: "Valency of oxygen in most compounds is:",
    options: ["1", "2", "3", "4"],
    answer: "2",
  },
  {
    id: 3,
    difficulty: "Easy",
    question: "Value of pi (to two decimal places) is:",
    options: ["3.12", "3.14", "3.16", "3.18"],
    answer: "3.14",
  },
  {
    id: 4,
    difficulty: "Medium",
    question: "Which law explains pressure-volume relation at constant temperature?",
    options: ["Charles' law", "Boyle's law", "Ohm's law", "Hooke's law"],
    answer: "Boyle's law",
  },
  {
    id: 5,
    difficulty: "Medium",
    question: "If f(x) = e^x, then f'(x) is:",
    options: ["x e^(x-1)", "e^x", "ln(x)", "1/e^x"],
    answer: "e^x",
  },
  {
    id: 6,
    difficulty: "Medium",
    question: "The gas evolved when zinc reacts with dilute HCl is:",
    options: ["Oxygen", "Nitrogen", "Hydrogen", "Chlorine"],
    answer: "Hydrogen",
  },
  {
    id: 7,
    difficulty: "Hard",
    question: "Dimension of work is:",
    options: ["MLT^-1", "ML^2T^-2", "ML^-1T^-2", "M^0L^0T^-1"],
    answer: "ML^2T^-2",
  },
  {
    id: 8,
    difficulty: "Hard",
    question: "For matrix A, if A^T = A, then A is:",
    options: ["Skew-symmetric", "Symmetric", "Orthogonal", "Singular"],
    answer: "Symmetric",
  },
  {
    id: 9,
    difficulty: "Hard",
    question: "pKa of a stronger acid is generally:",
    options: ["Higher", "Lower", "Always 7", "Always 14"],
    answer: "Lower",
  },
  {
    id: 10,
    difficulty: "Expert",
    question: "If y = ln(sin x), then dy/dx equals:",
    options: ["tan x", "cot x", "sec x", "csc x"],
    answer: "cot x",
  },
];

const QUIZ_POINT_PER_CORRECT = 5;
const CODE_BREAKER_POINT_UNITS = 5;
const CODE_BREAKER_POINT_PER_UNIT = 10;

function randomColor(): CodeColor {
  return CODE_COLORS[Math.floor(Math.random() * CODE_COLORS.length)];
}

function generateSecretCode(): CodeColor[] {
  return Array.from({ length: CODE_LENGTH }, () => randomColor());
}

function evaluateGuess(guess: CodeColor[], secret: CodeColor[]) {
  let exact = 0;
  const secretRemainder: CodeColor[] = [];
  const guessRemainder: CodeColor[] = [];

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    if (guess[i] === secret[i]) {
      exact += 1;
    } else {
      secretRemainder.push(secret[i]);
      guessRemainder.push(guess[i]);
    }
  }

  let colorOnly = 0;
  for (const color of guessRemainder) {
    const index = secretRemainder.indexOf(color);
    if (index >= 0) {
      colorOnly += 1;
      secretRemainder.splice(index, 1);
    }
  }

  return { exact, colorOnly };
}

function colorClass(color: CodeColor) {
  switch (color) {
    case "RED":
      return "bg-red-500";
    case "BLUE":
      return "bg-blue-500";
    case "GREEN":
      return "bg-lime-600";
    case "YELLOW":
      return "bg-yellow-400";
    case "PURPLE":
      return "bg-purple-500";
    case "ORANGE":
      return "bg-orange-500";
    default:
      return "bg-white";
  }
}

export default function DayThreePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"quiz" | "codebreaker">("quiz");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(""));

  const [gameStarted, setGameStarted] = useState(false);
  const [secretCode, setSecretCode] = useState<CodeColor[]>([]);
  const [currentGuess, setCurrentGuess] = useState<Array<CodeColor | null>>(
    Array(CODE_LENGTH).fill(null)
  );
  const [draggingColor, setDraggingColor] = useState<CodeColor | null>(null);
  const [guessHistory, setGuessHistory] = useState<GuessResult[]>([]);
  const [codeBreakerResolved, setCodeBreakerResolved] = useState(false);
  const [codeBreakerSuccess, setCodeBreakerSuccess] = useState(false);

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

      if (!autoSubmitted && !codeBreakerResolved) {
        alert("Please complete the Code Breaker mini-game.");
        return;
      }

      setSubmitting(true);

      try {
        const dayRef = doc(db, "users", user.uid, "days", "day3");
        const existingDaySubmission = await getDoc(dayRef);
        if (existingDaySubmission.exists()) {
          alert("You have already submitted Day 3. Only one submission is allowed.");
          setSubmitted(true);
          router.replace("/leaderboard");
          return;
        }

        const quizCorrect = questions.reduce((correctCount, item, index) => {
          return correctCount + (answers[index] === item.answer ? 1 : 0);
        }, 0);

        const codeBreakerUnits = codeBreakerSuccess ? CODE_BREAKER_POINT_UNITS : 0;
        const codeBreakerPoints = codeBreakerUnits * CODE_BREAKER_POINT_PER_UNIT;

        const quizPoints = quizCorrect * QUIZ_POINT_PER_CORRECT;
        const basePoints = quizPoints + codeBreakerPoints;
        const totalCorrectCount = quizCorrect + codeBreakerUnits;
        const totalQuestionCount = questions.length + CODE_BREAKER_POINT_UNITS;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(QUIZ_TIME_SECONDS - elapsedSeconds, 0);
        const timeBonusPerCorrect = Math.floor(remainingSeconds / totalQuestionCount);
        const timeBonusPoints = totalCorrectCount * timeBonusPerCorrect;
        const rawTotalPoints = basePoints + timeBonusPoints;

        const nowForPenalty = Date.now();
        const elapsedDaysFromStart = Math.floor((nowForPenalty - CHALLENGE_START_IST) / DAY_MS);
        const currentChallengeDay = Math.min(Math.max(elapsedDaysFromStart + 1, 1), CHALLENGE_TOTAL_DAYS);
        const daysLate = Math.max(currentChallengeDay - 3, 0);
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
          day3: totalPoints,
        };

        const nextTotalPoints = Object.values(nextDayPoints).reduce(
          (sum, points) => sum + Number(points || 0),
          0
        );

        const batch = writeBatch(db);

        batch.set(
          dayRef,
          {
            day: 3,
            quizAnswers: answers,
            quizCorrect,
            quizPoints,
            codeBreakerStarted: gameStarted,
            codeBreakerSolved: codeBreakerSuccess,
            codeBreakerAttemptsUsed: guessHistory.length,
            codeBreakerPoints,
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
        console.error("Failed to submit Day 3 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, codeBreakerResolved, codeBreakerSuccess, gameStarted, guessHistory.length, router, submitted, submitting, user]
  );

  useEffect(() => {
    if (!ready || submitted || timeLeft > 0) return;
    void handleSubmit(true);
  }, [handleSubmit, ready, submitted, timeLeft]);

  function startCodeBreaker() {
    setGameStarted(true);
    setSecretCode(generateSecretCode());
    setCurrentGuess(Array(CODE_LENGTH).fill(null));
    setGuessHistory([]);
    setCodeBreakerResolved(false);
    setCodeBreakerSuccess(false);
  }

  function setGuessColor(index: number, color: CodeColor) {
    if (!gameStarted || codeBreakerResolved) return;
    setCurrentGuess(prev => {
      const next = [...prev];
      next[index] = color;
      return next;
    });
  }

  function clearGuessSlot(index: number) {
    if (!gameStarted || codeBreakerResolved) return;
    setCurrentGuess(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }

  function undoColor() {
    if (!gameStarted || codeBreakerResolved) return;
    setCurrentGuess(prev => {
      const next = [...prev];
      for (let i = CODE_LENGTH - 1; i >= 0; i -= 1) {
        if (next[i] !== null) {
          next[i] = null;
          break;
        }
      }
      return next;
    });
  }

  function submitGuess() {
    if (!gameStarted || codeBreakerResolved || currentGuess.some(color => color === null)) return;

    const resolvedGuess = currentGuess as CodeColor[];

    const result = evaluateGuess(resolvedGuess, secretCode);
    const nextHistory = [...guessHistory, { guess: resolvedGuess, exact: result.exact, colorOnly: result.colorOnly }];
    setGuessHistory(nextHistory);
    setCurrentGuess(Array(CODE_LENGTH).fill(null));

    if (result.exact === CODE_LENGTH) {
      setCodeBreakerResolved(true);
      setCodeBreakerSuccess(true);
      return;
    }

    if (nextHistory.length >= MAX_ATTEMPTS) {
      setCodeBreakerResolved(true);
      setCodeBreakerSuccess(false);
    }
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
        <p className="text-sm text-white/70">Loading Day 3 challenge...</p>
      </div>
    );
  }

  if (!TEST_FORCE_UNLOCK && nowMs < DAY_THREE_START_IST) {
    return renderPage(
      <div className="flex min-h-[70vh] items-center justify-center text-white">
        <section className="w-full max-w-2xl rounded-2xl border border-[#f47a20]/35 bg-[#0b0b0b] p-6 text-center">
          <h1 className="text-2xl font-semibold text-[#f47a20]">Day 3 Locked</h1>
          <p className="mt-3 text-sm text-white/70">Day 3 unlocks in</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCountdown(DAY_THREE_START_IST - nowMs)}</p>
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
  const allQuizAnswered = answers.every(answer => answer !== "");
  const filledGuessCount = currentGuess.filter(Boolean).length;
  const showSubmitButton = stage === "codebreaker" && codeBreakerResolved && allQuizAnswered;
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
          <h1 className="text-3xl font-semibold text-[#f47a20]">Day 3 Challenge</h1>
          <p className="mt-1 text-sm text-white/70">Quiz first, then Code Breaker mini-game</p>
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
              stage === "codebreaker"
                ? "border-[#f47a20]/70 bg-[#f47a20]/15 text-[#f47a20]"
                : "border-white/20 text-white/70"
            }`}
          >
            Stage 2: Code Breaker
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
                  setStage("codebreaker");
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
          {!gameStarted ? (
            <div className="rounded-xl border border-white/10 bg-[#111111] p-6 text-center">
              <h2 className="text-3xl font-semibold">Code Breaker</h2>
              <p className="mt-3 text-sm text-white/75">Crack the 4-color code in {MAX_ATTEMPTS} attempts.</p>
              <p className="mt-2 text-xs text-white/55">
                Exact match = right color in right spot, partial match = right color in wrong spot.
              </p>
              <button
                type="button"
                onClick={startCodeBreaker}
                className="mt-5 rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 font-semibold text-black"
              >
                Start Game
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#111111] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Code Breaker</h2>
                <p className="text-sm text-white/65">Attempt {Math.min(guessHistory.length + 1, MAX_ATTEMPTS)}/{MAX_ATTEMPTS}</p>
              </div>

              <div className="mt-4 flex items-center gap-3">
                {Array.from({ length: CODE_LENGTH }).map((_, index) => {
                  const color = currentGuess[index];
                  return (
                    <div
                      key={index}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => {
                        event.preventDefault();
                        const droppedColor = (event.dataTransfer.getData("text/plain") || draggingColor) as CodeColor | null;
                        if (!droppedColor) return;
                        setGuessColor(index, droppedColor);
                        setDraggingColor(null);
                      }}
                      onClick={() => color && clearGuessSlot(index)}
                      className={`h-12 w-12 rounded-full border-2 ${
                        color ? `${colorClass(color)} border-white/30` : "border-dashed border-white/30"
                      } ${color ? "cursor-pointer" : ""}`}
                      title={color ? "Click to clear" : "Drop color here"}
                    />
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {CODE_COLORS.map(color => (
                  <div
                    key={color}
                    draggable={!codeBreakerResolved}
                    onDragStart={event => {
                      setDraggingColor(color);
                      event.dataTransfer.setData("text/plain", color);
                    }}
                    onDragEnd={() => setDraggingColor(null)}
                    className={`h-10 w-10 rounded-full border border-white/25 ${colorClass(color)} ${
                      codeBreakerResolved ? "opacity-40" : "cursor-grab active:cursor-grabbing"
                    }`}
                    title={color}
                  />
                ))}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={undoColor}
                  disabled={codeBreakerResolved || filledGuessCount === 0}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:opacity-50"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={submitGuess}
                  disabled={codeBreakerResolved || filledGuessCount !== CODE_LENGTH}
                  className="rounded-full border border-[#f47a20] bg-[#f47a20] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  Submit
                </button>
              </div>

              {guessHistory.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {guessHistory.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {item.guess.map((color, guessIndex) => (
                          <div
                            key={`${idx}-${guessIndex}`}
                            className={`h-5 w-5 rounded-full border border-white/20 ${colorClass(color)}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-white/70">
                        Exact: {item.exact} | Partial: {item.colorOnly}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {codeBreakerResolved ? (
                <p className={`mt-4 text-sm font-semibold ${codeBreakerSuccess ? "text-emerald-300" : "text-rose-300"}`}>
                  {codeBreakerSuccess
                    ? "Code cracked! Great job."
                    : "No attempts left. Game completed (no code break bonus)."}
                </p>
              ) : null}
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
                "Confirm final submission for Day 3? You can submit only once."
              );
              if (!confirmed) return;
              void handleSubmit(false);
            }}
            className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 3"}
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
