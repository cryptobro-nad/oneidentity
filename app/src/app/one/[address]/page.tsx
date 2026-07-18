import type { Metadata } from "next";
import Link from "next/link";
import { loadProfileAction } from "@/app/verified/actions";
import { shortenAddress } from "@/lib/format";
import { OneProfileClient } from "./OneProfileClient";

/** Next 16 makes route params async; typed explicitly rather than via the
 *  generated PageProps helper so typecheck does not depend on `next typegen`. */
type OnePageProps = { params: Promise<{ address: string }> };

export async function generateMetadata(props: OnePageProps): Promise<Metadata> {
  const { address } = await props.params;
  return {
    title: `ONE ${shortenAddress(address)}`,
    description: "A public Verified ONE identity on Monad Mainnet.",
  };
}

export default async function OnePage(props: OnePageProps) {
  const { address } = await props.params;
  const result = await loadProfileAction(address);

  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink">
          {result.reason === "not-a-one" ? "Not a ONE identity" : "Could not load this identity"}
        </h1>
        <p className="mt-3 text-muted">{result.message}</p>
        <p className="mt-2 font-mono text-sm break-all text-faint">{address}</p>
        <p className="mt-6 text-sm">
          <Link href="/verified" className="text-accent hover:underline">
            Create a Verified ONE
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <OneProfileClient initial={result.profile} />
    </div>
  );
}
