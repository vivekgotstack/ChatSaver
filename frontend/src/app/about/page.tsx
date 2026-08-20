import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";

export const metadata: Metadata = {
  title: "About | ChatSaver",
  description: "Learn why ChatSaver is a private, local-first workspace for ideas and knowledge.",
};

export default function AboutPage() {
  return (
    <InformationPage
      eyebrow="About ChatSaver"
      title="Your thinking deserves a place of its own."
      description="ChatSaver is a private, local-first workspace for shaping ideas, organizing knowledge, and keeping it within reach on every device."
    >
      <section>
        <h2>Built for your knowledge</h2>
        <p>
          Capture a thought on a blank page, organize questions and answers, or import selected
          conversations. You decide what belongs in the library and how it should evolve.
        </p>
      </section>
      <section>
        <h2>Local first, sync when you choose</h2>
        <p>
          Your library works from the browser&apos;s local vault. An account is optional and can
          be used to sync your saved material with the ChatSaver database for backup and recovery.
        </p>
      </section>
      <section>
        <h2>Questions or feedback?</h2>
        <p>
          We welcome product feedback and support requests at{" "}
          <a href="mailto:vivekgotstack@gmail.com">vivekgotstack@gmail.com</a>.
        </p>
      </section>
    </InformationPage>
  );
}
