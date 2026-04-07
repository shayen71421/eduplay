"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type Question = {
  id: number;
  question: string;
  options: string[];
  answer: string;
};

const QUIZ_TIME_SECONDS = 8 * 60;
const DAILY_PROBLEM_LIMIT = 280;

const questions: Question[] = [
  {
    id: 1,
    question: "Which protocol is primarily used for secure web traffic?",
    options: ["HTTP", "FTP", "HTTPS", "SMTP"],
    answer: "HTTPS",
  },
  {
    id: 2,
    question: "Which data structure uses FIFO order?",
    options: ["Stack", "Queue", "Tree", "Graph"],
    answer: "Queue",
  },
  {
    id: 3,
    question: "What does CPU stand for?",
    options: [
      "Central Process Unit",
      "Central Processing Unit",
      "Computer Primary Unit",
      "Core Processing Utility",
    ],
    answer: "Central Processing Unit",
  },
  {
    id: 4,
    question: "Which language runs in the browser?",
    options: ["Python", "Java", "C++", "JavaScript"],
    answer: "JavaScript",
  },
  {
    id: 5,
    question: "What does CSS control in a webpage?",
    options: ["Database", "Styling", "Server logs", "Routing"],
    answer: "Styling",
  },
  {
    id: 6,
    question: "Which company developed Firebase?",
    options: ["Meta", "Google", "Microsoft", "Amazon"],
    answer: "Google",
  },
  {
    id: 7,
    question: "Which one is a NoSQL database?",
    options: ["PostgreSQL", "MongoDB", "MySQL", "SQLite"],
    answer: "MongoDB",
  },
  {
    id: 8,
    question: "What is the output of 2 + 2 * 3?",
    options: ["12", "8", "10", "6"],
    answer: "8",
  },
  {
    id: 9,
    question: "What does API stand for?",
    options: [
      "Application Programming Interface",
      "Advanced Program Internet",
      "Applied Protocol Integration",
      "Application Process Input",
    ],
    answer: "Application Programming Interface",
  },
  {
    id: 10,
    question: "Which is used to uniquely identify a Firestore document?",
    options: ["Collection", "Index", "Document ID", "Field value"],
    answer: "Document ID",
  },
];

const oddOne = {
  prompt: "Find the odd one out:",
  options: ["Library", "Hostel", "Classroom", "Banana"],
  answer: "Banana",
};

