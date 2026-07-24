import type { Metadata } from "next";
import Link from "next/link";
import { loadV2ProfileAction } from "@/app/verified/v2actions";
import { shortenAddress } from "@/lib/format";
import { OneV2ProfileClient } from "./OneV2ProfileClient";

type PageProps = { params: Promise<{ address: string }> };

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { address } = await props.params;
  return {
    title: `ONE ${shortenAddress(address)}`,
    description: "A public Verified ONE (V2) identity on Monad Mainnet.",
  };
}

export default async function OneV2Page(props: PageProps) {
  const { address } = await props.params;
  const result = await loadV2ProfileAction(address);

  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pt-16 pb-20 sm:px-8">
        <span className="eyebrow">Verified ONE</span>
        <h1 className="display mt-3 text-[clamp(2rem,4.5vw,3rem)]">
          {result.reason === "not-a-one" ? "Not a ONE identity" : "Could not load this identity"}
        </h1>
        <p className="mt-4 max-w-[52ch] text-[1.02rem] leading-relaxed text-ink-2">{result.message}</p>
        <p className="mono mt-4 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 text-sm break-all text-ink-3">
          {address}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/verified" className="btn btn-primary">
            Create a Verified ONE
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 sm:px-8 sm:pt-14 sm:pb-20">
      <OneV2ProfileClient initial={result.profile} />
    </div>
  );
}
