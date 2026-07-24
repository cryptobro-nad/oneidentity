import type { Metadata } from "next";
import { PageEyebrow } from "@/components/ui/PageEyebrow";
import { Reveal } from "@/components/motion/Reveal";
import { VerifiedModeSwitch } from "./VerifiedModeSwitch";

export const metadata: Metadata = {
  title: "Create a Verified ONE",
  description:
    "Link Monad wallets you control and create one public identity that other apps can look up. ONE never takes custody.",
};

export default function VerifiedPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 sm:px-8 sm:pt-14 sm:pb-20">
      <header className="mb-9 sm:mb-11">
        <Reveal>
          <PageEyebrow>Verified ONE</PageEyebrow>
          <h1 className="display mt-4 text-[clamp(2.4rem,5vw,3.4rem)]">
            Create a <em>Verified ONE</em>
          </h1>
          <p className="mt-5 text-[1.02rem] leading-relaxed text-ink-2">
            Bring together wallets you control into one public identity that other apps can look up.
            Choose how to link them below.
          </p>
        </Reveal>
      </header>

      <VerifiedModeSwitch />
    </div>
  );
}
