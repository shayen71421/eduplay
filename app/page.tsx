import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import FlipText from "@/components/ui/flip-text";
import HoverOutlineBadge from "@/components/hover-outline-badge";
import DotGrid from "@/components/DotGrid";
import ShapeGrid from "@/components/ShapeGrid";
import ChallengeCountdown from "@/components/challenge-countdown";
import JoinNowAuthButton from "@/components/join-now-auth-button";
import FirebaseAnalytics from "@/components/firebase-analytics";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] selection:bg-white selection:text-black">
      <FirebaseAnalytics />
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

        <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 pb-20 pt-8 sm:px-10 lg:px-14">
          <header className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center">
            <div className="flex justify-start">
              <div className="relative h-[60px] w-[224px] sm:h-[72px] sm:w-[286px] lg:h-[96px] lg:w-[350px]">
                <Image
                  src="/edsockc.png"
                  alt="IEEE Education Society Kerala Chapter"
                  fill
                  sizes="(max-width: 640px) 224px, (max-width: 1024px) 286px, 350px"
                  priority
                  className="translate-y-[2px] object-contain object-left sm:translate-y-[3px] lg:translate-y-[4px]"
                />
              </div>
            </div>
            <div className="flex justify-center">
              <div className="relative h-8 w-[118px] sm:h-9 sm:w-[160px] lg:h-10 lg:w-[188px]">
                <Image
                  src="/logo.png"
                  alt="IEEE Education Week"
                  fill
                  sizes="(max-width: 640px) 118px, (max-width: 1024px) 160px, 188px"
                  priority
                  className="object-contain object-center"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="relative h-8 w-[78px] sm:h-9 sm:w-[100px] lg:h-10 lg:w-[118px]">
                <Image
                  src="/ieee.png"
                  alt="IEEE"
                  fill
                  sizes="(max-width: 640px) 78px, (max-width: 1024px) 100px, 118px"
                  priority
                  className="object-contain object-right"
                />
              </div>
            </div>
          </header>

          <section className="relative mx-auto flex min-h-[76vh] w-full max-w-5xl flex-col items-center justify-center text-center">
            <HoverOutlineBadge className="relative inline-flex items-center rounded-full px-5 py-2 text-sm text-[#f47a20] sm:px-6 sm:text-base">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-[3px] rounded-full border border-[#f47a20]/50 shadow-[0_0_20px_rgba(244,122,32,0.3)]"
              />
              <span className="relative">
                EDSOC Kerala Chapter Initiative
              </span>
            </HoverOutlineBadge>
            <h1 className="mt-8 text-balance text-5xl font-semibold leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-[88px]">
              Edu<span className="text-[#f47a20]">Zest</span>
            </h1>
            <FlipText
              className="mt-4 text-3xl font-semibold tracking-tight text-[#f47a20] sm:text-5xl"
              duration={4}
              delay={0.03}
            >
              Learn. Play. Lead.
            </FlipText>
            <p className="mt-7 max-w-3xl text-base text-[#d4d4d8] sm:text-lg">
              This IEEE Education Week, step into an interactive world of
              quizzes, mini-games, and problem-solving.
            </p>

            <ChallengeCountdown />

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
              <Link
                href="/leaderboard"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#f47a20] bg-[#f47a20] px-4 py-2.5 text-xs font-medium text-black transition-colors hover:bg-[#ff8533] hover:border-[#ff8533] sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
              >
                Leaderboard
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <JoinNowAuthButton className="group relative inline-flex items-center justify-center overflow-hidden rounded-full border border-[#f47a20] bg-[#f47a20] px-10 py-3.5 text-sm font-semibold uppercase tracking-[0.08em] text-black shadow-[0_0_0_1px_rgba(244,122,32,0.4),0_10px_28px_rgba(244,122,32,0.4),0_0_30px_rgba(244,122,32,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#ff8533] hover:shadow-[0_0_0_1px_rgba(244,122,32,0.6),0_16px_34px_rgba(244,122,32,0.5),0_0_40px_rgba(244,122,32,0.4)] active:translate-y-0 active:scale-[0.99]" />
            </div>
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
