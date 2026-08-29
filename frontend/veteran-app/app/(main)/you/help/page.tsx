import Link from "next/link";
import { IconArrowLeft, IconPhone, IconExternalLink } from "@tabler/icons-react";
import { PageContainer } from "@/components/shared/PageContainer";

export default function HelpPage() {
  return (
    <PageContainer>
      <Link href="/you" className="flex w-fit items-center gap-1 text-sm text-text-secondary">
        <IconArrowLeft size={16} aria-hidden="true" />
        Back to You
      </Link>

      <h1 className="text-2xl md:text-3xl font-medium text-text-primary">Help</h1>
      <p className="text-sm text-text-secondary">
        A path to a human, independent of the conversation in this app.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <IconPhone size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">Your VSO</p>
            <p className="text-sm text-text-secondary">
              See <Link href="/you/vso-contact" className="text-accent underline underline-offset-2">Your VSO</Link> for direct contact info.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <IconPhone size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">Veterans Crisis Line</p>
            <p className="text-sm text-text-secondary">Dial 988, then press 1 -- available any time.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
          <IconExternalLink size={20} className="shrink-0 text-text-secondary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-text-primary">VA.gov</p>
            <p className="text-sm text-text-secondary">The official source for your claim and benefits.</p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
