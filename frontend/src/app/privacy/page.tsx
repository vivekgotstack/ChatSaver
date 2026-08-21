import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";

export const metadata: Metadata = {
  title: "Privacy Policy | ChatSaver",
  description: "How ChatSaver handles local notes, account information, and synced content.",
};

export default function PrivacyPage() {
  return (
    <InformationPage
      eyebrow="Privacy Policy · Effective August 4, 2026"
      title="Your saved knowledge stays under your control."
      description="This policy explains what ChatSaver stores, why it is used, and the choices available to you."
    >
      <section>
        <h2>Information ChatSaver handles</h2>
        <ul>
          <li>Notes, imported conversations, titles, and edits you choose to save.</li>
          <li>Email address, display name, and device information when you create an account.</li>
          <li>Authentication and sync records needed to operate account backup and recovery.</li>
        </ul>
      </section>
      <section>
        <h2>Local storage and account sync</h2>
        <p>
          ChatSaver stores your library locally in your browser so the app can work offline. If
          you sign in and sync, your selected vault data is also sent to ChatSaver&apos;s server and
          stored in its database. Essential browser storage and authentication cookies may be
          used to keep you signed in and maintain sync state.
        </p>
      </section>
      <section>
        <h2>How information is used</h2>
        <p>
          Information is used to provide the library, imports, editing, account access, syncing,
          backup, recovery, security, and support. ChatSaver does not sell your personal
          information or use your saved note content for advertising.
        </p>
      </section>
      <section>
        <h2>Private Vault</h2>
        <p>
          Private Vault is optional and separate from account sync. Its titles, links, and
          descriptions are encrypted on your device with a key derived from your six-digit PIN.
          The PIN and decrypted Private Vault content are not sent to ChatSaver&apos;s server. An
          exported Private Vault backup remains encrypted and requires its original PIN.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Local data remains on your device until you clear the vault or browser data. Synced data
          remains associated with your account until it is deleted through the app&apos;s vault
          controls or you request assistance. Some limited records may be retained when required
          for security, fraud prevention, or legal compliance.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          You can use ChatSaver locally without creating an account, choose whether to sync, export
          your vault, delete local data, and erase synced vault data through the available controls.
          For privacy questions or deletion assistance, email{" "}
          <a href="mailto:vivekgotstack@gmail.com">vivekgotstack@gmail.com</a>.
        </p>
      </section>
      <section>
        <h2>Policy updates</h2>
        <p>
          This policy may be updated as ChatSaver evolves. Material changes will be reflected on
          this page with a revised effective date.
        </p>
      </section>
    </InformationPage>
  );
}