export default function DayOnePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(questions.length).fill(""));
  const [selectedOdd, setSelectedOdd] = useState("");
  const [dailyProblem, setDailyProblem] = useState("");
  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_SECONDS);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    points: number;
    quizCorrect: number;
    oddCorrect: boolean;
    problemScore: number;
    elapsedSeconds: number;
    autoSubmitted: boolean;
  } | null>(null);

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

  const handleSubmit = useCallback(
    async (autoSubmitted: boolean) => {
      if (!user || submitted || submitting) return;

      const hasAnyMissingQuizAnswer = answers.some(answer => answer === "");
      if (!autoSubmitted && hasAnyMissingQuizAnswer) {
        alert("Please answer all 10 quiz questions.");
        return;
      }

      if (!autoSubmitted && !selectedOdd) {
        alert("Please select the odd one option.");
        return;
      }

      if (!autoSubmitted && dailyProblem.trim().length < 30) {
        alert("Please write at least 30 characters for the Daily Problem answer.");
        return;
      }

      setSubmitting(true);

      try {
        const quizCorrect = questions.reduce((correctCount, item, index) => {
          return correctCount + (answers[index] === item.answer ? 1 : 0);
        }, 0);

        const oddCorrect = selectedOdd === oddOne.answer;
        const problemScore = dailyProblem.trim().length >= 30 ? 10 : 0;

        const quizPoints = quizCorrect * 10;
        const oddPoints = oddCorrect ? 10 : 0;
        const totalPoints = quizPoints + oddPoints + problemScore;

        const startedAt = startRef.current ?? Date.now();
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

        const dayRef = doc(db, "users", user.uid, "days", "day1");
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
            oddOneSelected: selectedOdd,
            oddOneAnswer: oddOne.answer,
            oddOneCorrect: oddCorrect,
            dailyProblem,
            dailyProblemScore: problemScore,
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

        setResult({
          points: totalPoints,
          quizCorrect,
          oddCorrect,
          problemScore,
          elapsedSeconds,
          autoSubmitted,
        });
        setSubmitted(true);
      } catch (error) {
        console.error("Failed to submit Day 1 challenge", error);
        alert("Submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, dailyProblem, selectedOdd, submitted, submitting, user]
  );

  useEffect(() => {
    if (!ready || submitted || timeLeft > 0) return;
    void handleSubmit(true);
  }, [handleSubmit, ready, submitted, timeLeft]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-white/70">Loading Day 1 challenge...</p>
      </main>
    );
  }

  const activeQuestion = questions[currentQuestion];
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white sm:px-8 lg:px-12">
      <section className="mx-auto w-full max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-[#f47a20]">Day 1 Challenge</h1>
            <p className="mt-1 text-sm text-white/70">Quick Quiz + Mini Game + Daily Problem</p>
          </div>
          <div className="rounded-full border border-[#f47a20]/60 bg-[#f47a20]/10 px-4 py-2 text-sm font-semibold text-[#f47a20]">
            Timer: {minutes}:{seconds}
          </div>
        </div>

        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          <h2 className="text-xl font-semibold">Quick Quiz (10 Questions)</h2>
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
            <button
              type="button"
              disabled={currentQuestion === questions.length - 1}
              onClick={() => setCurrentQuestion(prev => Math.min(prev + 1, questions.length - 1))}
              className="rounded-full border border-white/20 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          <h2 className="text-xl font-semibold">Mini Game: Find the Odd One</h2>
          <p className="mt-1 text-sm text-white/70">{oddOne.prompt}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {oddOne.options.map(option => {
              const isSelected = selectedOdd === option;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={submitted}
                  onClick={() => setSelectedOdd(option)}
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
        </section>

        <section className="rounded-2xl border border-[#f47a20]/30 bg-[#0b0b0b] p-5">
          <h2 className="text-xl font-semibold">💡 Daily Problem</h2>
          <p className="mt-2 text-sm text-white/70">
            Smart Campus Navigation: Your university campus has 50+ buildings. New students often
            get lost finding classrooms, especially during the first week.
          </p>
          <p className="mt-2 text-sm text-white/70">
            Design a solution that helps students navigate the campus efficiently. What technology
            would you use and why?
          </p>

          <textarea
            value={dailyProblem}
            disabled={submitted}
            onChange={event => setDailyProblem(event.target.value.slice(0, DAILY_PROBLEM_LIMIT))}
            className="mt-4 h-36 w-full rounded-xl border border-white/15 bg-[#101010] p-3 text-sm outline-none ring-0 placeholder:text-white/35 focus:border-[#f47a20]/70"
            placeholder="Write your answer..."
          />
          <p className="mt-2 text-right text-xs text-white/55">
            {dailyProblem.length}/{DAILY_PROBLEM_LIMIT}
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-full border border-white/20 px-5 py-2 text-sm"
          >
            Back to Dashboard
          </button>
          <button
            type="button"
            disabled={submitted || submitting}
            onClick={() => void handleSubmit(false)}
            className="rounded-full border border-[#f47a20] bg-[#f47a20] px-6 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Submitting..." : submitted ? "Submitted" : "Submit Day 1"}
          </button>
        </div>

        {result ? (
          <section className="rounded-2xl border border-[#f47a20]/35 bg-[#120e0b] p-5">
            <h3 className="text-lg font-semibold text-[#f47a20]">Submission Summary</h3>
            <p className="mt-2 text-sm text-white/75">Total Points: {result.points}</p>
            <p className="mt-1 text-sm text-white/75">Quiz Correct: {result.quizCorrect}/10</p>
            <p className="mt-1 text-sm text-white/75">
              Odd One: {result.oddCorrect ? "Correct" : "Incorrect"}
            </p>
            <p className="mt-1 text-sm text-white/75">Daily Problem Score: {result.problemScore}</p>
            <p className="mt-1 text-sm text-white/75">Time Spent: {result.elapsedSeconds}s</p>
            <p className="mt-1 text-sm text-white/75">
              Submission Type: {result.autoSubmitted ? "Auto-submitted (timer ended)" : "Manual"}
            </p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
